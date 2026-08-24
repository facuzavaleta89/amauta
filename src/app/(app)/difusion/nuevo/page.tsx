import { DifusionForm } from '@/components/difusion/difusion-form'
import PageHeader from '@/components/shared/page-header'

export const metadata = {
  title: 'Nuevo Comunicado — Amauta',
}

export default function NuevoDifusionPage() {
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Nuevo Comunicado"
        description="Redactá un nuevo mensaje para tus pacientes"
        backHref="/difusion"
      />

      <DifusionForm />
    </div>
  )
}
