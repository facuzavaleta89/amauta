import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DOCUMENTOS_BUCKET } from '@/lib/supabase/storage'
import { generarPdfDocumento, getBaseUrl } from '@/lib/pdf/documentos'
import { buildDocumentoFilename } from '@/lib/pdf/filename'
import type { Certificado } from '@/types/pedido'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new NextResponse('No autorizado', { status: 401 })

    // Cargar el certificado (RLS aísla por tenant y exige ver_certificados)
    const { data: certificado, error } = await supabase
      .from('certificados')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !certificado) {
      return new NextResponse('Certificado no encontrado', { status: 404 })
    }

    const nombreArchivo = buildDocumentoFilename(
      'certificado',
      certificado.paciente_nombre,
      certificado.fecha_certificado,
    )
    const headers = {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
      'Cache-Control': 'no-store',
    }

    // ── 1) PDF congelado: servir el objeto del bucket (proxy, sin exponer la URL) ──
    if (certificado.pdf_path) {
      const { data: blob, error: dlErr } = await supabase.storage
        .from(DOCUMENTOS_BUCKET)
        .download(certificado.pdf_path)

      if (!dlErr && blob) {
        const arrayBuffer = await blob.arrayBuffer()
        return new NextResponse(new Uint8Array(arrayBuffer), { status: 200, headers })
      }
      // No romper la descarga: log y caer al fallback de regeneración.
      console.error('[GET /api/certificados/[id]/pdf] pdf_path presente pero la descarga falló; regenerando:', certificado.pdf_path, dlErr)
    }

    // ── 2) Fallback: regenerar al vuelo. NO se escribe pdf_path (sin backfill). ──
    const buffer = await generarPdfDocumento('certificado', certificado as Certificado, getBaseUrl(req))
    return new NextResponse(new Uint8Array(buffer), { status: 200, headers })
  } catch (err) {
    console.error('[GET /api/certificados/[id]/pdf]', err)
    return new NextResponse('Error al generar PDF', { status: 500 })
  }
}
