import type { createClient } from '@/lib/supabase/server'
import type { TurnoEstado } from '@/types'

/**
 * Cliente de sesión de Supabase (RSC / Server Actions / Route Handlers).
 *
 * ⚠ Se tipa con `Awaited<ReturnType<typeof createClient>>` y NO con el `SupabaseClient`
 * de `@supabase/supabase-js`: el factory lo construye con `@supabase/ssr`, y anotarlo con
 * el tipo de otro paquete lo ataría a una dependencia que no es la que lo produce.
 */
type SupabaseSesion = Awaited<ReturnType<typeof createClient>>

// ── Criterio único de "franja ocupada" ────────────────────────────────────────

/**
 * Clasificación EXHAUSTIVA de los 7 valores de `TurnoEstado`: qué estados ocupan la
 * franja horaria y cuáles la dejan libre.
 *
 * ⚠ **Es un `Record<TurnoEstado, boolean>` a propósito, no un array suelto.** Si algún
 * día se suma un valor al ENUM `turno_estado` y a `TurnoEstado`, este objeto **deja de
 * compilar** hasta que alguien decida explícitamente si ocupa o no. Es lo que evita que
 * un estado nuevo herede un default silencioso.
 *
 * El criterio (decisión de producto, 2026-08-10):
 *  - **Ocupan:** `pendiente`, `confirmado`, `presente`, `pendiente_confirmar`.
 *  - **No ocupan:** `cancelado` (se dio de baja), `ausente` (no-show: el horario ya pasó
 *    y quedó libre) y `reprogramado` (el turno vivo es el otro).
 */
const OCUPA_LA_FRANJA: Record<TurnoEstado, boolean> = {
  pendiente:           true,
  confirmado:          true,
  presente:            true,
  pendiente_confirmar: true,
  cancelado:           false,
  ausente:             false,
  reprogramado:        false,
}

/**
 * Lista de **INCLUSIÓN** de los estados que ocupan la franja, derivada del objeto de
 * arriba (fuente única).
 *
 * ⚠ **Inclusión y no exclusión, deliberadamente.** Hasta esta tanda los endpoints usaban
 * `.not('estado','in','(…)')`, o sea que **cualquier estado nuevo ocupaba por default**.
 * Con `.in(...)` el default se invierte: lo que no está clasificado como ocupante, no
 * bloquea la agenda.
 */
const ESTADOS_QUE_OCUPAN: TurnoEstado[] = (Object.keys(OCUPA_LA_FRANJA) as TurnoEstado[])
  .filter((estado) => OCUPA_LA_FRANJA[estado])

/**
 * Duración del turno que se agenda automáticamente al finalizar una consulta con
 * próximo control (`consultas.proximo_turno_sugerido`).
 *
 * ⚠ **No unificar con `MIN_DURATION_MS` de `lib/validations/turno.schema.ts`.** Aquél es
 * la duración **mínima válida** de cualquier turno (validación de formulario); éste es la
 * duración **fija** del turno de control. Hoy coinciden en 10 minutos por casualidad: si
 * el turno de control pasara a durar 20, la duración mínima no debería moverse con él.
 */
export const DURACION_TURNO_CONTROL_MS = 10 * 60 * 1000

// ── API del helper ────────────────────────────────────────────────────────────

export interface BuscarSolapamientosArgs {
  /** Cliente de **sesión** (no admin): el chequeo pasa por RLS. Ver la nota de abajo. */
  supabase: SupabaseSesion
  /** Tenant YA resuelto por el llamador. El helper no resuelve tenant ni lee `profiles`. */
  medicoId: string
  /** Inicio del rango candidato: string ISO (timestamptz), tal como circula por los endpoints. */
  inicio: string
  /** Fin del rango candidato: string ISO (timestamptz). */
  fin: string
  /** PATCH de turnos: excluye la propia fila del chequeo (`.neq('id', …)`). */
  excluirTurnoId?: string
  /** PATCH de bloqueos: excluye la propia fila del chequeo (`.neq('id', …)`). */
  excluirBloqueoId?: string
}

export interface Solapamientos {
  /** Hay al menos un turno que ocupa la franja (según `ESTADOS_QUE_OCUPAN`). */
  hayTurnoSolapado: boolean
  /** Hay al menos un bloqueo de agenda en la franja. */
  hayBloqueoSolapado: boolean
}

/**
 * Responde si el rango `[inicio, fin)` está ocupado en la agenda del médico, mirando
 * **las dos** tablas en paralelo: `turnos` y `bloqueos_agenda`.
 *
 * Es la **única** implementación del criterio de "franja ocupada" del proyecto. Antes
 * vivía duplicada e inconsistente en 12 queries repartidas por 6 endpoints, con tres
 * criterios distintos de `estado` y tres de `categoria` conviviendo.
 *
 * **Predicado de intersección** (el mismo que ya usaban las 12 queries, sin cambios):
 * `fila.fecha_inicio < fin AND fila.fecha_fin > inicio`. Son intervalos **semiabiertos**:
 * los bordes que se tocan NO solapan — un turno que termina 10:00 y otro que empieza
 * 10:00 conviven sin conflicto.
 *
 * **Categorías: nada se pisa con nada.** El chequeo turno-vs-turno **no filtra por
 * `categoria`**. La agenda modela la disponibilidad física del médico, así que un `curso`,
 * un turno `personal` o uno `administrativo` ocupan la franja igual que un `turno_medico`.
 * (Los bloqueos ya funcionaban así y siguen igual: pisan turnos de cualquier categoría.)
 *
 * **Errores: el helper falla, nunca miente.** Cada query chequea su `error` y lo relanza.
 * Antes, 8 de las 12 queries descartaban el error, así que un fallo de base o de red
 * dejaba `data` en `undefined` y el endpoint concluía **"franja libre"** — un fail-open
 * silencioso. Los llamadores tienen `try/catch` y responden 500, que es lo correcto: ante
 * un chequeo que no se pudo hacer, no se puede afirmar que el horario esté disponible.
 *
 * ⚠ **Corre con el cliente de SESIÓN, así que pasa por RLS — y eso no es un detalle de
 * implementación.** Es la razón por la que hizo falta la **migración 039**. Hasta ella,
 * `turnos_select` exigía **solo `ver_turnos`** mientras que `bloqueos_select` ya pedía
 * `ver_turnos OR gestionar_turnos` (037): al asistente con **`gestionar_turnos` y SIN
 * `ver_turnos`** —combinación configurable desde `/perfil`— la query de turnos le devolvía
 * `[]` aunque los turnos existieran, y el helper daba la franja por **libre**, dejándolo
 * crear un turno encima de otro. **Unificar el criterio acá NO cerraba eso** (solo
 * concentraba el bug en un lugar en vez de seis): se cerró en la base. Desde la 039 las dos
 * tablas de la agenda comparten el mismo `USING`, así que quien puede gestionar la agenda
 * también la lee y el chequeo ve todo lo que tiene que ver. ⚠ **La correctitud de este
 * helper depende de que `turnos_select` y `bloqueos_select` mantengan el mismo criterio de
 * lectura.** Ver `CLAUDE.md` → nota técnica 23 y Auth y roles.
 *
 * @throws el error de PostgREST si cualquiera de las dos queries falla.
 */
export async function buscarSolapamientos({
  supabase,
  medicoId,
  inicio,
  fin,
  excluirTurnoId,
  excluirBloqueoId,
}: BuscarSolapamientosArgs): Promise<Solapamientos> {
  const [hayTurnoSolapado, hayBloqueoSolapado] = await Promise.all([
    hayTurnosEnLaFranja(supabase, medicoId, inicio, fin, excluirTurnoId),
    hayBloqueosEnLaFranja(supabase, medicoId, inicio, fin, excluirBloqueoId),
  ])

  return { hayTurnoSolapado, hayBloqueoSolapado }
}

// ── Implementación por tabla ──────────────────────────────────────────────────

/**
 * ¿Hay algún turno que ocupe la franja? Filtra por tenant y por la lista de inclusión de
 * estados. **Sin filtro de `categoria`**, a propósito (ver el criterio en el JSDoc de
 * `buscarSolapamientos`).
 */
async function hayTurnosEnLaFranja(
  supabase: SupabaseSesion,
  medicoId: string,
  inicio: string,
  fin: string,
  excluirTurnoId?: string
): Promise<boolean> {
  let query = supabase
    .from('turnos')
    .select('id')
    .eq('medico_id', medicoId)
    .in('estado', [...ESTADOS_QUE_OCUPAN])
    .lt('fecha_inicio', fin)
    .gt('fecha_fin', inicio)

  if (excluirTurnoId) {
    query = query.neq('id', excluirTurnoId)
  }

  // Alcanza con saber si existe AL MENOS uno: los llamadores solo miran si hay conflicto.
  const { data, error } = await query
    .limit(1)
    .overrideTypes<{ id: string }[], { merge: false }>()

  if (error) throw error

  return (data?.length ?? 0) > 0
}

/**
 * ¿Hay algún bloqueo de agenda en la franja? `bloqueos_agenda` no tiene `estado` ni
 * `categoria`: un bloqueo **siempre** ocupa.
 */
async function hayBloqueosEnLaFranja(
  supabase: SupabaseSesion,
  medicoId: string,
  inicio: string,
  fin: string,
  excluirBloqueoId?: string
): Promise<boolean> {
  let query = supabase
    .from('bloqueos_agenda')
    .select('id')
    .eq('medico_id', medicoId)
    .lt('fecha_inicio', fin)
    .gt('fecha_fin', inicio)

  if (excluirBloqueoId) {
    query = query.neq('id', excluirBloqueoId)
  }

  const { data, error } = await query
    .limit(1)
    .overrideTypes<{ id: string }[], { merge: false }>()

  if (error) throw error

  return (data?.length ?? 0) > 0
}
