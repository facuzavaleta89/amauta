// ============================================================================
// obra-social.ts — Criterio ÚNICO para resolver la obra social de un paciente.
// ----------------------------------------------------------------------------
// Módulo NEUTRO (sin 'server-only' ni deps de servidor): lo importan Server
// Components, Route Handlers y Client Components por igual, para que la obra social se
// resuelva EXACTAMENTE igual en la ficha, el listado, el dashboard, los formularios de
// pedidos/certificados, la difusión y los PDF. Antes vivía duplicado a mano en 12 sitios
// repartidos por 9 archivos, y las copias NO eran idénticas: unas trimeaban y otras no,
// así que la misma fila se veía distinta según la pantalla.
//
// ⚠ Tampoco importa tipos de `@/types`, a propósito: el parámetro es ESTRUCTURAL para
// poder recibir también las filas sin tipar (`any`) que devuelve supabase-js, que en este
// proyecto no tiene tipos generados de `Database`.
//
// ── EL CANON ────────────────────────────────────────────────────────────────
//   obras_sociales?.nombre ?? (obra_social_otro?.trim() || null)
//
//   Gana el nombre del CATÁLOGO (el join `obras_sociales ( nombre )`); si el paciente no
//   tiene una del catálogo, cae al TEXTO LIBRE (`obra_social_otro`), que es la vía de
//   escape legítima cuando la obra social no está en la lista.
//
// ── POR QUÉ EL TRIM (y por qué `|| null` y no `?? null`) ────────────────────
//   Un `obra_social_otro` de solo espacios —o vacío— es BASURA DE DATOS, no una obra
//   social: mostrarlo pinta un campo/badge/celda en blanco que el usuario lee como un
//   error de la app. Con `trim()` + `||` (que colapsa la cadena vacía, cosa que `??` NO
//   hace) el paciente queda como "sin obra social", que es la verdad.
//
//   ⚠ EL TRIM SIGUE HACIENDO FALTA, PERO YA NO POR LA ESCRITURA. Hoy la escritura SÍ
//   normaliza: `pacienteSchema` (`src/lib/validations/paciente.schema.ts`) cierra
//   `obra_social_otro` con `.transform((val) => val?.trim() || null)`, que recorta los
//   bordes y colapsa a `null` lo que quede vacío — o sea que por la UI ya no entra una
//   cadena en blanco a la base. Lo que este helper protege son las FILAS HISTÓRICAS,
//   cargadas ANTES de que existiera ese `.transform()`: esas siguen en la base tal como
//   se guardaron y nadie las normalizó (no hubo migración de datos). Sacar el trim
//   volvería a pintarlas vacías.
//   ⚠ Y protege también las filas que NO pasan por ese schema: la base es accesible por
//   PostgREST y el `.transform()` vive en la app, no en una constraint.
// ============================================================================

/**
 * Cualquier fila de paciente que traiga el join del catálogo y el texto libre.
 *
 * ⚠ Las dos propiedades son REQUERIDAS (aunque nullable), no opcionales: si fueran
 * opcionales, una proyección que se olvidara de traer `obra_social_otro` compilaría igual
 * y volvería a mostrar la obra social vacía — que es exactamente el bug que cerró la
 * Capa 1. Con propiedades requeridas, ese `.select()` incompleto no compila.
 */
export interface ConObraSocial {
  /** Join `obras_sociales ( nombre )`. NULL si la obra social no es del catálogo. */
  obras_sociales: { nombre: string } | null
  /** Texto libre, para las obras sociales que no están en el catálogo. */
  obra_social_otro: string | null
}

/**
 * Etiqueta ÚNICA para el paciente sin obra social — el fallback del `null` que devuelve
 * `resolverObraSocial`.
 *
 * Es un valor de **PRESENTACIÓN, no de datos**: "no tener cobertura" se modela como
 * ausencia (`obra_social_id IS NULL` y sin texto libre), nunca como una fila de catálogo.
 * La fila homónima que sembraba la migración 001 se eliminó justamente por eso
 * (migración **045**), porque convivía con la opción hardcodeada del formulario y hacía
 * que dos pacientes igualmente particulares quedaran modelados distinto.
 *
 * ⚠ **Nadie escribe este literal a mano.** Está acá para que el texto no pueda divergir
 * entre las ~8 superficies que lo muestran y el `<SelectItem>` del filtro de `/pacientes`
 * — misma lección que dejó `DIFUSION_LIMITE_DIARIO` (dos constantes del `100` que podían
 * separarse en silencio). Si mañana el médico quiere que diga "Particular" a secas, se
 * cambia acá y cambia en todos lados.
 *
 * ⚠ El texto es **idéntico** al de la opción hardcodeada de `patient-form.tsx`, y eso es
 * deliberado: quien filtra por "Particular / Sin obra social" tiene que ver exactamente a
 * los pacientes que dio de alta con esa opción.
 *
 * **Que un módulo de helpers exporte un valor de runtime no es una excepción** — este
 * archivo es NEUTRO, no `'use server'`, así que no le aplica la restricción de la nota
 * técnica 26 (que obliga a mudar las constantes compartidas a `src/types/` solo cuando el
 * productor es un módulo `'use server'`, que únicamente puede exportar funciones async).
 */
export const SIN_OBRA_SOCIAL_LABEL = 'Particular / Sin obra social'

/**
 * Valor CENTINELA del filtro de obra social del listado `/pacientes`, para pedir
 * "solo los pacientes sin ninguna cobertura".
 *
 * Viaja por la URL (`?obra_social_id=sin-obra-social`) y lo interpreta la query inline de
 * `src/app/(app)/pacientes/page.tsx`, que traduce el centinela a
 * `obra_social_id IS NULL` **Y** `obra_social_otro` nulo o vacío tras recortar — el
 * equivalente SQL exacto de lo que hace `resolverObraSocial` para devolver `null`.
 *
 * ⚠ **Es texto, y por eso NO puede colisionar con un id del catálogo**, que son enteros
 * de una columna `SERIAL`. El otro valor especial de ese mismo `<Select>` es `'all'`, que
 * ya usaba el mismo truco; este sigue el patrón. Legible a propósito: aparece en la URL
 * que el usuario ve, comparte o marca como favorita.
 *
 * ⚠ **No confundir con `SIN_OBRA` de `components/difusion/enviar-modal.tsx`** (`'__sin__'`),
 * que resuelve un problema parecido en OTRO filtro, con otro universo de datos (la lista
 * de destinatarios ya resuelta, en memoria) y sin pasar por la URL. Son independientes a
 * propósito; unificarlos ataría dos pantallas que no comparten ni el origen de los datos
 * ni el mecanismo de filtrado.
 */
export const FILTRO_SIN_OBRA_SOCIAL = 'sin-obra-social'

/**
 * Nombre de la obra social del paciente, o `null` si no tiene ninguna utilizable.
 *
 * **Sin default configurable, a propósito — y esto NO cambió** al aparecer
 * `SIN_OBRA_SOCIAL_LABEL`. El helper sigue devolviendo `string | null` y el fallback se
 * aplica en CADA CALL SITE (`resolverObraSocial(p) ?? SIN_OBRA_SOCIAL_LABEL`), no acá
 * adentro.
 *
 * ⚠ **No colapsar el fallback dentro del helper**, por más tentador que se vea: el modal
 * de envío de difusión (`components/difusion/enviar-modal.tsx`) **detecta al paciente sin
 * obra social por el `null`** — con él arma la bandera `haySinObra` y la opción "Sin obra
 * social" de su filtro (centinela `SIN_OBRA`). Si el helper dejara de devolver `null`, esa
 * opción desaparecería del filtro y los particulares se colarían como una obra social más
 * en la lista de `obrasUnicas`. Por eso `api/difusion/destinatarios/route.ts` y ese modal
 * son la **excepción explícita**: son los dos únicos consumidores que NO aplican el
 * fallback, y tienen su propio texto ("Sin obra social", en minúscula).
 */
export function resolverObraSocial(paciente: ConObraSocial): string | null {
  return paciente.obras_sociales?.nombre ?? (paciente.obra_social_otro?.trim() || null)
}
