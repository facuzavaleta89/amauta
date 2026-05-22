'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─────────────────────────────────────────────────────────────
// Actualizar datos básicos (Nombre y Matrícula)
// ─────────────────────────────────────────────────────────────
export async function actualizarPerfil(
  fullName: string,
  matricula?: string | null
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    const cleanedName = fullName.trim()
    if (cleanedName.length < 3) {
      return { error: 'El nombre debe tener al menos 3 caracteres.' }
    }
    if (cleanedName.length > 100) {
      return { error: 'El nombre no puede tener más de 100 caracteres.' }
    }
    if (!/^[a-zA-ZÁÉÍÓÚÜÑñ\s'\-\.]+$/.test(cleanedName)) {
      return { error: 'El nombre contiene caracteres no válidos.' }
    }

    const cleanedMatricula = matricula?.trim() || null
    if (cleanedMatricula) {
      if (cleanedMatricula.length > 20) {
        return { error: 'La matrícula no puede superar los 20 caracteres.' }
      }
      if (!/^[a-zA-Z0-9\s\-\/\.]+$/.test(cleanedMatricula)) {
        return { error: 'La matrícula contiene caracteres no válidos.' }
      }
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: cleanedName,
        matricula: cleanedMatricula,
      })
      .eq('id', user.id)

    if (error) throw error

    revalidatePath('/perfil')
    return { error: null }
  } catch (err: any) {
    console.error('[actualizarPerfil]', err)
    return { error: err.message || 'Error al actualizar el perfil.' }
  }
}

// ─────────────────────────────────────────────────────────────
// Guardar firma digital (como base64 string)
// ─────────────────────────────────────────────────────────────
export async function guardarFirma(
  base64Image: string | null
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    // Verificar que sea un médico
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'medico') {
      return { error: 'Solo los médicos pueden tener una firma digital registrada.' }
    }

    if (base64Image) {
      if (base64Image.length > 700000) {
        return { error: 'La firma es demasiado pesada (máximo 500 KB).' }
      }
      if (!/^data:image\/(png|jpeg|jpg|svg\+xml);base64,/.test(base64Image)) {
        return { error: 'Formato de imagen inválido (solo PNG, JPG o SVG en base64).' }
      }
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        firma_url: base64Image,
      })
      .eq('id', user.id)

    if (error) throw error

    revalidatePath('/perfil')
    return { error: null }
  } catch (err: any) {
    console.error('[guardarFirma]', err)
    return { error: err.message || 'Error al guardar la firma.' }
  }
}

// ─────────────────────────────────────────────────────────────
// Obtener lista de asistentes vinculados (para médicos)
// ─────────────────────────────────────────────────────────────
export async function obtenerAsistentes(): Promise<{
  data: {
    id: string
    full_name: string
    email: string
    puede_ver_historias: boolean
    puede_editar_agenda: boolean
    created_at: string
  }[] | null
  error: string | null
}> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: 'No autenticado.' }

    // Obtener asistentes vinculados a este médico
    const { data: asistentes, error } = await supabase
      .from('profiles')
      .select('id, full_name, puede_ver_historias, puede_editar_agenda, created_at')
      .eq('role', 'asistente')
      .eq('medico_id', user.id)
      .order('full_name')

    if (error) throw error
    if (!asistentes?.length) return { data: [], error: null }

    // Enriquecer con emails usando el admin client (bypassea RLS y lectura de correos)
    const admin = createAdminClient()
    const enriched = await Promise.all(
      asistentes.map(async (a) => {
        const { data: authData } = await admin.auth.admin.getUserById(a.id)
        return {
          id: a.id,
          full_name: a.full_name,
          email: authData?.user?.email ?? 'Sin email',
          puede_ver_historias: a.puede_ver_historias ?? true,
          puede_editar_agenda: a.puede_editar_agenda ?? true,
          created_at: a.created_at,
        }
      })
    )

    return { data: enriched, error: null }
  } catch (err: any) {
    console.error('[obtenerAsistentes]', err)
    return { data: null, error: err.message || 'Error al obtener asistentes.' }
  }
}

// ─────────────────────────────────────────────────────────────
// Actualizar permisos de un asistente
// ─────────────────────────────────────────────────────────────
export async function actualizarPermisoAsistente(
  asistenteId: string,
  permiso: 'puede_ver_historias' | 'puede_editar_agenda',
  valor: boolean
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    // Verificar que el asistente realmente pertenezca a este médico (chequeo app-level)
    const { data: asistente } = await supabase
      .from('profiles')
      .select('medico_id')
      .eq('id', asistenteId)
      .single()

    if (!asistente || asistente.medico_id !== user.id) {
      return { error: 'No tenés permisos sobre este asistente.' }
    }

    // Usar admin client porque RLS solo permite update del propio perfil (auth.uid() = id)
    // La validación de pertenencia ya se hizo arriba a nivel de aplicación
    const admin = createAdminClient()
    const { error } = await admin
      .from('profiles')
      .update({ [permiso]: valor })
      .eq('id', asistenteId)

    if (error) throw error

    revalidatePath('/perfil')
    return { error: null }
  } catch (err: any) {
    console.error('[actualizarPermisoAsistente]', err)
    return { error: err.message || 'Error al actualizar permisos del asistente.' }
  }
}

// ─────────────────────────────────────────────────────────────
// Desvincular un asistente
// ─────────────────────────────────────────────────────────────
export async function desvincularAsistente(
  asistenteId: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    // Verificar pertenencia (chequeo app-level antes de usar admin client)
    const { data: asistente } = await supabase
      .from('profiles')
      .select('medico_id')
      .eq('id', asistenteId)
      .single()

    if (!asistente || asistente.medico_id !== user.id) {
      return { error: 'No tenés permisos para desvincular a este asistente.' }
    }

    // Usar admin client para bypasear RLS al desvincular
    const admin = createAdminClient()
    const { error } = await admin
      .from('profiles')
      .update({ medico_id: null })
      .eq('id', asistenteId)

    if (error) throw error

    revalidatePath('/perfil')
    return { error: null }
  } catch (err: any) {
    console.error('[desvincularAsistente]', err)
    return { error: err.message || 'Error al desvincular asistente.' }
  }
}
