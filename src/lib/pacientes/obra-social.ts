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
//   ⚠ No es una precaución teórica: hoy ese valor se puede GUARDAR desde la UI — el
//   schema Zod de pacientes no normaliza y su `refine` de "mínimo 2 caracteres" no se
//   aplica al string en blanco. Normalizar la ESCRITURA es trabajo aparte; este helper
//   protege la LECTURA de las filas que ya están en la base.
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
 * Nombre de la obra social del paciente, o `null` si no tiene ninguna utilizable.
 *
 * **Sin default configurable, a propósito.** Cada superficie decide qué hacer con el
 * `null`: la tarjeta móvil de `patient-table` **oculta** el badge, la celda de la tabla de
 * desktop muestra `'—'`, y el PDF omite la fila entera. Meter el default acá invitaría a
 * confundir esos criterios, que son distintos por diseño. Quien quiera un guion, escribe
 * `resolverObraSocial(p) ?? '—'` en el call site.
 */
export function resolverObraSocial(paciente: ConObraSocial): string | null {
  return paciente.obras_sociales?.nombre ?? (paciente.obra_social_otro?.trim() || null)
}
