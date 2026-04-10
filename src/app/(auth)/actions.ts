'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { rateLimitAction, getIpFromHeaders } from '@/lib/rate-limit'

export async function login(
  _prevState: { error: string } | undefined,
  formData: FormData
): Promise<{ error: string }> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Completá todos los campos.' }
  }

  // Rate limit: 10 intentos por IP+email cada 15 minutos
  const ip = await getIpFromHeaders()
  const { success, retryAfter } = await rateLimitAction({
    key: `login:${ip}:${email.toLowerCase()}`,
    limit: 10,
    windowMs: 15 * 60 * 1000,
  })
  if (!success) {
    const mins = Math.ceil(retryAfter! / 60000)
    return { error: `Demasiados intentos. Esperá ${mins} minuto${mins !== 1 ? 's' : ''} antes de reintentar.` }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    if (error.message.includes('Invalid login credentials')) {
      return { error: 'Email o contraseña incorrectos.' }
    }
    if (error.message.includes('Email not confirmed')) {
      return { error: 'Revisá tu bandeja de entrada y confirmá tu email.' }
    }
    return { error: error.message }
  }

  redirect('/dashboard')
}

export async function registerUser(
  _prevState: { error: string } | undefined,
  formData: FormData
): Promise<{ error: string }> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const fullName = formData.get('fullName') as string
  const role = formData.get('role') as string

  if (!email || !password || !fullName || !role) {
    return { error: 'Completá todos los campos obligatorios.' }
  }

  // Rate limit: 5 registros por IP cada 60 minutos
  const ip = await getIpFromHeaders()
  const { success, retryAfter } = await rateLimitAction({
    key: `register:${ip}`,
    limit: 5,
    windowMs: 60 * 60 * 1000,
  })
  if (!success) {
    const mins = Math.ceil(retryAfter! / 60000)
    return { error: `Demasiados intentos de registro. Esperá ${mins} minuto${mins !== 1 ? 's' : ''}.` }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role: role,
      },
      // Require email confirmation if you want, but typically defaults to what you have set in Supabase Dashboard.
      // If email confirmation is ON, user won't be able to log in until clicking the link.
    },
  })

  if (error) {
    return { error: error.message }
  }

  // Redirect to login to force sign in, or to a success page
  redirect('/login?registered=true')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
