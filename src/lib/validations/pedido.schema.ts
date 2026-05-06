import * as z from 'zod'

// ── PEDIDO DE ESTUDIOS ────────────────────────────────────────

export const pedidoSchema = z.object({
  paciente_id: z.string().uuid({ message: 'Seleccioná un paciente válido' }),
  // Snapshot del paciente (auto-completados en el form)
  paciente_nombre: z.string().min(1, 'Requerido'),
  paciente_dni: z.string().min(1, 'Requerido'),
  paciente_dob: z.string().min(1, 'Requerido'),
  obra_social_nombre: z.string().optional().nullable(),
  numero_afiliado: z.string().optional().nullable(),
  // Contenido clínico
  diagnostico: z.string().min(1, 'El diagnóstico es requerido'),
  estudios_pedidos: z.string().min(1, 'Indicá al menos un estudio'),
  indicaciones: z.string().optional().nullable(),
  fecha_pedido: z.string().optional(),
})

export type PedidoFormValues = z.infer<typeof pedidoSchema>

// ── CERTIFICADO MÉDICO ────────────────────────────────────────

export const CERTIFICADO_TIPOS = [
  'aptitud_fisica',
  'reposo',
  'diagnostico',
  'libre_deuda',
  'otro',
] as const

export type CertificadoTipo = (typeof CERTIFICADO_TIPOS)[number]

export const CERTIFICADO_TIPO_LABELS: Record<CertificadoTipo, string> = {
  aptitud_fisica: 'Aptitud Física',
  reposo: 'Reposo',
  diagnostico: 'Diagnóstico',
  libre_deuda: 'Libre Deuda',
  otro: 'Otro',
}

export const certificadoSchema = z
  .object({
    paciente_id: z.string().uuid({ message: 'Seleccioná un paciente válido' }),
    // Snapshot
    paciente_nombre: z.string().min(1, 'Requerido'),
    paciente_dni: z.string().min(1, 'Requerido'),
    paciente_dob: z.string().min(1, 'Requerido'),
    obra_social_nombre: z.string().optional().nullable(),
    numero_afiliado: z.string().optional().nullable(),
    // Tipo
    tipo: z.enum(CERTIFICADO_TIPOS),
    tipo_descripcion: z.string().optional().nullable(),
    // Contenido
    contenido: z.string().min(10, 'El contenido debe tener al menos 10 caracteres'),
    // Reposo (condicional)
    dias_reposo: z.coerce.number().int().min(1).optional().nullable(),
    fecha_inicio_reposo: z.string().optional().nullable(),
    // Fechas
    fecha_certificado: z.string().optional(),
    valido_hasta: z.string().optional().nullable(),
  })
  .transform((data) => ({
    ...data,
    dias_reposo: data.tipo === 'reposo' ? data.dias_reposo : null,
    fecha_inicio_reposo: data.tipo === 'reposo' ? data.fecha_inicio_reposo : null,
    tipo_descripcion: data.tipo === 'otro' ? data.tipo_descripcion : null,
    valido_hasta: data.valido_hasta === '' ? null : data.valido_hasta,
    fecha_inicio_reposo_clean:
      data.fecha_inicio_reposo === '' ? null : data.fecha_inicio_reposo,
  }))

export type CertificadoFormValues = z.infer<typeof certificadoSchema>
export type CertificadoFormInput = z.input<typeof certificadoSchema>
