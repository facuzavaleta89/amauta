import * as z from 'zod'

export const historiaSchema = z
  .object({
    antecedentes_patologicos: z.string().optional().nullable(),
    medicacion_diaria: z.string().optional().nullable(),
    habitos_toxicos: z.string().optional().nullable(),
    actividad_fisica: z.string().optional().nullable(),
    actividad_laboral: z.string().optional().nullable(),
    antecedentes_quirurgicos: z.string().optional().nullable(),
    clinica_actual: z.string().optional().nullable(),
    examen_fisico: z.string().optional().nullable(),
    laboratorio: z.string().optional().nullable(),
    estudios_complementarios: z.string().optional().nullable(),
    conducta: z.string().optional().nullable(),

    proximo_control: z
      .string()
      .refine(
        (v) => !v || new Date(v) > new Date(new Date().toDateString()),
        'La fecha del próximo control debe ser futura'
      )
      .optional()
      .nullable(),

    // Medidas físicas con rangos clínicos razonables
    peso_inicial: z
      .union([
        z.coerce
          .number()
          .min(1, 'El peso debe ser mayor a 0')
          .max(400, 'El peso ingresado parece incorrecto (máx. 400 kg)'),
        z.literal(''),
      ])
      .optional()
      .nullable(),

    talla: z
      .union([
        z.coerce
          .number()
          .min(30, 'La talla debe ser mayor a 30 cm')
          .max(250, 'La talla ingresada parece incorrecta (máx. 250 cm)'),
        z.literal(''),
      ])
      .optional()
      .nullable(),

    perimetro_cintura: z
      .union([
        z.coerce
          .number()
          .min(20, 'El perímetro debe ser mayor a 20 cm')
          .max(200, 'El perímetro ingresado parece incorrecto (máx. 200 cm)'),
        z.literal(''),
      ])
      .optional()
      .nullable(),
  })
  .transform((data) => ({
    ...data,
    peso_inicial: data.peso_inicial === '' ? null : data.peso_inicial,
    talla: data.talla === '' ? null : data.talla,
    perimetro_cintura: data.perimetro_cintura === '' ? null : data.perimetro_cintura,
    proximo_control: data.proximo_control === '' ? null : data.proximo_control,
  }))

export type HistoriaFormData = z.infer<typeof historiaSchema>
export type HistoriaFormInput = z.input<typeof historiaSchema>
