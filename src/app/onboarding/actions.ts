'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─────────────────────────────────────────────────────────────
// Buscar médicos por email o nombre (usa service role para
// bypassear RLS — el asistente sin medico_id no puede ver
// otros profiles por las políticas actuales)
// ─────────────────────────────────────────────────────────────
export async function buscarMedicos(query: string): Promise<{
  data: { id: string; full_name: string; email: string }[] | null
  error: string | null
}> {
  if (!query || query.trim().length < 3) {
    return { data: [], error: null }
  }

  // Verificar sesión
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'No autenticado.' }

  // Verificar que el solicitante es asistente
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'asistente') {
    return { data: null, error: 'Solo los asistentes pueden buscar médicos.' }
  }

  // Usar admin client para la búsqueda (bypasea RLS)
  const admin = createAdminClient()

  const trimmed = query.trim().toLowerCase()
  const isEmailSearch = trimmed.includes('@')

  // Obtener auth users para enriquecer con emails
  const { data: usersData } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })

  const userEmailMap = new Map(
    usersData?.users?.map((u) => [u.id, u.email ?? '']) ?? []
  )

  // Si es búsqueda por email: traemos TODOS los médicos y filtramos en JS
  // Si es búsqueda por nombre: usamos .ilike() en DB (codifica % correctamente)
  let profilesQuery = admin
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'medico')

  if (!isEmailSearch) {
    profilesQuery = profilesQuery.ilike('full_name', `%${trimmed}%`)
  }

  const { data, error } = await profilesQuery.limit(isEmailSearch ? 200 : 10)

  if (error || !data) {
    return { data: null, error: 'Error al buscar médicos.' }
  }

  // Mapear y filtrar
  const filtered = data
    .map((p) => ({
      id: p.id,
      full_name: p.full_name,
      email: userEmailMap.get(p.id) ?? '',
    }))
    .filter((p) =>
      isEmailSearch
        ? p.email.toLowerCase().includes(trimmed)
        : p.full_name.toLowerCase().includes(trimmed) ||
          p.email.toLowerCase().includes(trimmed)
    )

  return { data: filtered, error: null }
}

// ─────────────────────────────────────────────────────────────
// Enviar solicitud de vinculación al médico
// ─────────────────────────────────────────────────────────────
export async function enviarSolicitud(
  medicoId: string,
  mensaje?: string
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, medico_id')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'asistente') {
    return { error: 'Solo los asistentes pueden enviar solicitudes.' }
  }

  if (profile?.medico_id) {
    return { error: 'Ya estás vinculado a un médico.' }
  }

  const { error } = await supabase.from('solicitudes_asistente').insert({
    solicitante_id: user.id,
    medico_id: medicoId,
    mensaje: mensaje?.trim() || null,
  })

  if (error) {
    if (error.code === '23505') {
      return { error: 'Ya enviaste una solicitud a este médico.' }
    }
    return { error: 'No se pudo enviar la solicitud.' }
  }

  revalidatePath('/onboarding')
  return { error: null }
}

// ─────────────────────────────────────────────────────────────
// Obtener la solicitud actual del asistente
// ─────────────────────────────────────────────────────────────
export async function obtenerMiSolicitud(): Promise<{
  data: {
    id: string
    estado: string
    medico_nombre: string
    medico_email: string
    created_at: string
    respondido_at: string | null
  } | null
  error: string | null
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'No autenticado.' }

  const { data: solicitud, error } = await supabase
    .from('solicitudes_asistente')
    .select('id, estado, medico_id, created_at, respondido_at')
    .eq('solicitante_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return { data: null, error: 'Error al obtener solicitud.' }
  if (!solicitud) return { data: null, error: null }

  // Obtener nombre y email del médico vía admin
  const admin = createAdminClient()
  const { data: medicoProfile } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', solicitud.medico_id)
    .single()

  const { data: medicoAuth } = await admin.auth.admin.getUserById(solicitud.medico_id)

  return {
    data: {
      id: solicitud.id,
      estado: solicitud.estado,
      medico_nombre: medicoProfile?.full_name ?? 'Médico',
      medico_email: medicoAuth?.user?.email ?? '',
      created_at: solicitud.created_at,
      respondido_at: solicitud.respondido_at,
    },
    error: null,
  }
}

// ─────────────────────────────────────────────────────────────
// Responder solicitud (solo médicos) — Aprobar o Rechazar
// ─────────────────────────────────────────────────────────────
export async function responderSolicitud(
  solicitudId: string,
  decision: 'aprobada' | 'rechazada'
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'medico') {
    return { error: 'Solo los médicos pueden responder solicitudes.' }
  }

  // Obtener la solicitud para saber quién es el asistente
  const admin = createAdminClient()
  const { data: solicitud, error: fetchError } = await admin
    .from('solicitudes_asistente')
    .select('solicitante_id, medico_id, estado')
    .eq('id', solicitudId)
    .single()

  if (fetchError || !solicitud) {
    return { error: 'Solicitud no encontrada.' }
  }

  if (solicitud.medico_id !== user.id) {
    return { error: 'No tenés permisos para responder esta solicitud.' }
  }

  if (solicitud.estado !== 'pendiente') {
    return { error: 'Esta solicitud ya fue respondida.' }
  }

  // Actualizar estado de la solicitud
  const { error: updateError } = await admin
    .from('solicitudes_asistente')
    .update({
      estado: decision,
      respondido_at: new Date().toISOString(),
    })
    .eq('id', solicitudId)

  if (updateError) return { error: 'Error al actualizar la solicitud.' }

  // Si aprobada: vincular el asistente al médico
  if (decision === 'aprobada') {
    const { error: linkError } = await admin
      .from('profiles')
      .update({ medico_id: user.id })
      .eq('id', solicitud.solicitante_id)

    if (linkError) {
      // Rollback de la solicitud si falla el vínculo
      await admin
        .from('solicitudes_asistente')
        .update({ estado: 'pendiente', respondido_at: null })
        .eq('id', solicitudId)
      return { error: 'Error al vincular el asistente. Intentá nuevamente.' }
    }
  }

  revalidatePath('/dashboard')
  return { error: null }
}

// ─────────────────────────────────────────────────────────────
// Obtener solicitudes pendientes para el médico (para el header)
// ─────────────────────────────────────────────────────────────
export async function obtenerSolicitudesPendientes(): Promise<{
  data: {
    id: string
    solicitante_nombre: string
    solicitante_email: string
    mensaje: string | null
    created_at: string
  }[]
  count: number
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: [], count: 0 }

  const { data: solicitudes, error } = await supabase
    .from('solicitudes_asistente')
    .select('id, solicitante_id, mensaje, created_at')
    .eq('medico_id', user.id)
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false })

  if (error || !solicitudes?.length) return { data: [], count: 0 }

  // Enriquecer con datos del solicitante
  const admin = createAdminClient()
  const enriched = await Promise.all(
    solicitudes.map(async (s) => {
      const { data: p } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', s.solicitante_id)
        .single()
      const { data: a } = await admin.auth.admin.getUserById(s.solicitante_id)
      return {
        id: s.id,
        solicitante_nombre: p?.full_name ?? 'Asistente',
        solicitante_email: a?.user?.email ?? '',
        mensaje: s.mensaje,
        created_at: s.created_at,
      }
    })
  )

  return { data: enriched, count: enriched.length }
}
