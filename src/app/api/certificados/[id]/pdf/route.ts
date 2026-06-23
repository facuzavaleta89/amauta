import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { renderToBuffer } from '@react-pdf/renderer'
import { CertificadoPDFTemplate } from '@/lib/pdf/certificado-template'
import React from 'react'
import type { DocumentProps } from '@react-pdf/renderer'
import { sanitizePdfFilename } from '@/lib/utils'

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

    // Cargar datos del médico firmante con admin client para evitar RLS
    const admin = createAdminClient()
    const { data: medico } = await admin
      .from('profiles')
      .select('full_name, titulo, matriculas, firma_url, logo_url')
      .eq('id', certificado.firmado_por)
      .single()

    // Generar la URL de verificación
    const host = _req.headers.get('host') || 'localhost:3000'
    const protocol = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'
    const verificationUrl = `${protocol}://${host}/verificar/${certificado.codigo_verificacion}`

    // Generar el código QR
    let qrCodeUrl: string | null = null
    try {
      const QRCode = require('qrcode')
      qrCodeUrl = await QRCode.toDataURL(verificationUrl, { margin: 1, width: 120 })
    } catch (qrErr) {
      console.error('Error generating QR code:', qrErr)
    }

    const buffer = await renderToBuffer(
      React.createElement(CertificadoPDFTemplate, {
        certificado,
        medico: {
          full_name: medico?.full_name ?? 'Médico',
          titulo: medico?.titulo ?? null,
          matriculas: Array.isArray(medico?.matriculas) ? medico.matriculas : [],
          firma_url: medico?.firma_url ?? null,
          logo_url: medico?.logo_url ?? null,
        },
        qrCodeUrl,
      }) as React.ReactElement<DocumentProps>
    )

    const rawNombre = `certificado_${certificado.tipo}_${certificado.paciente_nombre}_${certificado.fecha_certificado}.pdf`
    const nombreArchivo = sanitizePdfFilename(rawNombre)

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
