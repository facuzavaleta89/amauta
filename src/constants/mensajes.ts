// ============================================================================
// mensajes.ts — Constantes compartidas del módulo de mensajería.
// ----------------------------------------------------------------------------
// Módulo NEUTRO (sin imports, sin 'server-only', sin deps de servidor): lo importan
// tanto la server action que pagina la bandeja como el Client Component que pinta el
// botón de "cargar más", para que los dos usen SIEMPRE el mismo valor.
// Mismo criterio que `constants/difusion.ts` con `DIFUSION_LIMITE_DIARIO`.
// ============================================================================

/**
 * Cuántos hilos trae cada página de la bandeja de mensajes.
 *
 * ⚠ FUENTE ÚNICA. Es el número que hay que tocar —acá y solo acá— para probar la
 * paginación: con 17 hilos en el consultorio más grande, un tamaño de 20 hace que el
 * botón "Cargar más conversaciones" NO APAREZCA NUNCA. Bajarlo a 5 lo hace visible sin
 * tocar ninguna otra línea del proyecto.
 *
 * Consumidores: `obtenerBandeja()` (`app/(app)/mensajes/actions.ts`, como valor por
 * defecto del parámetro `limite`) y `(app)/mensajes/page.tsx` (que no lo pasa: usa el
 * default). El componente NO lo necesita — recibe `hayMas` ya calculado del servidor.
 */
export const BANDEJA_PAGINA = 20

/**
 * Tope DURO del tamaño de página que la action acepta del cliente.
 *
 * ⚠ No es un default, es un techo. `obtenerBandeja` es una server action, o sea
 * invocable por cualquier cliente autenticado: sin este tope, un `limite: 100000`
 * traería la tabla entera —y con ella TODAS las respuestas de esos hilos, porque el
 * cálculo de la señal de no leídos no tiene límite propio—. Es un DoS de una línea.
 *
 * El criterio es el de `GET /api/consultas`, la única otra paginación del repo, que
 * corta con `Math.min(50, …)`.
 */
export const BANDEJA_PAGINA_MAX = 50
