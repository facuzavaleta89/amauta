/**
 * Convierte una fecha de FullCalendar al formato que espera un
 * `<input type="datetime-local">` ("YYYY-MM-DDThh:mm"), respetando la
 * hora local del navegador.
 *
 * FullCalendar devuelve dos formatos distintos según la vista:
 *
 *  - Con hora y offset (vistas semana/día), p. ej. "2026-07-13T09:00:00-03:00":
 *    representa un instante concreto. Lo normalizamos a la hora de pared local.
 *
 *  - Solo fecha (vista mes), p. ej. "2026-07-13": es un día completo, sin hora.
 *    Acá NO se puede usar `new Date("2026-07-13")` porque JS lo interpreta como
 *    medianoche UTC y, al pasar a hora local de Argentina (−3), retrocede al día
 *    anterior a las 21:00. Se toma el día tal cual, en hora local.
 */
export function reformatDateForInput(value: string): string {
  // Solo fecha (sin "T"): día local, sin desfase de zona horaria.
  if (!value.includes('T')) {
    return `${value}T00:00`
  }

  // Con hora: normalizar el instante a hora de pared local.
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)
}
