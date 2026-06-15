import * as z from 'zod'

/** Helper: campo numérico opcional que acepta string vacío (input HTML) y lo convierte a null */
function numericOptional(min: number, max: number, label: string) {
  return z
    .union([
      z.coerce
        .number()
        .min(min, `${label}: valor mínimo ${min}`)
        .max(max, `${label}: valor máximo ${max}`),
      z.literal(''),
    ])
    .optional()
    .nullable()
}

export const consultaSchema = z
  .object({
    paciente_id: z.string().uuid(),

    fecha_hora: z.string().min(1, 'La fecha y hora son requeridas'),

    motivo_consulta: z
      .string()
      .min(3, 'El motivo de consulta es requerido (mínimo 3 caracteres)')
      .max(5000),

    anamnesis: z.string().max(10000).optional().nullable(),

    // Examen físico
    peso_kg:           numericOptional(1,   400,  'Peso (kg)'),
    talla_cm:          numericOptional(30,  250,  'Talla (cm)'),
    ta_sistolica:      numericOptional(50,  300,  'TA Sistólica'),
    ta_diastolica:     numericOptional(20,  200,  'TA Diastólica'),
    frecuencia_cardiaca: numericOptional(20, 300, 'FC (lpm)'),
    temperatura:       numericOptional(30,  45,   'Temperatura (°C)'),

    // Parámetros metabólicos
    glucemia_ayunas:       numericOptional(10, 1000, 'Glucemia en ayunas'),
    glucemia_postprandial: numericOptional(10, 1000, 'Glucemia postprandial'),
    hba1c:                 numericOptional(2,  20,   'HbA1c (%)'),
    trigliceridos:         numericOptional(10, 3000, 'Triglicéridos'),
    colesterol_ldl:        numericOptional(10, 1000, 'Colesterol LDL'),
    colesterol_hdl:        numericOptional(5,  200,  'Colesterol HDL'),

    // Diagnóstico y plan
    diagnostico:      z.string().max(10000).optional().nullable(),
    plan_terapeutico: z.string().max(10000).optional().nullable(),
    medicacion_actual: z.string().max(10000).optional().nullable(),
    observaciones:    z.string().max(10000).optional().nullable(),

    // Seguimiento — acepta fecha simple (YYYY-MM-DD) o datetime completo
    proximo_turno_sugerido: z
      .string()
      .optional()
      .nullable()
      .refine((v) => {
        if (!v || v.trim() === '') return true
        // Acepta YYYY-MM-DD o ISO datetime completo
        return /^\d{4}-\d{2}-\d{2}/.test(v)
      }, 'La fecha del próximo turno no tiene un formato válido.'),

    // Estado
    estado: z.enum(['borrador', 'finalizada']).default('borrador'),
  })
  .transform((data) => ({
    ...data,
    peso_kg:                data.peso_kg === '' ? null : data.peso_kg,
    talla_cm:               data.talla_cm === '' ? null : data.talla_cm,
    ta_sistolica:           data.ta_sistolica === '' ? null : data.ta_sistolica,
    ta_diastolica:          data.ta_diastolica === '' ? null : data.ta_diastolica,
    frecuencia_cardiaca:    data.frecuencia_cardiaca === '' ? null : data.frecuencia_cardiaca,
    temperatura:            data.temperatura === '' ? null : data.temperatura,
    glucemia_ayunas:        data.glucemia_ayunas === '' ? null : data.glucemia_ayunas,
    glucemia_postprandial:  data.glucemia_postprandial === '' ? null : data.glucemia_postprandial,
    hba1c:                  data.hba1c === '' ? null : data.hba1c,
    trigliceridos:          data.trigliceridos === '' ? null : data.trigliceridos,
    colesterol_ldl:         data.colesterol_ldl === '' ? null : data.colesterol_ldl,
    colesterol_hdl:         data.colesterol_hdl === '' ? null : data.colesterol_hdl,
    proximo_turno_sugerido: data.proximo_turno_sugerido === '' ? null : data.proximo_turno_sugerido,
  }))

export type ConsultaFormData  = z.infer<typeof consultaSchema>
export type ConsultaFormInput = z.input<typeof consultaSchema>
