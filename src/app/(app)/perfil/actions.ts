'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Matricula } from '@/types/roles'

const TIPOS_VALIDOS = ['MP', 'MN', 'ME'] as const

// ─────────────────────────────────────────────────────────────
// Actualizar datos básicos (Nombre, Matrículas y Título)
// ─────────────────────────────────────────────────────────────
export async function actualizarPerfil(
  fullName: string,
  matriculas?: Matricula[],
  titulo?: string | null
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    // Validar nombre
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

    // Validar matrículas
    const cleanedMatriculas: Matricula[] = []
    if (matriculas && matriculas.length > 0) {
      if (matriculas.length > 5) {
        return { error: 'Se permiten como máximo 5 matrículas.' }
      }
      for (const m of matriculas) {
        if (!TIPOS_VALIDOS.includes(m.tipo as any)) {
          return { error: `Tipo de matrícula inválido: ${m.tipo}. Use MP, MN o ME.` }
        }
        const num = m.numero.trim()
        if (!num) {
          return { error: 'El número de matrícula no puede estar vacío.' }
        }
        if (num.length > 15) {
          return { error: 'El número de matrícula no puede superar los 15 caracteres.' }
        }
        if (!/^[a-zA-Z0-9\-\/\.]+$/.test(num)) {
          return { error: 'El número de matrícula contiene caracteres no válidos.' }
        }
        cleanedMatriculas.push({ tipo: m.tipo, numero: num })
      }
    }

    // Validar título
    const cleanedTitulo = titulo?.trim() || null
    if (cleanedTitulo && cleanedTitulo.length > 30) {
      return { error: 'El título no puede superar los 30 caracteres.' }
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: cleanedName,
        matriculas: cleanedMatriculas,
        titulo: cleanedTitulo,
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
      .update({ firma_url: base64Image })
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
// Guardar logo / sello institucional (como base64 string)
// ─────────────────────────────────────────────────────────────
export async function guardarLogo(
  base64Image: string | null
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'medico') {
      return { error: 'Solo los médicos pueden registrar un logo institucional.' }
    }

    if (base64Image) {
      if (base64Image.length > 1400000) {
        return { error: 'El logo es demasiado pesado (máximo 1 MB).' }
      }
      if (!/^data:image\/(png|jpeg|jpg|svg\+xml|webp);base64,/.test(base64Image)) {
        return { error: 'Formato de imagen inválido (solo PNG, JPG, SVG o WebP en base64).' }
      }
    }

    const { error } = await supabase
      .from('profiles')
      .update({ logo_url: base64Image })
      .eq('id', user.id)

    if (error) throw error

    revalidatePath('/perfil')
    return { error: null }
  } catch (err: any) {
    console.error('[guardarLogo]', err)
    return { error: err.message || 'Error al guardar el logo.' }
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

    const { data: asistentes, error } = await supabase
      .from('profiles')
      .select('id, full_name, puede_ver_historias, puede_editar_agenda, created_at')
      .eq('role', 'asistente')
      .eq('medico_id', user.id)
      .order('full_name')

    if (error) throw error
    if (!asistentes?.length) return { data: [], error: null }

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

    const { data: asistente } = await supabase
      .from('profiles')
      .select('medico_id')
      .eq('id', asistenteId)
      .single()

    if (!asistente || asistente.medico_id !== user.id) {
      return { error: 'No tenés permisos sobre este asistente.' }
    }

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

    const { data: asistente } = await supabase
      .from('profiles')
      .select('medico_id')
      .eq('id', asistenteId)
      .single()

    if (!asistente || asistente.medico_id !== user.id) {
      return { error: 'No tenés permisos para desvincular a este asistente.' }
    }

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
