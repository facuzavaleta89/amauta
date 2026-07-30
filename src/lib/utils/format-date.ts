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
