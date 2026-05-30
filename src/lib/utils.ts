import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formatea una fecha "YYYY-MM-DD" al español.
 * @param dateStr - Fecha en formato ISO o "YYYY-MM-DD"
 * @param fmt - Formato date-fns. Por defecto "d MMM yyyy"
 */
export function formatFecha(dateStr: string, fmt = "d MMM yyyy"): string {
  try {
    // Añadimos T12:00:00 para evitar desfase de zona horaria al parsear fechas sin hora
    const d = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T12:00:00')
    return format(d, fmt, { locale: es })
  } catch {
    return dateStr
  }
}

/**
 * Variante larga: "14 de mayo de 2025"
 */
export function formatFechaLarga(dateStr: string): string {
  return formatFecha(dateStr, "d 'de' MMMM 'de' yyyy")
}

/**
 * Sanitiza un string para usarlo de forma segura como nombre de archivo
 * en el header Content-Disposition de respuestas HTTP, previniendo
 * HTTP Header Injection (Fix A2).
 */
export function sanitizePdfFilename(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // quitar acentos
    .replace(/[^\w\s\-\.]/g, '_')      // solo caracteres seguros
    .replace(/\s+/g, '_')              // espacios a guiones bajos
    .replace(/_{2,}/g, '_')            // colapsar guiones múltiples
    .slice(0, 100)
}
