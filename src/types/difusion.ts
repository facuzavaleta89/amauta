// ============================================================
// difusion.ts
// Tipos del área de difusión: posts y envíos
// ============================================================

export type DifusionEstado = 'borrador' | 'listo' | 'enviado' | 'archivado'
export type DifusionCanal = 'email' | 'whatsapp' | 'ambos'

// ── POSTS ─────────────────────────────────────────────────────

export interface DifusionPost {
  id: string
  titulo: string
  contenido: string
  estado: DifusionEstado
  canal: DifusionCanal | null
  asunto_email: string | null
  imagen_path: string | null
  medico_id: string              // tenant key — agenda del médico
  creado_por: string
  created_at: string
  updated_at: string
}

export interface DifusionPostInsert {
  titulo: string
  contenido: string
  estado?: DifusionEstado
  canal?: DifusionCanal
  asunto_email?: string
  imagen_path?: string
  medico_id: string              // debe ser get_medico_id()
  creado_por: string
}

export interface DifusionPostUpdate extends Partial<Omit<DifusionPostInsert, 'medico_id' | 'creado_por'>> {
  id: string
}

// ── ENVÍOS ────────────────────────────────────────────────────

export interface DifusionEnvio {
  id: string
  post_id: string
  paciente_id: string | null
  email_destino: string | null
  tel_destino: string | null
  canal: DifusionCanal
  enviado_ok: boolean
  error_msg: string | null
  enviado_at: string | null
  enviado_por: string
  created_at: string
}

export interface DifusionEnvioInsert {
  post_id: string
  paciente_id?: string
  email_destino?: string
  tel_destino?: string
  canal: DifusionCanal
  enviado_ok?: boolean
  error_msg?: string
  enviado_at?: string
  enviado_por: string
}
