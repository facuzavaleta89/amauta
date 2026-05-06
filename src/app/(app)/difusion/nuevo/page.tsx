import { DifusionForm } from '@/components/difusion/difusion-form'

export const metadata = {
  title: 'Nuevo Comunicado — Amauta',
}

export default function NuevoDifusionPage() {
  return (
    <div className="space-y-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-foreground">Nuevo Comunicado</h1>
        <p className="text-muted-foreground mt-1 mb-8">
          Redactá un nuevo mensaje para tus pacientes. Podrás guardarlo como borrador antes de enviarlo.
        </p>
        <DifusionForm />
      </div>
    </div>
  )
}
