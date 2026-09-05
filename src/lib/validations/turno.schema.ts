import * as z from 'zod'
import { isValidDateStr } from './shared'

// ── Constantes ────────────────────────────────────────────────────────────────
const MIN_DURATION_MS = 10 * 60 * 1000 // 10 minutos mínimo

// ── Turno base ────────────────────────────────────────────────────────────────
export const turnoBaseSchema = z.object({
  paciente_id: z.string().uuid().optional().nullable(),
  paciente_nombre_libre: z
    .string()
    .max(150, 'El nombre es demasiado largo')
    .optional()
    .nullable(),
  fecha_inicio: z
    .string()
    .min(1, 'La fecha de inicio es obligatoria')
    .refine(isValidDateStr, 'Fecha de inicio inválida'),
  fecha_fin: z
    .string()
    .min(1, 'La fecha de fin es obligatoria')
    .refine(isValidDateStr, 'Fecha de fin inválida'),
  motivo: z.string().max(500, 'Máximo 500 caracteres').optional().nullable(),
  notas: z.string().max(1000, 'Máximo 1000 caracteres').optional().nullable(),
  estado: z
    .enum(['pendiente', 'confirmado', 'presente', 'ausente', 'cancelado', 'reprogramado', 'pendiente_confirmar'])
    .default('pendiente'),
  categoria: z
    .enum(['turno_medico', 'curso', 'personal', 'administrativo', 'recordatorio'])
    .default('turno_medico'),
  origen: z
    .enum(['manual', 'desde_hc'])
    .default('manual'),
  consulta_id: z.string().uuid().optional().nullable(),
})

// ── turnoSchema (creación — campos requeridos + cross-field) ──────────────────
export const turnoSchema = turnoBaseSchema
  .superRefine((data, ctx) => {
    // 1. Si es turno_medico, se requiere paciente_id obligatoriamente
    if (data.categoria === 'turno_medico') {
      if (!data.paciente_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Debe seleccionar un paciente para un turno médico',
          path: ['paciente_id'],
        })
      }
      // Validar nombre si se ingresó manualmente (sin seleccionar de la lista)
      if (data.paciente_nombre_libre && data.paciente_nombre_libre.trim().length > 0 && data.paciente_nombre_libre.trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'El nombre debe tener al menos 2 caracteres',
          path: ['paciente_nombre_libre'],
        })
      }
    } else {
      // 2. Si no es turno_medico, motivo (Título / descripción) es requerido
      if (!data.motivo || data.motivo.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'El título / descripción es obligatorio',
          path: ['motivo'],
        })
      }
    }

    if (!isValidDateStr(data.fecha_inicio) || !isValidDateStr(data.fecha_fin)) return

    const inicio = new Date(data.fecha_inicio)
    const fin    = new Date(data.fecha_fin)

    if (fin <= inicio) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'La hora de fin debe ser posterior a la de inicio', path: ['fecha_fin'] })
    }
    
    // Si no es un turno sin horario establecido, se valida duración mínima
    if (data.estado !== 'pendiente_confirmar') {
      if (fin.getTime() - inicio.getTime() < MIN_DURATION_MS) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El turno debe durar al menos 10 minutos', path: ['fecha_fin'] })
      }
    }
  })

// ── turnoUpdateWithDatesSchema (el schema del PATCH) ──────────────────────────
//
// Versión con cross-field: schema PROPIO sin defaults para PATCH de drag/resize.
// No extiende turnoBaseSchema para evitar que los .default() inyecten valores
// que sobreescriben los datos existentes en la DB (ej: categoria: 'turno_medico').
//
// ⚠ Acá vivía `turnoUpdateSchema = turnoBaseSchema.partial()`. Se ELIMINÓ: no tenía
// consumidores y era una trampa activa — al derivar del base heredaba los `.default()`
// de `estado`, `categoria` y `origen`, que se habrían inyectado en CADA PATCH pisando
// los valores guardados. Es exactamente lo que el comentario de acá arriba explica que
// hay que evitar, así que tener las dos formas conviviendo invitaba a usar la incorrecta.
export const turnoUpdateWithDatesSchema = z
  .object({
    fecha_inicio: z
      .string()
      .refine(isValidDateStr, 'Fecha de inicio inválida')
      .optional(),
    fecha_fin: z
      .string()
      .refine(isValidDateStr, 'Fecha de fin inválida')
      .optional(),
    estado: z
      .enum(['pendiente', 'confirmado', 'presente', 'ausente', 'cancelado', 'reprogramado', 'pendiente_confirmar'])
      .optional(),
    motivo: z.string().max(500).optional().nullable(),
    notas: z.string().max(1000).optional().nullable(),

    // ── Campos editables desde el modal ──────────────────────────────────────
    // Hasta esta tanda no estaban declarados, y como este es un `z.object` SIN
    // `.passthrough()`, Zod los borraba del body antes del `.update()`: cambiar el
    // paciente o la categoría de un turno existente NO HACÍA NADA y el toast decía
    // "Turno actualizado". `turno-form.tsx` siempre los mandó; el bug era acá.
    //
    // ⚠ `categoria` va SIN `.default()`, a propósito: un default acá lo inyectaría en
    // todo PATCH que no lo mande (drag/resize incluido) y pisaría el valor guardado.
    categoria: z
      .enum(['turno_medico', 'curso', 'personal', 'administrativo', 'recordatorio'])
      .optional(),
    paciente_id: z.string().uuid().optional().nullable(),
    paciente_nombre_libre: z
      .string()
      .max(150, 'El nombre es demasiado largo')
      .optional()
      .nullable(),

    // ⚠⚠ `origen` y `consulta_id` NO se declaran, y NO es un olvido: NO AGREGARLOS.
    // Son campos de SISTEMA. El formulario no tiene ningún input para ellos (los
    // arrastra desde `initialData` sólo para no perderlos), así que el usuario no puede
    // tocarlos y que Zod los descarte es el comportamiento correcto.
    //  · `origen` registra de dónde salió el turno ('manual' | 'desde_hc'). Editable,
    //    mentiría sobre la procedencia — que es lo único que ese campo existe para decir.
    //  · `consulta_id` es peor: tiene el índice único parcial `turnos_consulta_id_unico`
    //    (migración 038), que garantiza UN TURNO POR CONSULTA. Editable, permitiría
    //    romper esa relación o chocar contra un 23505 que nadie maneja.
    // Los escriben `POST /api/turnero` y los dos endpoints de consultas, y nadie más.
  })
  .superRefine((data, ctx) => {
    // Solo aplicar si se envían ambas fechas en el mismo request
    if (!data.fecha_inicio || !data.fecha_fin) return
    if (!isValidDateStr(data.fecha_inicio) || !isValidDateStr(data.fecha_fin)) return

    const inicio = new Date(data.fecha_inicio)
    const fin    = new Date(data.fecha_fin)

    if (fin <= inicio) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'La hora de fin debe ser posterior a la de inicio', path: ['fecha_fin'] })
    }

    if (data.estado !== 'pendiente_confirmar') {
      if (fin.getTime() - inicio.getTime() < MIN_DURATION_MS) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'El turno debe durar al menos 10 minutos', path: ['fecha_fin'] })
      }
    }

    // ⚠ El cruce `categoria` / `paciente_id` NO se valida acá, y NO se puede.
    // `turnoSchema` (creación) sí lo hace, porque ahí el body trae la fila COMPLETA. Un
    // PATCH es PARCIAL: puede mandar `categoria: 'turno_medico'` sin `paciente_id`, o
    // `paciente_id: null` sin `categoria`, y en los dos casos el dato que falta está en la
    // FILA GUARDADA, que este schema no ve. La regla necesita el valor EFECTIVO de los dos
    // (body si vino, fila si no), así que vive en el endpoint, después del fetch del turno.
    // Ver `PATCH /api/turnero/[id]`.
  })

export type TurnoFormData = z.input<typeof turnoSchema>

// ── Bloqueo de agenda ─────────────────────────────────────────────────────────

// Objeto base sin refinements (necesario para poder llamar .partial() en Zod v4)
const bloqueoAgendaBaseObject = z.object({
  fecha_inicio: z
    .string()
    .min(1, 'La fecha de inicio es obligatoria')
    .refine(isValidDateStr, 'Fecha de inicio inválida'),
  fecha_fin: z
    .string()
    .min(1, 'La fecha de fin es obligatoria')
    .refine(isValidDateStr, 'Fecha de fin inválida'),
  motivo: z.string().max(500, 'Máximo 500 caracteres').optional().nullable(),
  es_recurrente: z.boolean().default(false),
  recurrencia_fin: z
    .string()
    .refine(
      (v) => !v || isValidDateStr(v),
      'Fecha de fin de recurrencia inválida'
    )
    .refine(
      (v) => !v || new Date(v) > new Date(),
      'La fecha de fin de recurrencia debe ser futura'
    )
    .optional()
    .nullable(),
  dias_semana: z.array(z.number().int().min(0).max(6)).optional().nullable(),
})

export const bloqueoAgendaSchema = bloqueoAgendaBaseObject
  .superRefine((data, ctx) => {
    if (!isValidDateStr(data.fecha_inicio) || !isValidDateStr(data.fecha_fin)) return

    const inicio = new Date(data.fecha_inicio)
    const fin    = new Date(data.fecha_fin)

    if (fin <= inicio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La hora de fin debe ser posterior a la de inicio',
        path: ['fecha_fin'],
      })
    }

    if (fin.getTime() - inicio.getTime() < MIN_DURATION_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El bloqueo debe durar al menos 10 minutos',
        path: ['fecha_fin'],
      })
    }
  })

// Schema de actualización parcial — sin superRefine para permitir .partial() en Zod v4
export const bloqueoAgendaUpdateSchema = bloqueoAgendaBaseObject.partial()
export type BloqueoFormData = z.input<typeof bloqueoAgendaSchema>
