import * as z from 'zod'

export const historiaSchema = z.object({
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
  proximo_control: z.string().optional().nullable(),
  peso_inicial: z.coerce.number().optional().nullable().or(z.literal('')),
  talla: z.coerce.number().optional().nullable().or(z.literal('')),
  perimetro_cintura: z.coerce.number().optional().nullable().or(z.literal('')),
}).transform(data => {
  // Replace empty strings with null for numeric fields to avoid inserting empty strings or 0s inadvertently
  return {
    ...data,
    peso_inicial: data.peso_inicial === '' ? null : data.peso_inicial,
    talla: data.talla === '' ? null : data.talla,
    perimetro_cintura: data.perimetro_cintura === '' ? null : data.perimetro_cintura,
    proximo_control: data.proximo_control === '' ? null : data.proximo_control,
  }
})

export type HistoriaFormData = z.infer<typeof historiaSchema>
export type HistoriaFormInput = z.input<typeof historiaSchema>
