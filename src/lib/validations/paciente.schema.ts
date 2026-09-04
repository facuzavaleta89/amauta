import { z } from 'zod'

// ── Helpers ───────────────────────────────────────────────────────────────────
function isValidDate(str: string) {
  if (!str) return false
  const d = new Date(str)
  return !isNaN(d.getTime())
}

function getAge(fechaNac: string): number {
  const birth = new Date(fechaNac)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

// ── Constantes compartidas ────────────────────────────────────────────────────

/**
 * Formato aceptado de teléfono: dígitos, espacios, `+`, `-`, `(` y `)`, entre 6 y 20
 * caracteres. Vive acá —y no inline— porque lo usan DOS declaraciones del archivo: el
 * campo `telefono` del alta normal (opcional) y el del alta rápida (obligatorio). Si el
 * regex se duplicara, las dos reglas podrían divergir en silencio.
 */
const TELEFONO_REGEX = /^[\d\s\+\-\(\)]{6,20}$/
const TELEFONO_MENSAJE = 'Formato inválido (ej: +54 11 1234-5678)'

// ── Schema ────────────────────────────────────────────────────────────────────

/**
 * Objeto base **SIN refinements**, necesario para poder derivar schemas con `.pick()`
 * (mismo motivo por el que existe `bloqueoAgendaBaseObject` en `turno.schema.ts`).
 *
 * ⚠⚠ **No es una preferencia de estilo: sin esto se rompe el BUILD.** En Zod 4 `.refine()`
 * devuelve un **`ZodObject`** (en Zod 3 devolvía `ZodEffects`), así que `.pick()` **existe
 * en el tipo y `tsc` compila sin una queja** — pero al ejecutarse lanza
 * *".pick() cannot be used on object schemas containing refinements"*. Como los schemas se
 * declaran a **nivel de módulo**, ese throw ocurre **al importar el archivo**, y
 * `next build` importa los módulos para recolectar los datos de las rutas: el build entero
 * se cae. Mismo modo de fallo que tenía el cliente de Resend antes del lazy-init (nota
 * técnica 16). Lo mismo aplica a `.omit()` y `.partial()`; `.extend()` es la única que sí
 * funciona sobre un schema ya refinado.
 *
 * **Regla:** toda derivación (`.pick()`, `.omit()`, `.partial()`) va sobre
 * `pacienteBaseObject`, **nunca** sobre `pacienteSchema`.
 */
const pacienteBaseObject = z.object({
  dni: z
    .string()
    .min(7, 'El DNI debe tener al menos 7 dígitos')
    .max(8, 'El DNI no puede tener más de 8 dígitos')
    .regex(/^\d+$/, 'El DNI solo debe contener números'),

  nombre_completo: z
    .string()
    .min(3, 'El nombre debe tener al menos 3 caracteres')
    .max(100, 'El nombre es demasiado largo')
    .regex(
      /^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s'\-\.]+$/,
      'El nombre solo puede contener letras, espacios y guiones'
    )
    .trim(),

  fecha_nacimiento: z
    .string()
    .min(1, 'La fecha de nacimiento es obligatoria')
    .refine(isValidDate, 'Ingresá una fecha válida')
    .refine(
      (v) => new Date(v) <= new Date(),
      'La fecha de nacimiento no puede ser en el futuro'
    )
    .refine(
      (v) => getAge(v) <= 120,
      'La edad no puede superar los 120 años'
    ),

  sexo: z.enum(['masculino', 'femenino', 'otro'], {
    message: 'Seleccioná un sexo',
  }),

  telefono: z
    .string()
    .regex(TELEFONO_REGEX, TELEFONO_MENSAJE)
    .optional()
    .or(z.literal('')),

  email: z
    .string()
    .email('Ingresá un email válido')
    .optional()
    .or(z.literal('')),

  provincia: z.string().max(50).optional().or(z.literal('')),
  ciudad: z.string().max(50).optional().or(z.literal('')),

  // ⚠ Los dos campos de obra social aceptan NULL a propósito, y no es cosmético:
  // SOLTAR la obra social del catálogo (pasar a texto libre o a "particular") exige
  // mandar `obra_social_id: null` EXPLÍCITO. Con `undefined` la clave se pierde en el
  // `JSON.stringify` del formulario, nunca llega al PATCH y la columna conserva el valor
  // viejo — el UPDATE no la incluye. Era un bug real: el cambio no persistía y el toast
  // decía "Paciente actualizado".
  obra_social_id: z.number().nullable().optional(),
  // El `.transform()` normaliza en la ESCRITURA (patrón de `receta.schema.ts` →
  // `indicaciones`/`diagnostico`): recorta los espacios de BORDE y colapsa a `null` lo que
  // quede vacío, así un texto de solo espacios no entra sucio a la base. ⚠ El trim es de
  // bordes: un nombre real con espacios internos ("Obra Social del Personal Rural") se
  // guarda entero.
  obra_social_otro: z
    .string()
    .max(100, 'El nombre no puede superar los 100 caracteres')
    .nullable()
    .optional()
    .or(z.literal(''))
    .transform((val) => val?.trim() || null),
  numero_afiliado: z.string().max(50).optional().or(z.literal('')),
})

/**
 * Schema del alta de paciente (formulario completo de `/pacientes/nuevo` y el PATCH de
 * edición). Es `pacienteBaseObject` **más** el refine cruzado de obra social.
 *
 * ⚠ Este es el valor refinado: **no derivar de acá** (ver el JSDoc de `pacienteBaseObject`).
 */
export const pacienteSchema = pacienteBaseObject.refine(
  (data) => {
    // Si no hay obra_social_id y hay texto en obra_social_otro, debe tener al menos 2 chars.
    // Sin `.trim()`: el valor ya llega recortado por el `.transform()` del campo.
    if (!data.obra_social_id && data.obra_social_otro && data.obra_social_otro.length > 0) {
      return data.obra_social_otro.length >= 2
    }
    return true
  },
  {
    message: 'Ingresá el nombre de la obra social (mínimo 2 caracteres)',
    path: ['obra_social_otro'],
  }
)

// ⚠ Dos tipos porque el `.transform()` de `obra_social_otro` hace que ENTRADA y SALIDA
// difieran: el form se tipa con el INPUT y `handleSubmit` entrega el OUTPUT. Ver el
// `useForm` de tres genéricos en `patient-form.tsx` (mismo patrón que `consulta-detail.tsx`).
export type PacienteFormValues = z.infer<typeof pacienteSchema>
export type PacienteFormInput  = z.input<typeof pacienteSchema>

// ── Alta rápida (desde el modal del turnero) ──────────────────────────────────

/**
 * Los 5 campos mínimos para dar de alta un paciente **desde el modal del turno**, sin salir
 * del turnero. Deriva de `pacienteBaseObject` para **no duplicar** las reglas: el regex del
 * DNI, el del nombre y los tres refines de la fecha de nacimiento son exactamente los mismos
 * que valida el alta completa.
 *
 * ⚠ El `.pick()` va sobre `pacienteBaseObject` y **NUNCA** sobre `pacienteSchema` — ver el
 * JSDoc de aquél: sobre el refinado compila y rompe el build.
 *
 * ⚠⚠ **`telefono` es OBLIGATORIO acá y opcional en el alta normal, a propósito.** No es una
 * inconsistencia: es una regla de **calidad de dato propia de este flujo**, no un invariante
 * de la entidad. Un paciente que se carga en el momento de agendarle un turno necesita un
 * teléfono de contacto —es para eso que se lo está cargando—; uno que se carga desde
 * `/pacientes` puede no tenerlo todavía. **El servidor sigue sin exigirlo** (`POST
 * /api/pacientes` valida con `pacienteSchema`, donde el campo es opcional) y eso también es
 * deliberado: endurecerlo ahí cambiaría la regla del alta normal, que no es lo que se quiso.
 * La consecuencia asumida es que esta exigencia vive **solo en el cliente**.
 *
 * ⚠ El `.extend()` del teléfono **no lleva `.optional()` ni `.or(z.literal(''))`**. Sin eso,
 * la cadena vacía —que es lo que manda un `<input>` en blanco— **pasaría la validación** y el
 * campo sería obligatorio solo en el asterisco del label.
 */
export const pacienteAltaRapidaSchema = pacienteBaseObject
  .pick({
    nombre_completo: true,
    dni: true,
    telefono: true,
    sexo: true,
    fecha_nacimiento: true,
  })
  .extend({
    telefono: z.string().regex(TELEFONO_REGEX, TELEFONO_MENSAJE),
  })

export type PacienteAltaRapidaValues = z.infer<typeof pacienteAltaRapidaSchema>
