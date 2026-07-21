import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { renderToBuffer } from '@react-pdf/renderer'
import { HCCompletaPDF } from '@/lib/pdf/consulta-template'
import React from 'react'
import type { DocumentProps } from '@react-pdf/renderer'
import type { Matricula } from '@/types/roles'
import { sanitizePdfFilename } from '@/lib/utils'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * Resuelve el tenant del usuario y valida el permiso ver_historia_clinica.
 * Devuelve null si no está autorizado (médico → siempre; asistente → solo con el permiso).
 */
async function getTenantContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, medico_id, ver_historia_clinica')
    .eq('id', userId)
    .single()

  if (!profile) return null
  if (profile.role === 'asistente' && !profile.ver_historia_clinica) return null

  const tenantMedicoId =
    profile.role === 'medico' ? userId :
    profile.role === 'asistente' ? profile.medico_id :
    null

  return tenantMedicoId ? { tenantMedicoId } : null
}

// GET /api/pacientes/[id]/historia/pdf — PDF de la HC completa (consultas finalizadas)
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new NextResponse('No autorizado', { status: 401 })

    const ctx = await getTenantContext(supabase, user.id)
    if (!ctx) return new NextResponse('Sin permisos', { status: 403 })

    // Paciente (cliente de sesión → RLS activa: aísla por tenant)
    const { data: paciente } = await supabase
      .from('pacientes')
      .select('nombre_completo, dni, fecha_nacimiento, obra_social_otro, numero_afiliado, obras_sociales(nombre)')
      .eq('id', id)
      .single()

    if (!paciente) return new NextResponse('Paciente no encontrado', { status: 404 })

    // Consultas finalizadas del paciente, dentro del tenant, orden cronológico
    const { data: consultas } = await supabase
      .from('consultas')
      .select('*')
      .eq('paciente_id', id)
      .eq('medico_id', ctx.tenantMedicoId)
      .eq('estado', 'finalizada')
      .order('fecha_hora', { ascending: true })

    if (!consultas || consultas.length === 0) {
      return new NextResponse('No hay consultas finalizadas para exportar', { status: 404 })
    }

    // Médico firmante: admin client (ya autorizamos el acceso arriba)
    const admin = createAdminClient()
    const { data: medico } = await admin
      .from('profiles')
      .select('full_name, titulo, matriculas, firma_url, logo_url')
      .eq('id', ctx.tenantMedicoId)
      .single()

    const obra = paciente.obras_sociales as unknown as { nombre: string } | null
    const pacienteData = {
      nombre_completo: paciente.nombre_completo,
      dni: paciente.dni,
      fecha_nacimiento: paciente.fecha_nacimiento,
      obra_social_nombre: obra?.nombre ?? paciente.obra_social_otro ?? null,
      numero_afiliado: paciente.numero_afiliado ?? null,
    }
    const medicoData = {
      full_name: medico?.full_name ?? 'Médico',
      titulo: medico?.titulo ?? null,
      matriculas: Array.isArray(medico?.matriculas) ? (medico.matriculas as Matricula[]) : [],
      firma_url: medico?.firma_url ?? null,
      logo_url: medico?.logo_url ?? null,
    }

    const buffer = await renderToBuffer(
      React.createElement(HCCompletaPDF, {
        consultas,
        paciente: pacienteData,
        medico: medicoData,
      }) as React.ReactElement<DocumentProps>
    )

    const nombreArchivo = sanitizePdfFilename(`HC_completa_${pacienteData.nombre_completo}.pdf`)

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[GET /api/pacientes/[id]/historia/pdf]', err)
    return new NextResponse('Error al generar PDF', { status: 500 })
  }
}
