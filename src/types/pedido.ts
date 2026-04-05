// ============================================================
// pedido.ts
// Tipos de documentos clínicos: pedidos, certificados,
// recetas y evoluciones
// ============================================================

// ── PEDIDOS DE ESTUDIOS ───────────────────────────────────────

export interface Pedido {
  id: string
  paciente_id: string
  paciente_nombre: string
  paciente_dni: string
  paciente_dob: string           // ISO date
  obra_social_nombre: string | null
  numero_afiliado: string | null
  diagnostico: string
  estudios_pedidos: string
  fecha_pedido: string           // ISO date
  indicaciones: string | null
  pdf_path: string | null
  pdf_generado_at: string | null
  firmado_por: string            // uuid del médico que firma
  created_at: string
  updated_at: string
}

export interface PedidoInsert {
  paciente_id: string
  paciente_nombre: string
  paciente_dni: string
  paciente_dob: string
  obra_social_nombre?: string
  numero_afiliado?: string
  diagnostico: string
  estudios_pedidos: string
  fecha_pedido?: string
  indicaciones?: string
  firmado_por: string
}

export interface PedidoUpdate extends Partial<PedidoInsert> {
  id: string
  pdf_path?: string
  pdf_generado_at?: string
}

// ── CERTIFICADOS ──────────────────────────────────────────────

export type CertificadoTipo =
  | 'aptitud_fisica'
  | 'reposo'
  | 'diagnostico'
  | 'libre_deuda'
  | 'otro'

export interface Certificado {
  id: string
  paciente_id: string
  paciente_nombre: string
  paciente_dni: string
  paciente_dob: string
  obra_social_nombre: string | null
  numero_afiliado: string | null
  tipo: CertificadoTipo
  tipo_descripcion: string | null
  contenido: string
  dias_reposo: number | null
  fecha_inicio_reposo: string | null
  fecha_certificado: string
  valido_hasta: string | null
  pdf_path: string | null
  pdf_generado_at: string | null
  firmado_por: string
  created_at: string
  updated_at: string
}

export interface CertificadoInsert {
  paciente_id: string
  paciente_nombre: string
  paciente_dni: string
  paciente_dob: string
  obra_social_nombre?: string
  numero_afiliado?: string
  tipo?: CertificadoTipo
  tipo_descripcion?: string
  contenido: string
  dias_reposo?: number
  fecha_inicio_reposo?: string
  fecha_certificado?: string
  valido_hasta?: string
  firmado_por: string
}

export interface CertificadoUpdate extends Partial<CertificadoInsert> {
  id: string
  pdf_path?: string
  pdf_generado_at?: string
}

// ── RECETAS ───────────────────────────────────────────────────

export interface Receta {
  id: string
  paciente_id: string
  paciente_nombre: string
  paciente_dni: string
  paciente_dob: string
  obra_social_nombre: string | null
  numero_afiliado: string | null
  diagnostico: string
  medicacion: string
  fecha_receta: string
  fecha_vencimiento: string | null
  numero_receta: string | null
  firma_digital_ref: string | null
  pdf_path: string | null
  pdf_generado_at: string | null
  firmado_por: string            // solo médicos pueden firmar recetas
  created_at: string
  updated_at: string
}

export interface RecetaInsert {
  paciente_id: string
  paciente_nombre: string
  paciente_dni: string
  paciente_dob: string
  obra_social_nombre?: string
  numero_afiliado?: string
  diagnostico: string
  medicacion: string
  fecha_receta?: string
  numero_receta?: string
  firma_digital_ref?: string
  firmado_por: string
}

export interface RecetaUpdate extends Partial<RecetaInsert> {
  id: string
  pdf_path?: string
  pdf_generado_at?: string
  fecha_vencimiento?: string
}

// ── EVOLUCIONES ───────────────────────────────────────────────

export interface Evolucion {
  id: string
  paciente_id: string
  fecha: string                  // ISO date

  // Antropometría
  peso: number | null
  perimetro_cintura: number | null

  // Metabolismo glucídico
  hba1c: number | null
  glucemia_ayunas: number | null
  insulina_basal: number | null
  homa_ir: number | null

  // Perfil lipídico
  colesterol_total: number | null
  hdl: number | null
  ldl: number | null
  trigliceridos: number | null

  // Perfil hepático
  got_ast: number | null
  gpt_alt: number | null
  ggt: number | null
  fosfatasa_alcalina: number | null

  // Presión arterial
  tension_sistolica: number | null
  tension_diastolica: number | null
  frecuencia_cardiaca: number | null

  observaciones: string | null
  registrado_por: string
  created_at: string
  updated_at: string
}

export interface EvolucionInsert {
  paciente_id: string
  fecha?: string
  peso?: number
  perimetro_cintura?: number
  hba1c?: number
  glucemia_ayunas?: number
  insulina_basal?: number
  homa_ir?: number
  colesterol_total?: number
  hdl?: number
  ldl?: number
  trigliceridos?: number
  got_ast?: number
  gpt_alt?: number
  ggt?: number
  fosfatasa_alcalina?: number
  tension_sistolica?: number
  tension_diastolica?: number
  frecuencia_cardiaca?: number
  observaciones?: string
  registrado_por: string
}

export interface EvolucionUpdate extends Partial<Omit<EvolucionInsert, 'paciente_id' | 'registrado_por'>> {
  id: string
}

// ── HISTORIA CLÍNICA ──────────────────────────────────────────

export interface HistoriaClinica {
  id: string
  paciente_id: string
  antecedentes_patologicos: string | null
  medicacion_diaria: string | null
  habitos_toxicos: string | null
  actividad_fisica: string | null
  actividad_laboral: string | null
  antecedentes_quirurgicos: string | null
  clinica_actual: string | null
  examen_fisico: string | null
  laboratorio: string | null
  estudios_complementarios: string | null
  conducta: string | null
  proximo_control: string | null    // ISO date
  peso_inicial: number | null
  talla: number | null
  perimetro_cintura: number | null
  creado_por: string
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface HistoriaClinicaInsert {
  paciente_id: string
  antecedentes_patologicos?: string
  medicacion_diaria?: string
  habitos_toxicos?: string
  actividad_fisica?: string
  actividad_laboral?: string
  antecedentes_quirurgicos?: string
  clinica_actual?: string
  examen_fisico?: string
  laboratorio?: string
  estudios_complementarios?: string
  conducta?: string
  proximo_control?: string
  peso_inicial?: number
  talla?: number
  perimetro_cintura?: number
  creado_por: string
}

export interface HistoriaClinicaUpdate extends Partial<Omit<HistoriaClinicaInsert, 'paciente_id' | 'creado_por'>> {
  id: string
  updated_by: string
}

// ── ESTUDIOS ──────────────────────────────────────────────────

export interface Estudio {
  id: string
  paciente_id: string
  nombre: string
  tipo: string | null
  fecha_estudio: string | null   // ISO date
  descripcion: string | null
  storage_path: string
  file_name: string
  file_size: number | null
  mime_type: string | null
  subido_por: string
  created_at: string
}

export interface EstudioInsert {
  paciente_id: string
  nombre: string
  tipo?: string
  fecha_estudio?: string
  descripcion?: string
  storage_path: string
  file_name: string
  file_size?: number
  mime_type?: string
  subido_por: string
}
