import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { HCCompletaPDF } from '@/lib/pdf/consulta-template'
import { cargarMedicoFirmante } from '@/lib/pdf/documentos'
import React from 'react'
import type { DocumentProps } from '@react-pdf/renderer'
import { sanitizePdfFilename } from '@/lib/utils'
import { resolverObraSocial, SIN_OBRA_SOCIAL_LABEL, type ConObraSocial } from '@/lib/pacientes/obra-social'
import { resolverAcceso } from '@/lib/auth/tenant'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/pacientes/[id]/historia/pdf — PDF de la HC completa (consultas finalizadas)
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new NextResponse('No autorizado', { status: 401 })

    const acceso = await resolverAcceso(supabase, user.id, 'ver_historia_clinica')
    if (!acceso.ok) {
      const msg = acceso.motivo === 'sin-permiso' ? 'Sin permisos'
                : acceso.motivo === 'sin-tenant'  ? 'No tenés un médico asignado'
                : 'Perfil no encontrado'
      return new NextResponse(msg, { status: 403 })
    }

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
      .eq('medico_id', acceso.tenantMedicoId)
      .eq('estado', 'finalizada')
      .order('fecha_hora', { ascending: true })

    if (!consultas || consultas.length === 0) {
      return new NextResponse('No hay consultas finalizadas para exportar', { status: 404 })
    }

    const pacienteData = {
      nombre_completo: paciente.nombre_completo,
      dni: paciente.dni,
      fecha_nacimiento: paciente.fecha_nacimiento,
      // ⚠ La aserción reemplaza al cast previo: sin tipos generados de `Database`,
      // supabase-js infiere el embebido como ARRAY y PostgREST devuelve un OBJETO.
      // El fallback hace que la fila "Obra Social" del PDF deje de OMITIRSE para los
      // pacientes particulares: el template la pinta con una guarda
      // `{paciente.obra_social_nombre && …}`, así que con `null` desaparecía entera.
      // ⚠ Esto NO es un snapshot: el PDF de consulta/HC se genera AL VUELO en cada
      // descarga, leyendo al paciente en vivo. No hay nada congelado que corregir.
      obra_social_nombre: resolverObraSocial(paciente as unknown as ConObraSocial) ?? SIN_OBRA_SOCIAL_LABEL,
      numero_afiliado: paciente.numero_afiliado ?? null,
    }
    // Médico firmante: helper compartido (admin client; ya autorizamos el acceso arriba)
    const medicoData = await cargarMedicoFirmante(acceso.tenantMedicoId)

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
