import { createClient } from '@/lib/supabase/server'
import { verificarPermiso } from '@/lib/utils/verificar-permiso'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import PageHeader from '@/components/shared/page-header'
import { EstudiosList } from '@/components/pacientes/estudios-list'
import { EstudiosUpload } from '@/components/pacientes/estudios-upload'
import type { Estudio } from '@/types'

interface Props {
  params: Promise<{ id: string }>
}

export const metadata: Metadata = {
  title: 'Estudios',
}

export default async function EstudiosPage({ params }: Props) {
  // Guard: redirige a /sin-acceso si es asistente sin ver_historia_clinica.
  await verificarPermiso('ver_historia_clinica')

  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, medico_id')
    .eq('id', user.id)
    .single()

  const tenantMedicoId =
    profile?.role === 'medico'    ? user.id :
    profile?.role === 'asistente' ? profile?.medico_id :
    null

  if (!tenantMedicoId) redirect('/dashboard')

  const esMedico = profile?.role === 'medico'

  // Paciente (RLS aísla por tenant).
  const { data: paciente, error: pacienteError } = await supabase
    .from('pacientes')
    .select('id, nombre_completo, archivado_at')
    .eq('id', id)
    .single()

  if (pacienteError || !paciente) notFound()

  const archivado = Boolean(paciente.archivado_at)

  // Estudios del paciente (RLS ya valida ver_historia_clinica + tenant).
  const { data: estudios } = await supabase
    .from('estudios')
    .select('*')
    .eq('paciente_id', id)
    .order('fecha_estudio', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/pacientes/${id}`}
          className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-muted"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <PageHeader
          title="Estudios complementarios"
          description={`Archivos adjuntos de ${paciente.nombre_completo}`}
        />
      </div>

      <EstudiosUpload pacienteId={id} archivado={archivado} />

      <EstudiosList
        estudios={(estudios ?? []) as Estudio[]}
        esMedico={esMedico}
        archivado={archivado}
      />
    </div>
  )
}
