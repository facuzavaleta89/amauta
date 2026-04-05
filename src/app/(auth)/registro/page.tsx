'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { registerUser } from '../actions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertCircle, Loader2, UserPlus } from 'lucide-react'

export default function RegistroPage() {
  const [state, action, isPending] = useActionState(registerUser, undefined)

  return (
    <Card className="shadow-sm border-border/60 animate-fade-in">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-xl font-semibold">Crear una cuenta</CardTitle>
        <CardDescription>
          Ingresá tus datos para registrarte en la plataforma
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Nombre Completo</Label>
            <Input
              id="fullName"
              name="fullName"
              type="text"
              placeholder="Ej: Dr. Facundo Zavaleta"
              required
              disabled={isPending}
              className="h-10"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="tu@email.com"
              required
              disabled={isPending}
              className="h-10"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Mínimo 6 caracteres"
              required
              disabled={isPending}
              className="h-10"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Rol</Label>
            <Select name="role" required disabled={isPending} defaultValue="asistente">
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Seleccioná tu rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="medico">Médico (Acceso total)</SelectItem>
                <SelectItem value="asistente">Asistente (Operativo)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
              Los asistentes deberán solicitar acceso a un médico luego de registrarse.
            </p>
          </div>

          {state?.error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/8 border border-destructive/20 rounded-md px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{state.error}</span>
            </div>
          )}

          <Button
            type="submit"
            className="w-full h-10 gap-2 mt-2"
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Registrando...
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" />
                Crear cuenta
              </>
            )}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col gap-2 pt-0 pb-6 text-center text-sm text-muted-foreground">
        <p>¿Ya tenés una cuenta?</p>
        <Link href="/login" className="text-primary hover:underline font-medium">
          Iniciar sesión
        </Link>
      </CardFooter>
    </Card>
  )
}
