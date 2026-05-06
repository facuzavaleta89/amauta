import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { PlusCircle, Award, Calendar } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { CERTIFICADO_TIPO_LABELS } from '@/lib/validations/pedido.schema'
import type { CertificadoTipo } from '@/types/pedido'

export const metadata = {
  title: 'Certificados Médicos',
}

const TIPO_BADGE: Record<string, string> = {
  aptitud_fisica: 'bg-green-100 text-green-700 border-green-200',
  reposo:         'bg-blue-100 text-blue-700 border-blue-200',
  diagnostico:    'bg-purple-100 text-purple-700 border-purple-200',
  libre_deuda:    'bg-amber-100 text-amber-700 border-amber-200',
  otro:           'bg-gray-100 text-gray-600 border-gray-200',
}

export default async function CertificadosPage() {
  const supabase = await createClient()

  const { data: certificados } = await supabase
    .from('certificados')
    .select(`
      id, paciente_id, paciente_nombre, paciente_dni,
      tipo, tipo_descripcion, fecha_certificado, created_at
    `)
    .order('fecha_certificado', { ascending: false })
    .limit(50)

  const formatFecha = (d: string) => {
    try {
      return format(new Date(d + 'T12:00:00'), "d MMM yyyy", { locale: es })
    } catch {
      return d
    }
  }

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
        <Button asChild className="gap-2">
          <Link href="/certificados/nuevo">
            <PlusCircle className="h-4 w-4" />
            Nuevo Certificado
          </Link>
        </Button>
      </div>

      {/* Lista */}
      {!certificados || certificados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Award className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Sin certificados emitidos
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            Los certificados que emitas (aptitud física, reposo, diagnóstico, etc.) aparecerán aquí.
          </p>
          <Button asChild className="gap-2">
            <Link href="/certificados/nuevo">
              <PlusCircle className="h-4 w-4" />
              Emitir primer certificado
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {certificados.map((cert) => {
            const tipo = cert.tipo as CertificadoTipo
            const tipoLabel = CERTIFICADO_TIPO_LABELS[tipo] ?? 'Certificado'
            const badgeClass = TIPO_BADGE[tipo] ?? TIPO_BADGE.otro

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
                          <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${badgeClass}`}>
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
