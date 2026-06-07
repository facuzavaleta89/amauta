import Link from 'next/link'
import { ShieldOff, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const metadata = {
  title: 'Sin acceso — Amauta',
  description: 'No tenés permiso para acceder a esta sección.',
}

export default function SinAccesoPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      {/* Icono */}
      <div className="w-20 h-20 rounded-2xl bg-destructive/10 flex items-center justify-center mb-6">
        <ShieldOff className="h-10 w-10 text-destructive/70" />
      </div>

      {/* Título */}
      <h1 className="text-2xl font-bold text-foreground mb-2">
        Acceso restringido
      </h1>

      {/* Descripción */}
      <p className="text-muted-foreground text-sm max-w-sm mb-8 leading-relaxed">
        No tenés permiso para acceder a esta sección.
        Si creés que deberías tener acceso, contactá al médico titular para que actualice tus permisos.
      </p>

      {/* Acción */}
      <Button asChild variant="outline" className="gap-2">
        <Link href="/dashboard">
          <ArrowLeft className="h-4 w-4" />
          Volver al dashboard
        </Link>
      </Button>
    </div>
  )
}
