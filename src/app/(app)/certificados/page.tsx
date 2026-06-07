import { createClient } from '@/lib/supabase/server'
import { verificarPermiso } from '@/lib/utils/verificar-permiso'
import { Button } from '@/components/ui/button'
import { PlusCircle, Award, Calendar } from 'lucide-react'
import Link from 'next/link'
import { formatFecha } from '@/lib/utils'
import { CERTIFICADO_TIPO_LABELS } from '@/lib/validations/pedido.schema'
import type { CertificadoTipo } from '@/types/pedido'
import { CertificadosFiltros } from '@/components/certificados/certificados-filtros'
import { Suspense } from 'react'

export const metadata = {
  title: 'Certificados Médicos — Amauta',
}

// Colores dark-mode safe usando clases semánticas de Tailwind (opacidad y ring)
const TIPO_BADGE: Record<string, { bg: string; text: string; ring: string }> = {
  aptitud_fisica: { bg: 'bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400', ring: 'ring-emerald-500/30' },
  reposo:         { bg: 'bg-blue-500/10',    text: 'text-blue-700 dark:text-blue-400',       ring: 'ring-blue-500/30'    },
  diagnostico:    { bg: 'bg-violet-500/10',  text: 'text-violet-700 dark:text-violet-400',   ring: 'ring-violet-500/30'  },
  libre_deuda:    { bg: 'bg-amber-500/10',   text: 'text-amber-700 dark:text-amber-400',     ring: 'ring-amber-500/30'   },
  otro:           { bg: 'bg-muted',          text: 'text-muted-foreground',                  ring: 'ring-border'         },
}

interface Props {
  searchParams?: Promise<{ q?: string; tipo?: string }>
}

export default async function CertificadosPage({ searchParams }: Props) {
  // Guard: redirige a /sin-acceso si el asistente no tiene ver_certificados
  await verificarPermiso('ver_certificados')

  const params = await searchParams
  const q = params?.q?.trim() ?? ''
  const tipoFiltro = params?.tipo ?? ''

  const supabase = await createClient()

  let query = supabase
    .from('certificados')
    .select(`
      id, paciente_id, paciente_nombre, paciente_dni,
      tipo, tipo_descripcion, fecha_certificado, created_at
    `)
    .order('fecha_certificado', { ascending: false })
    .limit(50)

  if (q) {
    query = query.or(`paciente_nombre.ilike.%${q}%,paciente_dni.ilike.%${q}%`)
  }
  if (tipoFiltro && tipoFiltro !== 'todos') {
    query = query.eq('tipo', tipoFiltro)
  }

  const { data: certificados } = await query

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Certificados Médicos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Certificados emitidos para tus pacientes
          </p>
        </div>
        <Button asChild className="gap-2 shrink-0">
          <Link href="/certificados/nuevo">
            <PlusCircle className="h-4 w-4" />
            Nuevo Certificado
          </Link>
        </Button>
      </div>

      {/* Filtros (client component) */}
      <Suspense>
        <CertificadosFiltros />
      </Suspense>

      {/* Resultados */}
      {(q || tipoFiltro) && (
        <p className="text-sm text-muted-foreground -mt-2">
          {certificados?.length
            ? `${certificados.length} resultado${certificados.length !== 1 ? 's' : ''}`
            : 'Sin resultados para los filtros aplicados'}
        </p>
      )}

      {/* Lista */}
      {!certificados || certificados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Award className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {q || tipoFiltro ? 'Sin resultados' : 'Sin certificados emitidos'}
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            {q || tipoFiltro
              ? 'No hay certificados que coincidan con los filtros aplicados.'
              : 'Los certificados que emitas (aptitud física, reposo, diagnóstico, etc.) aparecerán aquí.'}
          </p>
          {!q && !tipoFiltro && (
            <Button asChild className="gap-2">
              <Link href="/certificados/nuevo">
                <PlusCircle className="h-4 w-4" />
                Emitir primer certificado
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {certificados.map((cert) => {
            const tipo = cert.tipo as CertificadoTipo
            const tipoLabel = CERTIFICADO_TIPO_LABELS[tipo] ?? 'Certificado'
            const badge = TIPO_BADGE[tipo] ?? TIPO_BADGE.otro

            return (
              <Link key={cert.id} href={`/certificados/${cert.id}`} className="block group">
                <div className="bg-card border border-border/60 rounded-xl px-5 py-4 hover:border-primary/40 hover:shadow-md transition-all duration-200">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                        <Award className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                            {cert.paciente_nombre}
                          </p>
                          <span
                            className={`text-[11px] px-2 py-0.5 rounded-full font-medium ring-1 ring-inset ${badge.bg} ${badge.text} ${badge.ring}`}
                          >
                            {cert.tipo === 'otro' && cert.tipo_descripcion
                              ? cert.tipo_descripcion
                              : tipoLabel}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          DNI: {cert.paciente_dni}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                      <Calendar className="h-3 w-3" />
                      {formatFecha(cert.fecha_certificado)}
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
