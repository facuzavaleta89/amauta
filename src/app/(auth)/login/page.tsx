'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { login } from '../actions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AlertCircle, Loader2, LogIn, CheckCircle2 } from 'lucide-react'

export default function LoginPage() {
  const [state, action, isPending] = useActionState(login, undefined)

  // Opcional: chequear param "registered" en una app real usando Suspense y useSearchParams
  // Por simplicidad, agregamos solo los enlaces.

  return (
    <Card className="shadow-sm border-border/60 animate-fade-in">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-xl font-semibold">Iniciar sesión</CardTitle>
        <CardDescription>
          Ingresá tus credenciales para acceder
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="tu@email.com"
              autoComplete="email"
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
              placeholder="••••••••"
              autoComplete="current-password"
              required
              disabled={isPending}
              className="h-10"
            />
          </div>

          {state?.error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/8 border border-destructive/20 rounded-md px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{state.error}</span>
            </div>
          )}

          <Button
            id="login-submit"
            type="submit"
            className="w-full h-10 gap-2 mt-2"
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Ingresando...
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                Ingresar
              </>
            )}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col gap-2 pt-0 pb-6 text-center text-sm text-muted-foreground">
        <p>¿No tenés una cuenta?</p>
        <Link href="/registro" className="text-primary hover:underline font-medium">
          Registrate acá
        </Link>
      </CardFooter>
    </Card>
  )
}
