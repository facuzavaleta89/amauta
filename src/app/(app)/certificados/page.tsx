import { createClient } from '@/lib/supabase/server'
import { verificarPermiso } from '@/lib/utils/verificar-permiso'
import { BotonCrearConPermiso } from '@/components/shared/boton-crear-con-permiso'
import PageHeader from '@/components/shared/page-header'
import { PlusCircle, Award, Calendar, Ban, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { formatFecha } from '@/lib/utils/format-date'
import { sanitizarTextoBusqueda } from '@/lib/validations/shared'
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
  // ⚠ DOS variables a propósito: `q` (crudo) es lo que ve el usuario —el `defaultValue`
  // del input y el texto "N resultados para …"— y `qSanitizado` es SOLO el patrón del
  // `ilike`. Mostrar el escapado le devolvería `50\%` cuando escribió `50%`.
  const qSanitizado = sanitizarTextoBusqueda(q)

  const supabase = await createClient()

  let query = supabase
    .from('certificados')
    .select(`
      id, paciente_id, paciente_nombre, paciente_dni,
      contenido, fecha_certificado, created_at, estado, valido_hasta
    `)
    .order('fecha_certificado', { ascending: false })
    .limit(50)

  if (qSanitizado) {
    query = query.or(`paciente_nombre.ilike.%${qSanitizado}%,paciente_dni.ilike.%${qSanitizado}%`)
  }

  const { data: certificados } = await query

  return (
    <div className="space-y-6">
      <PageHeader
        title="Certificados Médicos"
        description="Certificados emitidos para tus pacientes"
      >
        <BotonCrearConPermiso
          permiso="crear_certificados"
          href="/certificados/nuevo"
          className="gap-2 shrink-0"
          tituloSinPermiso="Requiere permiso para emitir certificados"
        >
          <PlusCircle className="h-4 w-4" />
          Nuevo Certificado
        </BotonCrearConPermiso>
      </PageHeader>

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
            <BotonCrearConPermiso
              permiso="crear_certificados"
              href="/certificados/nuevo"
              className="gap-2"
              tituloSinPermiso="Requiere permiso para emitir certificados"
            >
              <PlusCircle className="h-4 w-4" />
              Emitir primer certificado
            </BotonCrearConPermiso>
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
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-destructive/10 text-destructive-strong ring-1 ring-inset ring-destructive/20">
                          <Ban className="h-2.5 w-2.5" />
                          Anulado
                        </span>
                      )}
                      {isExpirado && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-warning/10 text-warning-strong ring-1 ring-inset ring-warning/20">
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
