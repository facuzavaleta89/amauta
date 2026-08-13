import { createClient } from '@/lib/supabase/server'
import { verificarPermiso } from '@/lib/utils/verificar-permiso'
import { Button } from '@/components/ui/button'
import { PlusCircle, Award, Calendar, Ban, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { formatFecha } from '@/lib/utils/format-date'
import { CertificadosFiltros } from '@/components/certificados/certificados-filtros'
import { Suspense } from 'react'

export const metadata = {
  title: 'Certificados Médicos — Amauta',
}

interface Props {
  searchParams?: Promise<{ q?: string }>
}

export default async function CertificadosPage({ searchParams }: Props) {
  // Guard: redirige a /sin-acceso si el asistente no tiene ver_certificados
  await verificarPermiso('ver_certificados')

  const params = await searchParams
  const q = params?.q?.trim() ?? ''

  const supabase = await createClient()

  let query = supabase
    .from('certificados')
    .select(`
      id, paciente_id, paciente_nombre, paciente_dni,
      contenido, fecha_certificado, created_at, estado, valido_hasta
    `)
    .order('fecha_certificado', { ascending: false })
    .limit(50)

  if (q) {
    query = query.or(`paciente_nombre.ilike.%${q}%,paciente_dni.ilike.%${q}%`)
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
      {q && (
        <p className="text-sm text-muted-foreground -mt-2">
          {certificados?.length
            ? `${certificados.length} resultado${certificados.length !== 1 ? 's' : ''}`
            : 'Sin resultados para la búsqueda'}
        </p>
      )}

      {/* Lista */}
      {!certificados || certificados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Award className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {q ? 'Sin resultados' : 'Sin certificados emitidos'}
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            {q
              ? 'No hay certificados que coincidan con la búsqueda.'
              : 'Los certificados que emitas aparecen aquí.'}
          </p>
          {!q && (
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
            // Vista previa: primeras ~80 chars del contenido
            const preview = cert.contenido
              ? cert.contenido.length > 80
                ? cert.contenido.slice(0, 80).trimEnd() + '…'
                : cert.contenido
              : null

            // Estado derivado
            const hoyStr = new Date().toISOString().slice(0, 10)
            const isAnulado = cert.estado === 'revocado'
            const isExpirado = !isAnulado && cert.valido_hasta ? hoyStr > cert.valido_hasta : false

            return (
              <Link key={cert.id} href={`/certificados/${cert.id}`} className="block group">
                <div className="bg-card border border-border/60 rounded-xl px-5 py-4 hover:border-primary/40 hover:shadow-md transition-all duration-200">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                        <Award className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                          {cert.paciente_nombre}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          DNI: {cert.paciente_dni}
                        </p>
                        {preview && (
                          <p className="text-xs text-muted-foreground mt-1 italic truncate">
                            Certifico que {preview}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isAnulado && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-red-500/10 text-red-700 dark:text-red-400 ring-1 ring-inset ring-red-500/20">
                          <Ban className="h-2.5 w-2.5" />
                          Anulado
                        </span>
                      )}
                      {isExpirado && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-500/20">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          Expirado
                        </span>
                      )}
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {formatFecha(cert.fecha_certificado)}
                      </div>
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
