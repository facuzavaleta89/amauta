import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { ConsultaIndividualPDF } from '@/lib/pdf/consulta-template'
import { cargarMedicoFirmante } from '@/lib/pdf/documentos'
import React from 'react'
import type { DocumentProps } from '@react-pdf/renderer'
import { sanitizePdfFilename } from '@/lib/utils'
import { resolverObraSocial, SIN_OBRA_SOCIAL_LABEL, type ConObraSocial } from '@/lib/pacientes/obra-social'
import { resolverAcceso } from '@/lib/auth/tenant'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/consultas/[id]/pdf — PDF de una consulta individual
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

    // Consulta: el filtro por medico_id + la RLS de consultas garantizan el aislamiento por tenant
    const { data: consulta, error } = await supabase
      .from('consultas')
      .select('*')
      .eq('id', id)
      .eq('medico_id', acceso.tenantMedicoId)
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
