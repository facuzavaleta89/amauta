import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolverAcceso } from '@/lib/auth/tenant'
import { CertificadoForm } from '@/components/certificados/certificado-form'

export const metadata = {
  title: 'Nuevo Certificado Médico',
}

interface Props {
  searchParams: Promise<{ paciente_id?: string }>
}

export default async function NuevoCertificadoPage({ searchParams }: Props) {
  const { paciente_id } = await searchParams

  // Guard de apertura: sin `crear_certificados` esta página no se abre, ni siquiera por
  // URL directa. Antes se mostraba el formulario completo y el rechazo llegaba recién al
  // guardar (403 del POST). Mismos destinos que historia/estudios.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const acceso = await resolverAcceso(supabase, user.id, 'crear_certificados')
  if (!acceso.ok) {
    if (acceso.motivo === 'sin-permiso') redirect('/sin-acceso')
    if (acceso.motivo === 'sin-tenant') redirect('/dashboard')
    redirect('/login')
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/certificados"
          className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-muted"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Nuevo Certificado Médico</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Emití un certificado para un paciente
          </p>
        </div>
      </div>

      <CertificadoForm preselectedPacienteId={paciente_id ?? null} />
    </div>
  )
}
