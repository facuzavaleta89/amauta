import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { ConsultaIndividualPDF } from '@/lib/pdf/consulta-template'
import { cargarMedicoFirmante } from '@/lib/pdf/documentos'
import React from 'react'
import type { DocumentProps } from '@react-pdf/renderer'
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

// GET /api/consultas/[id]/pdf — PDF de una consulta individual
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new NextResponse('No autorizado', { status: 401 })

    const ctx = await getTenantContext(supabase, user.id)
    if (!ctx) return new NextResponse('Sin permisos', { status: 403 })

    // Consulta: el filtro por medico_id + la RLS de consultas garantizan el aislamiento por tenant
    const { data: consulta, error } = await supabase
      .from('consultas')
      .select('*')
      .eq('id', id)
      .eq('medico_id', ctx.tenantMedicoId)
      .single()

    if (error || !consulta) {
      return new NextResponse('Consulta no encontrada', { status: 404 })
    }

    // Paciente (cliente de sesión → RLS activa)
    const { data: paciente } = await supabase
      .from('pacientes')
      .select('nombre_completo, dni, fecha_nacimiento, obra_social_otro, numero_afiliado, obras_sociales(nombre)')
      .eq('id', consulta.paciente_id)
      .single()

    if (!paciente) return new NextResponse('Paciente no encontrado', { status: 404 })

    const obra = paciente.obras_sociales as unknown as { nombre: string } | null
    const pacienteData = {
      nombre_completo: paciente.nombre_completo,
      dni: paciente.dni,
      fecha_nacimiento: paciente.fecha_nacimiento,
      obra_social_nombre: obra?.nombre ?? paciente.obra_social_otro ?? null,
      numero_afiliado: paciente.numero_afiliado ?? null,
    }
    // Médico firmante: helper compartido (admin client; ya autorizamos el acceso arriba)
    const medicoData = await cargarMedicoFirmante(ctx.tenantMedicoId)

    const buffer = await renderToBuffer(
      React.createElement(ConsultaIndividualPDF, {
        consulta,
        paciente: pacienteData,
        medico: medicoData,
      }) as React.ReactElement<DocumentProps>
    )

    const fecha = new Date(consulta.fecha_hora).toISOString().slice(0, 10)
    const nombreArchivo = sanitizePdfFilename(`consulta_${pacienteData.nombre_completo}_${fecha}.pdf`)

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[GET /api/consultas/[id]/pdf]', err)
    return new NextResponse('Error al generar PDF', { status: 500 })
  }
}
