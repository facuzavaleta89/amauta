import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ⚠ `formatFecha` / `formatFechaLarga` YA NO VIVEN ACÁ. Se unificaron contra el
// canon `formatFechaAR` y viven en `@/lib/utils/format-date`, el único módulo de
// fechas del proyecto. Los de este archivo no fijaban zona horaria (renderizaban
// en la del runtime, UTC en Vercel). No reintroducirlos.

/**
 * Escapa los caracteres especiales de HTML para interpolar texto plano (ej. lo que
 * escribe el médico) dentro de una plantilla HTML sin romper el markup ni permitir
 * inyección. Neutro (sin deps de servidor): usable en cliente y servidor.
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
