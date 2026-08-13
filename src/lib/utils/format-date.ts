/**
 * Casa ÚNICA del formateo de fechas del proyecto.
 *
 * ⚠ TODO formateo de fecha pasa por acá. No escribir un helper de fecha nuevo
 * en otro archivo ni llamar a `format()` de date-fns / `toLocaleDateString()`
 * directamente: renderizan en la zona del RUNTIME, que en Vercel es UTC. Hasta
 * la unificación convivían SEIS implementaciones (este canon + 5 duplicados
 * repartidos entre `lib/utils.ts`, las dos plantillas PDF y /verificar), cinco
 * de ellas sin zona fija. Ver CLAUDE.md → nota técnica 18.
 *
 * Módulo NEUTRO (sin `server-only`): lo importan Server Components, Route
 * Handlers, plantillas de @react-pdf/renderer y Client Components.
 */
import { formatInTimeZone } from 'date-fns-tz'
import { es } from 'date-fns/locale'

/**
 * Zona horaria del consultorio. Se expone como constante para no repetir el
 * string mágico ni arriesgar una variante mal escrita.
 */
export const TZ_AR = 'America/Argentina/Buenos_Aires'

/**
 * Formatea un instante en la zona horaria de Argentina.
 *
 * ⚠ NO "simplificar" esto a `format()` de date-fns: `format` renderiza en la zona
 * horaria DEL RUNTIME, que en Vercel es UTC. Todo lo que se formatea en el
 * servidor (Server Components, Route Handlers) salía corrido +3 h — y como el
 * mismo instante alimenta día y hora, un turno nocturno se mostraba directamente
 * en el día equivocado. Solo se veía en producción: en dev, con la máquina en
 * UTC-3, el bug es invisible.
 *
 * Los timestamptz de la base llegan como ISO CON offset, así que el instante que
 * se parsea siempre es el correcto; lo que hay que fijar es la zona de salida.
 *
 * @param fecha  - Instante a formatear: string ISO (timestamptz) o `Date`.
 * @param patron - Patrón de date-fns (p. ej. "HH:mm", "d MMM", "dd/MM/yyyy HH:mm").
 */
export function formatFechaAR(fecha: string | Date, patron: string): string {
  return formatInTimeZone(fecha, TZ_AR, patron, { locale: es })
}

/**
 * Wrapper de `formatFechaAR` con degradación a texto crudo.
 *
 * ⚠ El try/catch va ACÁ y no en `formatFechaAR`: el motor lanza `RangeError`
 * ante una entrada inválida y sus llamadores nunca tragaron ese error, así que
 * meterle un catch cambiaría su contrato. Los llamadores de este wrapper, en
 * cambio, vienen de helpers que SÍ degradaban, y uno de ellos vive en la ruta
 * PÚBLICA /verificar/[codigo]: como el proyecto no tiene tipos generados de
 * `Database`, el `data` de toda query llega como `any` y un null/vacío
 * inesperado no lo atrapa `tsc`. Sin este catch, ese dato degenerado sería un
 * 500 en una página pública en vez de un texto feo.
 *
 * Ojo con el orden del fallback: se devuelve el string tal cual llegó, que es
 * exactamente lo que hacían los helpers que este archivo reemplaza.
 *
 * @param fecha  - Instante a formatear: string ISO (timestamptz), "YYYY-MM-DD" o `Date`.
 * @param patron - Patrón de date-fns. Por defecto "d MMM yyyy" → "13 ago 2026".
 */
export function formatFecha(fecha: string | Date, patron = 'd MMM yyyy'): string {
  try {
    return formatFechaAR(fecha, patron)
  } catch {
    return typeof fecha === 'string' ? fecha : String(fecha)
  }
}

/**
 * Variante larga: "13 de agosto de 2026". Mismo comportamiento que `formatFecha`
 * (zona AR fija + degradación a texto crudo), con el patrón ya elegido.
 */
export function formatFechaLarga(fecha: string | Date): string {
  return formatFecha(fecha, "d 'de' MMMM 'de' yyyy")
}
