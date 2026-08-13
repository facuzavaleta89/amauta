import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { difusionEnvioSchema } from '@/lib/validations/difusion.schema'
import { DIFUSION_LIMITE_DIARIO } from '@/constants/difusion'
import { sendEmail } from '@/lib/email/resend'
import { renderDifusionEmailHtml } from '@/lib/email/difusion-template'
import { resolverTenant } from '@/lib/auth/tenant'

// El SDK de Resend requiere runtime Node (no Edge).
export const runtime = 'nodejs'

/** Pausa entre envíos para respetar el rate del API de Resend (~2/s). */
const SEND_GAP_MS = 600

const emailFormat = z.string().email()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Mismo patrón que src/app/api/difusion/route.ts y [id]/route.ts.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const rl = await rateLimit(request, { key: `difusion_enviar:${user.id}`, limit: 10, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    // Control tenant-only (cualquier miembro del tenant puede enviar; sin chequeo de rol).
    const tenantMedicoId = await resolverTenant(supabase, user.id)
    if (!tenantMedicoId) return NextResponse.json({ error: 'Sin tenant asignado' }, { status: 403 })

    // ── Validar body ─────────────────────────────────────────────
    const body = await request.json()
    const parsed = difusionEnvioSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.format() }, { status: 400 })
    }
    const { post_id, destinatario_ids } = parsed.data

    // ── Cargar el post (verificando pertenencia al tenant) ───────
    const { data: post, error: postError } = await supabase
      .from('difusion_posts')
      .select('id, titulo, contenido, asunto_email, estado, medico_id')
      .eq('id', post_id)
      .eq('medico_id', tenantMedicoId)
      .single()

    if (postError || !post) {
      return NextResponse.json({ error: 'Comunicado no encontrado o sin permisos' }, { status: 404 })
    }
    if (post.estado === 'enviado') {
      return NextResponse.json({ error: 'Este comunicado ya fue enviado.' }, { status: 409 })
    }

    const asunto = post.asunto_email?.trim()
    if (!asunto) {
      return NextResponse.json(
        { error: 'El comunicado no tiene asunto de email. Editalo y agregá un asunto antes de enviar.' },
        { status: 400 },
      )
    }

    // ── Cargar destinatarios válidos (no confiar en los ids del cliente) ──
    // Filtrado en la query: del tenant, activos y con email no nulo. Además se valida
    // el FORMATO del email; los malformados se descartan (no se intentan, no ensucian el log).
    const { data: pacientes, error: pacientesError } = await supabase
      .from('pacientes')
      .select('id, email')
      .eq('creado_por', tenantMedicoId)
      .is('archivado_at', null)
      .not('email', 'is', null)
      .in('id', destinatario_ids)

    if (pacientesError) {
      console.error('[difusion/enviar] error cargando pacientes:', pacientesError)
      return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
    }

    const destinatarios = (pacientes ?? [])
      .map((p) => ({ id: p.id, email: (p.email ?? '').trim() }))
      .filter((p) => emailFormat.safeParse(p.email).success)

    if (destinatarios.length === 0) {
      return NextResponse.json(
        { error: 'Ninguno de los destinatarios seleccionados tiene un email válido.' },
        { status: 400 },
      )
    }

    // ── Verificación del límite diario (por tenant) ──────────────
    // difusion_envios queda acotado al tenant por su RLS (envios_select), así que este
    // count con el cliente de sesión ya es tenant-scoped. Contamos filas con enviado_at
    // dentro del día actual.
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    const { count: enviadosHoy, error: countError } = await supabase
      .from('difusion_envios')
      .select('id', { count: 'exact', head: true })
      .gte('enviado_at', startOfDay.toISOString())

    if (countError) {
      console.error('[difusion/enviar] error contando envíos del día:', countError)
      return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
    }

    const yaHoy = enviadosHoy ?? 0
    if (yaHoy + destinatarios.length > DIFUSION_LIMITE_DIARIO) {
      return NextResponse.json(
        {
          error: `Se superaría el límite diario de envíos (${DIFUSION_LIMITE_DIARIO}). Hoy ya se enviaron ${yaHoy} y este envío intentaba ${destinatarios.length}. Reducí la lista de destinatarios o esperá al día siguiente.`,
          enviados_hoy: yaHoy,
          intentaba: destinatarios.length,
          limite: DIFUSION_LIMITE_DIARIO,
        },
        { status: 429 },
      )
    }

    // ── Envío secuencial. Un fallo individual NO corta el loop. ──
    const html = renderDifusionEmailHtml({ titulo: post.titulo, contenido: post.contenido })

    let exitosos = 0
    let fallidos = 0
    const errores: { paciente_id: string; email: string; error: string }[] = []

    for (let i = 0; i < destinatarios.length; i++) {
      const p = destinatarios[i]
      const result = await sendEmail({ to: p.email, subject: asunto, html })

      const { error: insertError } = await supabase.from('difusion_envios').insert({
        post_id: post.id,
        paciente_id: p.id,
        email_destino: p.email,
        canal: 'email',
        enviado_ok: result.ok,
        error_msg: result.ok ? null : (result.error ?? 'Error desconocido'),
        enviado_at: new Date().toISOString(),
        enviado_por: user.id,
      })
      if (insertError) {
        // El registro del historial falló, pero el email pudo haberse enviado igual: se loguea.
        console.error('[difusion/enviar] no se pudo registrar el envío en difusion_envios:', p.id, insertError)
      }

      if (result.ok) {
        exitosos++
      } else {
        fallidos++
        errores.push({ paciente_id: p.id, email: p.email, error: result.error ?? 'Error desconocido' })
      }

      // Pausa entre envíos (no después del último).
      if (i < destinatarios.length - 1) await sleep(SEND_GAP_MS)
    }

    // ── Si al menos uno salió bien, el post pasa a 'enviado'. ─────
    if (exitosos > 0) {
      const { error: updateError } = await supabase
        .from('difusion_posts')
        .update({ estado: 'enviado' })
        .eq('id', post.id)
        .eq('medico_id', tenantMedicoId)
      if (updateError) {
        console.error('[difusion/enviar] no se pudo marcar el post como enviado:', post.id, updateError)
      }
    }

    return NextResponse.json({
      intentados: destinatarios.length,
      exitosos,
      fallidos,
      errores,
    })
  } catch (err) {
    console.error('[POST /api/difusion/enviar]', err)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
