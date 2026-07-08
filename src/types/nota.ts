// ============================================================
// nota.ts
// Tipos de notas internas personales
// ============================================================

export interface Nota {
  id: string
  user_id: string
  titulo: string
  cuerpo: string
  created_at: string
  updated_at: string
}

export interface NotaInsert {
  user_id: string
  titulo: string
  cuerpo: string
}

export interface NotaUpdate {
  titulo?: string
  cuerpo?: string
}
