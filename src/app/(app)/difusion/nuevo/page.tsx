import { DifusionForm } from '@/components/difusion/difusion-form'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export const metadata = {
  title: 'Nuevo Comunicado — Amauta',
}

export default function NuevoDifusionPage() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Link
          href="/difusion"
          className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-muted"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Nuevo Comunicado</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Redactá un nuevo mensaje para tus pacientes
          </p>
        </div>
      </div>

      <DifusionForm />
    </div>
  )
}
