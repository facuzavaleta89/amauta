import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { pacienteSchema } from '@/lib/validations/paciente.schema'
import { uuidSchema } from '@/lib/validations/shared'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

interface RouteContext {
  params: Promise<{ id: string }>
}

async function getTenantMedicoId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, medico_id')
    .eq('id', userId)
    .single()

  if (!profile) return null
  return profile.role === 'medico' ? userId : profile.medico_id ?? null
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params

    // Validar UUID
    const idValidation = uuidSchema.safeParse(id)
    if (!idValidation.success) {
      return NextResponse.json({ error: 'ID de paciente inválido' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Rate Limiting
    const rl = await rateLimit(request, { key: `paciente_get_one:${user.id}`, limit: 120, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const tenantMedicoId = await getTenantMedicoId(supabase, user.id)
    if (!tenantMedicoId) {
      return NextResponse.json({ error: 'Sin tenant asignado' }, { status: 403 })
    }

    const { data: paciente, error } = await supabase
      .from('pacientes')
      .select('*, obras_sociales ( nombre )')
      .eq('id', id)
      .eq('creado_por', tenantMedicoId)
      .single()

    if (error || !paciente) {
      return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 })
    }

    return NextResponse.json({ data: paciente })
  } catch (error) {
    console.error('Error GET /api/pacientes/[id]:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params

    // Validar UUID
    const idValidation = uuidSchema.safeParse(id)
    if (!idValidation.success) {
      return NextResponse.json({ error: 'ID de paciente inválido' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Rate Limiting
    const rl = await rateLimit(request, { key: `paciente_patch:${user.id}`, limit: 30, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    const tenantMedicoId = await getTenantMedicoId(supabase, user.id)
    if (!tenantMedicoId) {
      return NextResponse.json({ error: 'Sin tenant asignado' }, { status: 403 })
    }

    // Verificar pertenencia al tenant antes de actualizar
    const { data: existing, error: findError } = await supabase
      .from('pacientes')
      .select('id')
      .eq('id', id)
      .eq('creado_por', tenantMedicoId)
      .single()

    if (findError || !existing) {
      return NextResponse.json({ error: 'Paciente no encontrado o sin permisos' }, { status: 404 })
    }

    const body = await request.json()
    const result = pacienteSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: result.error.format() },
        { status: 400 }
      )
    }

    const { data: paciente, error } = await supabase
      .from('pacientes')
      .update(result.data)
      .eq('id', id)
      .eq('creado_por', tenantMedicoId)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Ya existe otro paciente con ese DNI' },
          { status: 400 }
        )
      }
      console.error('Error actualizando paciente:', error)
      return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
    }

    return NextResponse.json({ data: paciente })
  } catch (error) {
    console.error('Error PATCH /api/pacientes/[id]:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

// DELETE /api/pacientes/[id]
// Borrado físico de EXCEPCIÓN: SOLO para pacientes sin ninguna actuación registrada.
// EXCLUSIVO DEL MÉDICO. Si el paciente tiene cualquier actuación (consultas, HC,
// estudios, evoluciones, turnos, pedidos, certificados, recetas) → 409, hay que archivarlo.
// Ley 26.529: la documentación clínica se conserva; esto es solo para altas erróneas.
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params

    // Validar UUID
    const idValidation = uuidSchema.safeParse(id)
    if (!idValidation.success) {
      return NextResponse.json({ error: 'ID de paciente inválido' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Rate Limiting
    const rl = await rateLimit(request, { key: `paciente_delete:${user.id}`, limit: 10, windowMs: 60_000 })
    if (!rl.success) return rateLimitResponse(rl.retryAfter!)

    // Validar explícitamente que el usuario sea médico (no confiar solo en RLS).
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'medico') {
      return NextResponse.json(
        { error: 'Solo el médico titular puede eliminar pacientes' },
        { status: 403 }
      )
    }

    // El médico es dueño del tenant: su id es el creado_por de sus pacientes.
    const { data: existing, error: findError } = await supabase
      .from('pacientes')
      .select('id')
      .eq('id', id)
      .eq('creado_por', user.id)
      .single()

    if (findError || !existing) {
      return NextResponse.json({ error: 'Paciente no encontrado o sin permisos' }, { status: 404 })
    }

    // ── Verificar ausencia TOTAL de actuaciones ────────────────────────────────
    // Con admin client (bypass RLS) para que ninguna fila oculta por RLS genere un
    // falso negativo: las tablas CASCADE (consultas/estudios/evoluciones) NO bloquean
    // el borrado a nivel de FK, así que este conteo es la única barrera real contra la
    // pérdida silenciosa de datos clínicos.
    //
    // NOTA: historia_clinica NO cuenta como actuación. Se crea vacía (sin consultas)
    // junto con el paciente, así que siempre hay 1 fila; incluirla bloquearía el
    // borrado de cualquier paciente. La unidad de actuación clínica es la CONSULTA.
    // Al hacer el DELETE físico, el FK CASCADE de historia_clinica borra esa fila vacía.
    const admin = createAdminClient()
    const tablasHijas = [
      'consultas',
      'estudios',
      'evoluciones',
      'turnos',
      'pedidos',
      'certificados',
      'recetas',
    ] as const

    const counts = await Promise.all(
      tablasHijas.map((tabla) =>
        admin.from(tabla).select('id', { count: 'exact', head: true }).eq('paciente_id', id)
      )
    )

    for (let i = 0; i < counts.length; i++) {
      const { count, error } = counts[i]
      if (error) {
        console.error(`Error contando ${tablasHijas[i]} del paciente:`, error)
        return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
      }
      if ((count ?? 0) > 0) {
        return NextResponse.json(
          { error: 'El paciente tiene actuaciones registradas; archivalo en lugar de eliminarlo.' },
          { status: 409 }
        )
      }
    }

    // ── Limpieza defensiva de Storage ──────────────────────────────────────────
    // Ruta real de los objetos (migración 026): {medico_id}/{paciente_id}/{uuid}.{ext}.
    // El médico es el tenant, así que el prefijo del paciente es `${user.id}/${id}`.
    // Aunque "sin estudios" es condición para llegar acá, evitamos dejar huérfanos.
    // No abortamos el borrado del paciente por un fallo de Storage; solo lo registramos.
    const estudiosPrefix = `${user.id}/${id}`
    try {
      const { data: archivos, error: listError } = await admin.storage
        .from('estudios')
        .list(estudiosPrefix)
      if (listError) {
        console.error(`Error listando Storage (${estudiosPrefix}) del paciente ${id}:`, listError)
      } else if (archivos && archivos.length > 0) {
        const { error: removeError } = await admin.storage
          .from('estudios')
          .remove(archivos.map((f) => `${estudiosPrefix}/${f.name}`))
        if (removeError) {
          console.error(`Error borrando objetos de Storage (${estudiosPrefix}) del paciente ${id}:`, removeError)
        }
      }
    } catch (storageErr) {
      console.error(`Error limpiando Storage (${estudiosPrefix}) del paciente ${id}:`, storageErr)
    }

    // ── Borrado físico (RLS + rol ya validados como doble capa) ─────────────────
    const { error } = await supabase
      .from('pacientes')
      .delete()
      .eq('id', id)
      .eq('creado_por', user.id)

    if (error) {
      console.error('Error eliminando paciente:', error)
      return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error DELETE /api/pacientes/[id]:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}
