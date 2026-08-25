/**
 * QRVerificacion — Server Component
 *
 * Genera un QR de verificación para pedidos y certificados.
 * Se renderiza en el servidor usando la librería `qrcode` (ya instalada).
 * La URL generada apunta a la página pública /verificar/[codigo].
 *
 * ⚠ La URL base sale de `getBaseUrl`, la MISMA función que usan los Route Handlers
 * que generan el PDF — no de una derivación propia. Antes este componente leía el
 * header `host` a secas, SIN mirar `NEXT_PUBLIC_SITE_URL`: como el `host` lo controla
 * quien hace el request, un `Host` envenenado hacía que el QR de la pantalla
 * apuntara a otro sitio que el del PDF. Ver nota técnica 11 de CLAUDE.md.
 */

import QRCode from 'qrcode'
import { headers } from 'next/headers'
import { QrCode } from 'lucide-react'

import { getBaseUrl } from '@/lib/pdf/documentos'

interface QRVerificacionProps {
  codigo: string
  estado: 'emitido' | 'revocado'
}

export async function QRVerificacion({ codigo, estado }: QRVerificacionProps) {
  // `headers()` devuelve un `ReadonlyHeaders`, no un `NextRequest`: se le pasa a
  // `getBaseUrl` envuelto en la forma que el helper consume. Solo se usa como
  // FALLBACK — si `NEXT_PUBLIC_SITE_URL` está definida, el helper ni lo mira.
  const baseUrl = getBaseUrl({ headers: await headers() })

  const verificationUrl = `${baseUrl}/verificar/${codigo}`

  let qrDataUrl: string | null = null
  try {
    qrDataUrl = await QRCode.toDataURL(verificationUrl, {
      margin: 1,
      width: 120,
      color: {
        dark: '#1e2d24',
        light: '#ffffff',
      },
    })
  } catch {
    // Si falla la generación, mostramos solo el código textual
  }

  return (
    <div className="flex items-center gap-4 bg-muted/40 border border-border/60 rounded-xl px-5 py-4">
      <div className="shrink-0">
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- src es un data-URI generado en el server con QRCode.toDataURL(); next/image no optimiza data-URIs
          <img
            src={qrDataUrl}
            alt={`QR de verificación: ${codigo}`}
            className="w-20 h-20 rounded-md"
          />
        ) : (
          <div className="w-20 h-20 rounded-md bg-muted flex items-center justify-center">
            <QrCode className="w-8 h-8 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
          Verificación de autenticidad
        </p>
        <p className="text-sm text-foreground leading-snug">
          Escaneá el código QR para verificar que este documento es auténtico y{' '}
          {estado === 'revocado' ? (
            <span className="text-destructive-strong font-semibold">consultar su estado actual (anulado)</span>
          ) : (
            <span>conocer su estado actual</span>
          )}
          .
        </p>
        <p className="text-xs text-muted-foreground font-mono mt-2 truncate">
          Código: <span className="font-bold tracking-wider">{codigo.toUpperCase()}</span>
        </p>
      </div>
    </div>
  )
}
