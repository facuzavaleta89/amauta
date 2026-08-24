import type { LucideIcon } from 'lucide-react'
import { Stethoscope, GraduationCap, User, Clipboard, Bell } from 'lucide-react'
import type { TurnoCategoria } from '@/types/turno'

/**
 * Categorías de turno: etiqueta, ícono y color, en UN solo lugar.
 *
 * ⚠ El COLOR no vive acá: vive en `globals.css`, como las variables
 * `--categoria-*` de `:root`. Este módulo solo guarda **el nombre** de la clase
 * y de la variable, así que el calendario y el formulario pintan siempre con el
 * mismo valor y no hay forma de que se desincronicen.
 *
 * Antes esto estaba duplicado en dos lenguajes distintos: `calendar-view.tsx`
 * tenía su `CATEGORIA_STYLES` (clase + label + ícono) y `turno-form.tsx` su
 * `CATEGORIA_CONFIG` (label + ícono otra vez), mientras el color estaba escrito
 * literal entre 4 y 6 veces por categoría dentro de las reglas `.categoria-*`.
 * Agregar una categoría obligaba a tocar tres archivos y acordarse de los tres.
 *
 * Para sumar una categoría: la variable en `globals.css` (`--categoria-x` y
 * `--categoria-x-texto`), sus reglas `.categoria-x`, y la entrada de acá.
 */
export interface CategoriaStyle {
  label: string
  icon: LucideIcon
  /** Clase que aplica el calendario al evento (barra de acento, tinte y texto). */
  claseCalendario: string
  /** Variable CSS con el color de acento. La lee el selector del formulario. */
  varColor: string
}

export const CATEGORIA_STYLES: Record<TurnoCategoria, CategoriaStyle> = {
  turno_medico: {
    label: 'Turno médico',
    icon: Stethoscope,
    claseCalendario: 'categoria-turno-medico',
    varColor: '--categoria-turno-medico',
  },
  curso: {
    label: 'Curso',
    icon: GraduationCap,
    claseCalendario: 'categoria-curso',
    varColor: '--categoria-curso',
  },
  personal: {
    label: 'Personal',
    icon: User,
    claseCalendario: 'categoria-personal',
    varColor: '--categoria-personal',
  },
  administrativo: {
    label: 'Administrativo',
    icon: Clipboard,
    claseCalendario: 'categoria-administrativo',
    varColor: '--categoria-administrativo',
  },
  recordatorio: {
    label: 'Recordatorio',
    icon: Bell,
    claseCalendario: 'categoria-recordatorio',
    varColor: '--categoria-recordatorio',
  },
}

/** Orden de aparición en filtros y selectores. */
export const CATEGORIAS: TurnoCategoria[] = Object.keys(CATEGORIA_STYLES) as TurnoCategoria[]

/**
 * Estilo de una categoría, con fallback a `turno_medico` para los valores que
 * puedan venir nulos o desconocidos de la base.
 */
export function categoriaStyle(categoria: string | null | undefined): CategoriaStyle {
  return CATEGORIA_STYLES[categoria as TurnoCategoria] ?? CATEGORIA_STYLES.turno_medico
}
