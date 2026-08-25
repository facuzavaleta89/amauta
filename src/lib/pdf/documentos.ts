// ============================================================================
// documentos.ts — Generación y persistencia de PDFs de pedidos y certificados.
// ----------------------------------------------------------------------------
// ⚠ SOLO SERVIDOR. Usa el admin client y renderiza @react-pdf/renderer; nunca
//   debe importarse desde un componente 'use client'.
//
// Esta es la pieza que evita duplicar la lógica de generación entre:
//   · la EMISIÓN (POST /api/pedidos, /api/certificados) → congela el PDF una vez, y
//   · la DESCARGA (GET .../[id]/pdf) → sirve el congelado o, si no existe, lo
//     regenera al vuelo SIN persistirlo (no hay backfill).
//
// Separación de responsabilidades:
//   · generarPdfDocumento()  → arma el PDF en memoria (Buffer). Puro salvo la
//     lectura del médico firmante. Lo usan tanto la emisión como el fallback.
//   · persistirPdfDocumento() → sube a Storage + escribe pdf_path/pdf_generado_at.
//     Best-effort: nunca lanza, devuelve el path o null.
//   · congelarPdfDocumento() → orquesta generar+persistir bajo un timeout, para
//     que un Storage lento no bloquee la emisión. Total (nunca rechaza).
// ============================================================================

import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import QRCode from 'qrcode'
import type { DocumentProps } from '@react-pdf/renderer'

import { createAdminClient } from '@/lib/supabase/admin'
import type { createClient as createServerClient } from '@/lib/supabase/server'
import { PedidoPDFTemplate } from '@/lib/pdf/pedido-template'
import { CertificadoPDFTemplate } from '@/lib/pdf/certificado-template'
import {
  DOCUMENTOS_BUCKET,
  buildDocumentoPath,
  type DocumentoTipo,
} from '@/lib/supabase/storage'
import type { Pedido, Certificado, EmisorSnapshot } from '@/types/pedido'
import type { Matricula } from '@/types/roles'

/** Cliente de sesión de Supabase (RLS activa), tal como lo devuelve server.ts. */
type SessionClient = Awaited<ReturnType<typeof createServerClient>>

/** Tabla destino donde vive pdf_path/pdf_generado_at por tipo de documento. */
const TABLA_POR_TIPO: Record<DocumentoTipo, 'pedidos' | 'certificados' | 'recetas'> = {
  pedido: 'pedidos',
  certificado: 'certificados',
  receta: 'recetas',
}

// ── Datos del médico firmante ────────────────────────────────────────────────
// Es el mismo shape que `EmisorSnapshot` (el snapshot que se guarda al emitir) y
// que la prop `medico` de las plantillas PDF. Se mantiene el alias por claridad de
// intención en las firmas de las funciones.
export type MedicoFirmante = EmisorSnapshot

/**
 * Lo ÚNICO que `getBaseUrl` necesita de su argumento: algo que tenga `headers`
 * con un `.get()`. Es un tipo ESTRUCTURAL a propósito, y no `NextRequest`.
 *
 * ⚠ Los dos productores de cabeceras del proyecto son paquetes DISTINTOS:
 *   · `NextRequest` de `next/server`  → Route Handlers (los 4 endpoints de PDF).
 *   · `ReadonlyHeaders` de `next/headers` → Server Components (el QR de pantalla).
 * Atar la firma a uno de los dos deja al otro afuera y obliga a un cast o a
 * duplicar la derivación — que es exactamente el bug que este tipo cierra. Es el
 * mismo criterio que el proyecto ya aplica al cliente de Supabase: se tipa por lo
 * que la función consume, no por el paquete que lo produce.
 */
type ConCabeceras = { headers: Pick<Headers, 'get'> }

/**
 * URL base para el QR de verificación. Prioriza NEXT_PUBLIC_SITE_URL (fuente de
 * verdad en Vercel), cae al header `host` solo si no está definida.
 * Esto cierra el riesgo del `Host` envenenado que quedaría grabado en un PDF
 * congelado (ver diagnóstico, Eje 4.4).
 *
 * ⚠ FUENTE ÚNICA: la usan las DOS rutas que arman la URL de `/verificar/[codigo]`
 * — el PDF (Route Handlers, pasan el `NextRequest`) y el QR de pantalla
 * (`components/shared/qr-verificacion.tsx`, pasa `{ headers: await headers() }`).
 * No derivar la base a partir de cabeceras en ningún otro lado: el componente de
 * pantalla tenía su propia copia que NO miraba la env var, así que con un `Host`
 * envenenado el QR de la pantalla y el del PDF apuntaban a sitios distintos.
 */
export function getBaseUrl(fuente?: ConCabeceras): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL
  if (fromEnv) return fromEnv.replace(/\/+$/, '') // sin barra(s) final(es)

  const host = fuente?.headers.get('host') ?? 'localhost:3000'
  const protocol =
    host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'
  return `${protocol}://${host}`
}

/** QR como data URL. Tolerante a fallos: devuelve null y el template omite el bloque. */
export async function generarQrDataUrl(verificationUrl: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(verificationUrl, { margin: 1, width: 120 })
  } catch (err) {
    console.error('[documentos] no se pudo generar el QR:', err)
    return null
  }
}

/**
 * Construye el snapshot del médico firmante leyendo `profiles` con admin client
 * (bypass RLS). ESTRICTA: lanza si la query falla o el perfil no existe. Se usa al
 * EMITIR, donde sin datos del médico no hay documento válido: preferimos abortar la
 * emisión a guardar un snapshot con defaults inventados ("Médico", sin firma).
 */
export async function construirEmisorSnapshot(firmadoPor: string): Promise<EmisorSnapshot> {
  const admin = createAdminClient()
  const { data: medico, error } = await admin
    .from('profiles')
    .select('full_name, titulo, matriculas, firma_url, logo_url')
    .eq('id', firmadoPor)
    .single()

  if (error || !medico) {
    throw new Error(
      `construirEmisorSnapshot: no se pudieron leer los datos del médico ${firmadoPor}: ` +
        (error?.message ?? 'perfil no encontrado'),
    )
  }

  return {
    full_name: medico.full_name ?? 'Médico',
    titulo: medico.titulo ?? null,
    matriculas: Array.isArray(medico.matriculas) ? (medico.matriculas as Matricula[]) : [],
    firma_url: medico.firma_url ?? null,
    logo_url: medico.logo_url ?? null,
  }
}

/**
 * Lee los datos del médico firmante desde `profiles`, LENIENTE: nunca lanza, cae a
 * defaults si algo falla. Su único uso son los PDF de consulta/HC, que NO se
 * persisten y no tienen snapshot (ahí un default es aceptable). Los documentos con
 * snapshot (pedidos/certificados) NO pasan por acá: leen su `emisor_snapshot`.
 */
export async function cargarMedicoFirmante(firmadoPor: string): Promise<MedicoFirmante> {
  try {
    return await construirEmisorSnapshot(firmadoPor)
  } catch {
    return { full_name: 'Médico', titulo: null, matriculas: [], firma_url: null, logo_url: null }
  }
}

// ── Generación del PDF (en memoria) ──────────────────────────────────────────

export async function generarPdfDocumento(
  tipo: 'pedido',
  row: Pedido,
  baseUrl: string,
): Promise<Buffer>
export async function generarPdfDocumento(
  tipo: 'certificado',
  row: Certificado,
  baseUrl: string,
): Promise<Buffer>
export async function generarPdfDocumento(
  tipo: DocumentoTipo,
  row: Pedido | Certificado,
  baseUrl: string,
): Promise<Buffer> {
  // Los datos del médico SIEMPRE salen del snapshot congelado, nunca de `profiles`
  // en vivo. Un documento sin snapshot es un bug (tras la migración 028 todos lo
  // tienen): fallamos explícito en vez de generar un PDF con datos actuales.
  const medico = row.emisor_snapshot
  if (!medico) {
    throw new Error(
      `generarPdfDocumento: ${tipo} ${row.id} no tiene emisor_snapshot; documento inválido (bug)`,
    )
  }
  const qrCodeUrl = await generarQrDataUrl(`${baseUrl}/verificar/${row.codigo_verificacion}`)

  let element: React.ReactElement<DocumentProps>
  if (tipo === 'pedido') {
    element = React.createElement(PedidoPDFTemplate, {
      pedido: row as Pedido,
      medico,
      qrCodeUrl,
    }) as React.ReactElement<DocumentProps>
  } else if (tipo === 'certificado') {
    element = React.createElement(CertificadoPDFTemplate, {
      certificado: row as Certificado,
      medico,
      qrCodeUrl,
    }) as React.ReactElement<DocumentProps>
  } else {
    // 'receta' está fuera de alcance: no hay plantilla ni emisión.
    throw new Error(`generarPdfDocumento: tipo no soportado '${tipo}'`)
  }

  return renderToBuffer(element) as Promise<Buffer>
}

// ── Persistencia (Storage + fila) ────────────────────────────────────────────

/**
 * Sube el PDF al bucket `documentos` (upsert, path determinístico) y escribe
 * pdf_path + pdf_generado_at en la fila. Usa el CLIENTE DE SESIÓN: las políticas
 * de INSERT/UPDATE del bucket y de la tabla ya exigen crear_pedidos/crear_certificados,
 * y quien emite tiene ese permiso.
 *
 * Best-effort: nunca lanza. Devuelve el path guardado o null si algo falló (el
 * documento queda emitido con pdf_path NULL y la descarga cae al fallback).
 */
export async function persistirPdfDocumento(
  tipo: DocumentoTipo,
  documentoId: string,
  medicoId: string,
  buffer: Buffer,
  supabase: SessionClient,
): Promise<string | null> {
  try {
    const path = buildDocumentoPath(medicoId, tipo, documentoId)

    const { error: uploadError } = await supabase.storage
      .from(DOCUMENTOS_BUCKET)
      .upload(path, buffer, { contentType: 'application/pdf', upsert: true })

    if (uploadError) {
      console.error(`[documentos] upload falló (${tipo} ${documentoId}):`, uploadError)
      return null
    }

    const { error: updateError } = await supabase
      .from(TABLA_POR_TIPO[tipo])
      .update({ pdf_path: path, pdf_generado_at: new Date().toISOString() })
      .eq('id', documentoId)

    if (updateError) {
      // El objeto quedó subido pero la fila sigue con pdf_path NULL: la descarga
      // regenerará al vuelo (fallback). Queda un objeto sin referencia; se registra.
      console.error(
        `[documentos] UPDATE pdf_path falló (${tipo} ${documentoId}); objeto sin referencia:`,
        path,
        updateError,
      )
      return null
    }

    return path
  } catch (err) {
    console.error(`[documentos] persistir lanzó (${tipo} ${documentoId}):`, err)
    return null
  }
}

// ── Orquestador con timeout (usado por la emisión) ───────────────────────────

/** Corre `p` con un límite de tiempo; rechaza si se pasa (el trabajo de fondo se abandona). */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout tras ${ms}ms: ${label}`)), ms)
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer))
}

/**
 * Congela el PDF al emitir: genera + persiste bajo un timeout. TOTAL — nunca
 * rechaza, así el POST puede llamarla sin envolverla y jamás falla por Storage.
 * Devuelve el path congelado, o null si algo falló o se agotó el tiempo (en ese
 * caso el documento queda emitido con pdf_path NULL).
 */
export async function congelarPdfDocumento(
  tipo: 'pedido' | 'certificado',
  row: Pedido | Certificado,
  medicoId: string,
  supabase: SessionClient,
  baseUrl: string,
  timeoutMs = 8000,
): Promise<string | null> {
  try {
    return await withTimeout(
      (async () => {
        const buffer =
          tipo === 'pedido'
            ? await generarPdfDocumento('pedido', row as Pedido, baseUrl)
            : await generarPdfDocumento('certificado', row as Certificado, baseUrl)
        return persistirPdfDocumento(tipo, row.id, medicoId, buffer, supabase)
      })(),
      timeoutMs,
      `congelar PDF ${tipo} ${row.id}`,
    )
  } catch (err) {
    console.error(`[documentos] no se pudo congelar el PDF (${tipo} ${row.id}):`, err)
    return null
  }
}
