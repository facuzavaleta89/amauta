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
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
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

/**
 * ⚠⚠ AGREGADA EN LA TANDA DEL PRÓXIMO CONTROL (migración 041) — REVISAR ⚠⚠
 *
 * INVERSA de `formatFechaAR`: hasta acá este módulo solo sabía FORMATEAR (instante
 * → texto en zona AR) y no PARSEAR (texto de pared en zona AR → instante). El
 * formulario de la HC necesita justamente eso: el usuario elige "2026-08-20" en un
 * <input type="date"> y "14:00" en un <input type="time">, y esos dos strings son
 * hora de PARED argentina, sin offset. Para persistirlos en un `timestamptz` hay que
 * anclarlos a un instante absoluto.
 *
 * ⚠ NO hacer esto con `new Date('2026-08-20T14:00')`: un ISO date-time SIN offset lo
 * interpreta el motor en la zona del RUNTIME, que en Vercel es UTC — las 14:00 AR
 * quedarían guardadas como 14:00Z, o sea 11:00 AR. Es exactamente el bug de la nota
 * técnica 18, en el sentido de entrada en vez de salida.
 *
 * `fromZonedTime` (date-fns-tz) resuelve el offset REAL de la zona para esa fecha, así
 * que no hay ningún '-03:00' hardcodeado: si Argentina volviera a tener horario de
 * verano, esto sigue siendo correcto sin tocar código.
 *
 * Devuelve un `Date`; el llamador decide la serialización (`.toISOString()` para
 * mandarlo al servidor). **Ante una entrada inválida devuelve `Invalid Date`, NO
 * lanza** — como `new Date`, y a diferencia de `formatFechaAR`. El llamador debe
 * chequear con `isNaN(d.getTime())`.
 *
 * @param fechaHoraLocal - Fecha/hora de pared en AR: "YYYY-MM-DDTHH:mm" (también
 *                         acepta "YYYY-MM-DD", que resuelve a la medianoche AR).
 */
export function parseFechaHoraAR(fechaHoraLocal: string): Date {
  return fromZonedTime(fechaHoraLocal, TZ_AR)
}

/**
 * INVERSA de `parseFechaHoraAR`: instante → string de hora de PARED ARGENTINA en el
 * formato `"YYYY-MM-DDTHH:mm"` que exige un `<input type="datetime-local">`.
 *
 * Las dos forman el PAR que usa todo formulario con inputs de fecha/hora:
 *   base → `formatParaInputAR` → el usuario edita → `parseFechaHoraAR` → base
 * y las dos anclan en `TZ_AR`, así que el round-trip conserva el instante **sin importar
 * en qué zona esté el dispositivo**. ⚠ Convertir una sola de las dos ROMPE esa simetría:
 * el input mostraría una hora de pared y la escritura la interpretaría en otra zona, y un
 * turno abierto y guardado SIN EDITAR se movería solo. Si se toca una, se tocan las dos.
 *
 * Reemplazó a `reformatDateForInput` (`lib/utils/fecha-input.ts`, eliminado), que hacía lo
 * mismo con `getTimezoneOffset()` — o sea, en la zona del NAVEGADOR. Andaba bien en
 * Argentina y mentía en cualquier otra zona.
 *
 * ⚠ **La rama sin `"T"` NO convierte zona, y es a propósito.** Un valor `"YYYY-MM-DD"` es
 * un DÍA, no un instante: se le pega `T00:00` y listo. Pasarlo por el formateo sería un
 * bug — `new Date("2026-08-20")` es medianoche **UTC**, que en AR (−3) cae a las 21:00 del
 * **día anterior**, así que el input abriría en el día equivocado. Hoy esa rama no la
 * alcanza ningún llamador (`calendar-view.tsx` ya resuelve la selección de la vista mes a
 * `${dia}T09:00` antes de pasarla), pero se conserva como red.
 *
 * @param fecha - Instante: string ISO (timestamptz, con offset) o `Date`. También acepta
 *                `"YYYY-MM-DD"`, que devuelve tal cual con `T00:00`.
 */
export function formatParaInputAR(fecha: string | Date): string {
  if (typeof fecha === 'string' && !fecha.includes('T')) {
    return `${fecha}T00:00`
  }
  return formatFechaAR(fecha, "yyyy-MM-dd'T'HH:mm")
}

/**
 * El día de HOY en la zona del consultorio, como `"YYYY-MM-DD"`.
 *
 * Formato pensado para comparar contra columnas `DATE` de la base (que son strings
 * sin zona) y para sembrar el valor inicial de un `<input type="date">`.
 *
 * ⚠⚠ **NO usar `new Date().toISOString().slice(0, 10)` para esto.** Ése es el patrón
 * que este helper viene a reemplazar, y está mal en los dos lados:
 *  · **En el cliente** devuelve el día en **UTC**, así que entre las **21:00 y las
 *    00:00 ART** adelanta al día SIGUIENTE. Es un bug de tres horas por día: invisible
 *    en cualquier prueba diurna, y por eso sobrevivió tanto.
 *  · **En el servidor es peor: falla TODOS los días, todo el día.** El runtime de
 *    Vercel es UTC siempre, así que no hay franja segura — durante esas tres horas el
 *    día está corrido y el resto del tiempo acierta por coincidencia de que UTC y ART
 *    comparten el número de día.
 *
 * Es el mismo bug de la nota técnica 18 (formatear en la zona del runtime), aplicado
 * a derivar un DÍA en vez de a renderizar un instante.
 *
 * ⚠ **Sin try/catch, a diferencia de `formatFecha`.** Su entrada es `new Date()` —el
 * instante actual—, que **nunca** es inválido, así que no hay nada que degradar. **No
 * copiar este patrón** donde la fecha venga de afuera: ahí el motor `formatFechaAR`
 * **LANZA** ante una entrada inválida y hace falta el wrapper que degrada.
 */
export function hoyAR(): string {
  return formatFechaAR(new Date(), 'yyyy-MM-dd')
}
