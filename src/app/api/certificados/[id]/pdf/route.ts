import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { CertificadoPDFTemplate } from '@/lib/pdf/certificado-template'
import React from 'react'
import type { DocumentProps } from '@react-pdf/renderer'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new NextResponse('No autorizado', { status: 401 })

    const { data: certificado, error } = await supabase
      .from('certificados')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !certificado) {
      return new NextResponse('Certificado no encontrado', { status: 404 })
    }

    const { data: medico } = await supabase
      .from('profiles')
      .select('full_name, matricula')
      .eq('id', certificado.firmado_por)
      .single()

    const buffer = await renderToBuffer(
      React.createElement(CertificadoPDFTemplate, {
        certificado,
        medico: {
          full_name: medico?.full_name ?? 'Médico',
          matricula: medico?.matricula ?? null,
        },
      }) as React.ReactElement<DocumentProps>
    )

    const nombreArchivo = `certificado_${certificado.tipo}_${certificado.paciente_nombre.replace(/\s+/g, '_')}_${certificado.fecha_certificado}.pdf`

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[GET /api/certificados/[id]/pdf]', err)
    return new NextResponse('Error al generar PDF', { status: 500 })
  }
}
