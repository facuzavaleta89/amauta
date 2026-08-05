import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'
import type { TurnoParaRecordatorio } from '@/types'

/**
 * Compara dos strings en tiempo constante (evita timing attacks sobre el secreto).
 * Si las longitudes difieren, devuelve false sin lanzar (timingSafeEqual exige buffers
 * del mismo largo). La longitud de "Bearer <secret>" es conocida, así que no filtra nada.
 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export async function GET(request: NextRequest) {
  try {
    // El cron siempre requiere autenticación.
    // CRON_SECRET debe estar definida en las variables de entorno de producción.
    const authHeader = request.headers.get('authorization')
    const secret = process.env.CRON_SECRET
    if (!secret || !authHeader || !safeEqual(authHeader, `Bearer ${secret}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Initialize Supabase with service role to bypass RLS for a background job
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // ── Limpieza de rate_limits (ventanas ya cerradas: > 1 hora) ──────────────
    // Se corre en CADA invocación del cron, ANTES de la lógica de recordatorios, para
    // que se ejecute también en los crons "vacíos" (sin turnos, que hoy hacen return
    // temprano). Aislada en su propio try/catch: un fallo acá NO rompe el resto.
    try {
      const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const { error: cleanupError } = await supabase
        .from('rate_limits')
        .delete()
        .lt('window_start', cutoff)
      if (cleanupError) {
        console.error('[CRON] limpieza de rate_limits falló:', cleanupError)
      }
    } catch (cleanupErr) {
      console.error('[CRON] limpieza de rate_limits lanzó:', cleanupErr)
    }

    // Calculate dates exactly between +24h and +25h (depending oncron interval)
    // The safest is checking anything in the next 24 Hours that hasn't been sent
    const now = new Date()
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    const { data: turnos, error } = await supabase
      .from('turnos')
      .select('*, paciente:paciente_id(nombre_completo, email, telefono)')
      .eq('estado', 'pendiente')
      .eq('recordatorio_enviado', false)
      .gte('fecha_inicio', now.toISOString())
      .lte('fecha_inicio', tomorrow.toISOString())
      .overrideTypes<TurnoParaRecordatorio[], { merge: false }>()

    if (error) throw error

    if (!turnos || turnos.length === 0) {
      return NextResponse.json({ message: 'No hay recordatorios pendientes' }, { status: 200 })
    }

    const resultados = []

    for (const t of turnos) {
      // TODO: Reemplazar esta simulación por Resend/Nodemailer
      // NO loguear datos personales del paciente en consola (Ley 25.326)
      console.log(`[CRON] Procesando recordatorio para turno ${t.id}`)

      const pacienteNombre = t.paciente ? t.paciente.nombre_completo : (t.paciente_nombre_libre || 'el paciente')

      // 2. Marcar como enviado
      const { error: updateError } = await supabase
        .from('turnos')
        .update({ recordatorio_enviado: true })
        .eq('id', t.id)

      if (updateError) {
        console.error(`Error actualizando turno ${t.id}`, updateError)
        continue
      }

      // 3. Crear una alerta para el médico en el panel de su app (opcional, sirve para testear)
      await supabase.from('notificaciones').insert({
        medico_id: t.medico_id,
        titulo: '📬 Recordatorio Enviado',
        mensaje: `Se envió automáticamente el recordatorio de 24hs a ${pacienteNombre} para el turno de mañana.`,
        tipo: 'recordatorio_enviado',
        payload: { turno_id: t.id }
      })

      resultados.push(t.id)
    }

    return NextResponse.json({
      message: `Recordatorios enviados: ${resultados.length}`,
      ids: resultados
    }, { status: 200 })

  } catch (error) {
    console.error('Error cron recordatorios:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
