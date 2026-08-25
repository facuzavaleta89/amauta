import * as z from 'zod'
import { isValidDateStr } from './shared'

// ── Helpers locales ───────────────────────────────────────────────────────────
/** Solo números, entre 1 y 8 dígitos (DNI argentino) */
const dniRegex = /^\d{7,8}$/

// ── PEDIDO DE ESTUDIOS ────────────────────────────────────────────────────────

export const pedidoSchema = z.object({
  paciente_id: z.string().uuid({ message: 'Seleccioná un paciente válido' }),

  // Snapshot del paciente — validamos longitud y formato para evitar datos inválidos
  paciente_nombre: z
    .string()
    .min(1, 'Requerido')
    .max(150, 'Nombre demasiado largo'),
  paciente_dni: z
    .string()
    .min(1, 'Requerido')
    .max(8, 'DNI inválido')
    .regex(dniRegex, 'El DNI debe contener entre 7 y 8 dígitos'),
  paciente_dob: z
    .string()
    .min(1, 'Requerido')
    .refine(isValidDateStr, 'Fecha de nacimiento inválida'),

  obra_social_nombre: z.string().max(150).optional().nullable(),
  numero_afiliado: z.string().max(50).optional().nullable(),

  // Contenido clínico
  diagnostico: z
    .string()
    .min(1, 'El diagnóstico es requerido')
    .max(2000, 'Máximo 2000 caracteres'),
  estudios_pedidos: z
    .string()
    .min(1, 'Indicá al menos un estudio')
    .max(2000, 'Máximo 2000 caracteres'),
  indicaciones: z.string().max(2000, 'Máximo 2000 caracteres').optional().nullable(),

  // fecha_pedido: validamos que sea fecha real si se proporciona
  fecha_pedido: z
    .string()
    .refine((v) => !v || isValidDateStr(v), 'Fecha de pedido inválida')
    .optional(),
})

export type PedidoFormValues = z.infer<typeof pedidoSchema>

// ── CERTIFICADO MÉDICO ────────────────────────────────────────────────────────

export const CERTIFICADO_TIPOS = [
  'aptitud_fisica',
  'reposo',
  'diagnostico',
  'libre_deuda',
  'otro',
] as const

export type CertificadoTipo = (typeof CERTIFICADO_TIPOS)[number]

export const certificadoSchema = z
  .object({
    paciente_id: z.string().uuid({ message: 'Seleccioná un paciente válido' }),

    // Snapshot — con límites
    paciente_nombre: z.string().min(1, 'Requerido').max(150),
    paciente_dni: z
      .string()
      .min(1, 'Requerido')
      .max(8)
      .regex(dniRegex, 'El DNI debe contener entre 7 y 8 dígitos'),
    paciente_dob: z
      .string()
      .min(1, 'Requerido')
      .refine(isValidDateStr, 'Fecha de nacimiento inválida'),

    obra_social_nombre: z.string().max(150).optional().nullable(),
    numero_afiliado: z.string().max(50).optional().nullable(),

    // Tipo (ya no obligatorio — libre redacción)
    tipo: z.enum(CERTIFICADO_TIPOS).optional().nullable(),
    tipo_descripcion: z.string().max(200).optional().nullable(),

    // Contenido
    contenido: z
      .string()
      .min(10, 'El contenido debe tener al menos 10 caracteres')
      .max(5000, 'Máximo 5000 caracteres'),

    // Fechas del documento
    fecha_certificado: z
      .string()
      .refine((v) => !v || isValidDateStr(v), 'Fecha de certificado inválida')
      .optional(),
    valido_hasta: z
      .string()
      .refine((v) => !v || isValidDateStr(v), 'Fecha de validez inválida')
      .optional()
      .nullable(),
  })
  .transform((data) => ({
    ...data,
    tipo:         data.tipo ?? null,
    valido_hasta: data.valido_hasta === '' ? null : data.valido_hasta,
  }))

export type CertificadoFormValues = z.infer<typeof certificadoSchema>
export type CertificadoFormInput = z.input<typeof certificadoSchema>
