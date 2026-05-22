import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { PedidoPDFTemplate } from '@/lib/pdf/pedido-template'
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

    // Cargar el pedido
    const { data: pedido, error: pedidoError } = await supabase
      .from('pedidos')
      .select('*')
      .eq('id', id)
      .single()

    if (pedidoError || !pedido) {
      return new NextResponse('Pedido no encontrado', { status: 404 })
    }

    // Cargar datos del médico firmante
    const { data: medico } = await supabase
      .from('profiles')
      .select('full_name, matricula')
      .eq('id', pedido.firmado_por)
      .single()

    const buffer = await renderToBuffer(
      React.createElement(PedidoPDFTemplate, {
        pedido,
        medico: {
          full_name: medico?.full_name ?? 'Médico',
          matricula: medico?.matricula ?? null,
        },
      }) as React.ReactElement<DocumentProps>
    )

    const nombreArchivo = `pedido_${pedido.paciente_nombre.replace(/\s+/g, '_')}_${pedido.fecha_pedido}.pdf`

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[GET /api/pedidos/[id]/pdf]', err)
    return new NextResponse('Error al generar PDF', { status: 500 })
  }
}
