import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimitAction, getIpFromHeaders } from '@/lib/rate-limit'
import { formatFechaLarga, hoyAR } from '@/lib/utils/format-date'
import { XCircle, AlertTriangle, ShieldCheck, User, Calendar, FileText, Award, Clock } from 'lucide-react'
import React from 'react'

interface PageProps {
  params: Promise<{ codigo: string }>
}

interface Matricula {
  tipo: string
  numero: string
}

// Forma del retorno de la función SQL verificar_documento(codigo).
// ⚠ No expone datos sensibles: el DNI viene enmascarado (paciente_dni_masked)
// y NO se devuelve el contenido clínico del documento. Ver migración 025.
interface DocumentoVerificado {
  id: string
  tipo_documento: 'certificado' | 'pedido'
  fecha_emision: string
  medico_nombre: string
  medico_titulo: string | null
  medico_matriculas: Matricula[] | null
  paciente_nombre: string
  paciente_dni_masked: string | null
  estado: 'emitido' | 'revocado'
  valido_hasta: string | null
}

function formatMatriculas(matriculas: unknown): string | null {
  if (!matriculas) return null
  const arr = Array.isArray(matriculas) ? matriculas : JSON.parse(JSON.stringify(matriculas))
  if (!Array.isArray(arr) || arr.length === 0) return null
  const formateadas = arr
    .filter((m): m is { tipo: string; numero: string | number } => {
      if (typeof m !== 'object' || m === null) return false
      if (!('tipo' in m) || !('numero' in m)) return false
      const tipo = (m as Record<string, unknown>).tipo
      const numero = (m as Record<string, unknown>).numero
      return typeof tipo === 'string' && (typeof numero === 'string' || typeof numero === 'number')
    })
    .map((m) => `${m.tipo} ${m.numero}`)
    .join('  |  ')
  return formateadas.length > 0 ? formateadas : null
}

export default async function VerificarDocumentoPage({ params }: PageProps) {
  const { codigo } = await params

  // Rate limit: 30 verificaciones por minuto por IP (endpoint público → mitiga
  // enumeración/scraping de códigos). Fail-open: si la RPC falla, se permite.
  const ip = await getIpFromHeaders()
  const rl = await rateLimitAction({ key: `verificar:${ip}`, limit: 30, windowMs: 60 * 1000 })
  if (!rl.success) {
    // Respuesta amable y NEUTRA: no revela si el código existe o no.
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-slate-200">
          <div className="w-16 h-16 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <Clock className="w-10 h-10" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">
            Demasiadas solicitudes
          </h1>
          <p className="text-sm text-slate-500">
            Recibimos muchas verificaciones desde tu conexión. Esperá un momento y volvé a intentar.
          </p>
        </div>
      </div>
    )
  }

  const supabase = createAdminClient()

  // Llamar a la función RPC de verificación
  const { data: results, error } = await supabase.rpc('verificar_documento', {
    codigo: codigo.toUpperCase().trim()
  })

  const doc: DocumentoVerificado | null =
    results && results.length > 0 ? (results[0] as DocumentoVerificado) : null

  if (error || !doc) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-slate-200">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-10 h-10" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">
            Verificación Fallida
          </h1>
          <p className="text-sm text-slate-500 mb-6">
            El código ingresado no corresponde a ningún documento médico emitido por nuestro sistema o es inválido.
          </p>
          <div className="bg-slate-100 rounded-lg p-3 font-mono text-xs text-slate-600 uppercase tracking-wider">
            Código: {codigo}
          </div>
        </div>
      </div>
    )
  }

  // Verificar expiración si existe valido_hasta
  // ⚠⚠ Server Component en la ruta PÚBLICA del QR: el runtime es UTC SIEMPRE, así que
  // con `toISOString()` acá el día no se corría tres horas por día sino todos los días.
  // Un certificado que vence HOY se le mostraba EXPIRADO a un tercero —un empleador, una
  // obra social— desde las 21:00 del día anterior. `valido_hasta` es DATE (sin zona), así
  // que hay que compararlo contra el día del CONSULTORIO, no contra el del runtime.
  const hoyStr = hoyAR()
  const isExpired = doc.valido_hasta ? hoyStr > doc.valido_hasta : false

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 py-8">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
        
        {/* Cabecera / Banner de Estado */}
        {doc.estado === 'revocado' ? (
          <div className="bg-red-50 border-b border-red-200 p-6 text-center">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <XCircle className="w-7 h-7" />
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">
              DOCUMENTO ANULADO
            </span>
            <h1 className="text-lg font-bold text-slate-900 mt-2">
              Este documento ha sido revocado
            </h1>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              El profesional médico ha anulado este documento. Su contenido no es válido para su presentación.
            </p>
          </div>
        ) : isExpired ? (
          <div className="bg-amber-50 border-b border-amber-200 p-6 text-center">
            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
              DOCUMENTO EXPIRADO
            </span>
            <h1 className="text-lg font-bold text-slate-900 mt-2">
              Vigencia finalizada
            </h1>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              El período de validez de este documento finalizó el {formatFechaLarga(doc.valido_hasta!)}.
            </p>
          </div>
        ) : (
          <div className="bg-emerald-50 border-b border-emerald-200 p-6 text-center">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              DOCUMENTO VÁLIDO
            </span>
            <h1 className="text-lg font-bold text-slate-900 mt-2">
              Autenticidad Verificada
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Documento médico oficial registrado en el sistema.
            </p>
          </div>
        )}

        {/* Detalles del Documento */}
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Info Médica */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <div className="flex items-center gap-2 text-slate-400 mb-2">
                <Award className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Profesional Emisor</span>
              </div>
              <p className="text-sm font-bold text-slate-900">
                {doc.medico_titulo ? `${doc.medico_titulo} ` : ''}{doc.medico_nombre}
              </p>
              <p className="text-xs text-slate-500 mt-0.5 font-mono">
                {formatMatriculas(doc.medico_matriculas) || 'Matrícula no registrada'}
              </p>
            </div>

            {/* Info Paciente */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <div className="flex items-center gap-2 text-slate-400 mb-2">
                <User className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Paciente</span>
              </div>
              <p className="text-sm font-bold text-slate-900">
                {doc.paciente_nombre}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                DNI: {doc.paciente_dni_masked}
              </p>
            </div>

          </div>

          <div className="border-t border-slate-100 pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Tipo y Emision */}
            <div className="flex items-center gap-2.5">
              <FileText className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Tipo de Documento</p>
                <p className="text-sm font-medium text-slate-800 capitalize">
                  {doc.tipo_documento === 'pedido' ? 'Pedido Médico de Estudios' : 'Certificado Médico'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <Calendar className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Fecha de Emisión</p>
                <p className="text-sm font-medium text-slate-800">
                  {formatFechaLarga(doc.fecha_emision)}
                </p>
              </div>
            </div>
          </div>

          {doc.valido_hasta && (
            <div className="text-center text-xs text-slate-400 pt-2">
              Vigencia del certificado hasta el {formatFechaLarga(doc.valido_hasta)}
            </div>
          )}
        </div>

        {/* Footer simple */}
        <div className="bg-slate-100 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-2 text-center md:text-left border-t border-slate-100">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
            ID Verificación: {codigo.toUpperCase()}
          </span>
          <span className="text-[10px] text-slate-400">
            Amauta — Sistema de Gestión Médica
          </span>
        </div>

      </div>
    </div>
  )
}
