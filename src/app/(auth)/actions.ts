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

  if (email.length > 254 || !email.includes('@')) {
    return { error: 'Formato de email inválido.' }
  }

  if (password.length > 128) {
    return { error: 'La contraseña es demasiado larga.' }
  }

  // Rate limit: 5 intentos por IP+email cada minuto
  const ip = await getIpFromHeaders()
  const { success, retryAfter } = await rateLimitAction({
    key: `login:${ip}:${email.trim().toLowerCase()}`,
    limit: 5,
    windowMs: 60 * 1000,
  })
  if (!success) {
    const mins = Math.ceil(retryAfter! / 60000)
    return { error: `Demasiados intentos. Esperá ${mins} minuto${mins !== 1 ? 's' : ''} antes de reintentar.` }
  }

  const supabase = await createClient()

  // Limpiar cualquier sesión residual del usuario anterior antes de hacer login nuevo,
  // pero solo si hay una sesión activa para evitar conflictos de cookies y cabeceras.
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    await supabase.auth.signOut()
  }

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

  const cleanedEmail = email.trim()
  const cleanedName = fullName.trim()

  if (cleanedEmail.length > 254 || !cleanedEmail.includes('@')) {
    return { error: 'Formato de email inválido.' }
  }
  const cleanedPassword = password.trim()
  if (cleanedPassword.length < 12 || cleanedPassword.length > 128) {
    return { error: `La contraseña debe tener entre 12 y 128 caracteres (recibido: ${cleanedPassword.length}).` }
  }
  if (cleanedName.length < 3 || cleanedName.length > 100) {
    return { error: 'El nombre completo debe tener entre 3 y 100 caracteres.' }
  }
  if (!/^[a-zA-ZÁÉÍÓÚÜÑñ\s'\-\.]+$/.test(cleanedName)) {
    return { error: 'El nombre completo contiene caracteres no válidos.' }
  }

  // Validar que el rol sea uno de los valores permitidos (defensa contra manipulación de FormData)
  const rolesPermitidos = ['medico', 'asistente'] as const
  if (!rolesPermitidos.includes(role as typeof rolesPermitidos[number])) {
    return { error: 'Rol no válido.' }
  }

  // Rate limit: 3 registros por IP cada minuto
  const ip = await getIpFromHeaders()
  const { success, retryAfter } = await rateLimitAction({
    key: `registro:${ip}`,
    limit: 3,
    windowMs: 60 * 1000,
  })
  if (!success) {
    const mins = Math.ceil(retryAfter! / 60000)
    return { error: `Demasiados intentos de registro. Esperá ${mins} minuto${mins !== 1 ? 's' : ''}.` }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email,
    password: cleanedPassword,
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
