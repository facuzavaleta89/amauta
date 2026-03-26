'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function login(
  _prevState: { error: string } | undefined,
  formData: FormData
): Promise<{ error: string }> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Completá todos los campos.' }
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
