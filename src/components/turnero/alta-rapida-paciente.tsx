'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Loader2, UserPlus, ArrowLeft, Archive } from 'lucide-react'

import {
  pacienteAltaRapidaSchema,
  type PacienteAltaRapidaValues,
} from '@/lib/validations/paciente.schema'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/** Lo mínimo que el turnero necesita del paciente para seleccionarlo en el formulario. */
interface PacienteCreado {
  id: string
  nombre_completo: string
}

/** Fila del dropdown de candidatos que se muestra cuando el DNI ya existe. */
interface PacienteExistente extends PacienteCreado {
  dni: string | null
}

interface AltaRapidaPacienteProps {
  /** Lo que el usuario ya tecleó en el buscador del turno; siembra el nombre. */
  nombreInicial: string
  /** El paciente quedó disponible (recién creado, o encontrado por DNI). */
  onCreado: (p: PacienteCreado) => void
  /** Volver al formulario del turno sin crear nada. */
  onCancelar: () => void
}

/**
 * Alta rápida de paciente **dentro del modal del turno**.
 *
 * ⚠ **NO es un Dialog.** Es el CONTENIDO que `turno-form.tsx` muestra dentro de su propio
 * `DialogContent` cuando la vista está en modo alta. Anidar un segundo `Dialog` habría
 * traído dos overlays, dos trampas de foco y dos handlers de `Escape` — y habría sido el
 * primer `Dialog` anidado del proyecto. Con el intercambio de vista hay **un solo Dialog**.
 *
 * ⚠ **No reusa `PatientForm`**: aquél está acoplado a su página (hace `router.push` al
 * guardar y `router.back()` al cancelar) y arrastra el catálogo de obras sociales, que acá
 * no se usa. Son 5 campos: replicarlos sale más barato que generalizarlo, y la validación
 * —que es lo que de verdad no hay que duplicar— sí se comparte vía `pacienteAltaRapidaSchema`.
 */
export function AltaRapidaPaciente({
  nombreInicial,
  onCreado,
  onCancelar,
}: AltaRapidaPacienteProps) {
  const [isLoading, setIsLoading] = useState(false)

  // Resultado del camino "el DNI ya existe" (400 del POST). Los dos son excluyentes:
  //  · `existentes` con filas → el paciente está activo y se puede seleccionar.
  //  · `archivado` en true    → el DNI existe pero la búsqueda no lo ve: está archivado.
  const [existentes, setExistentes] = useState<PacienteExistente[] | null>(null)
  const [archivado, setArchivado] = useState(false)

  const form = useForm<PacienteAltaRapidaValues>({
    resolver: zodResolver(pacienteAltaRapidaSchema),
    defaultValues: {
      nombre_completo: nombreInicial,
      dni: '',
      fecha_nacimiento: '',
      telefono: '',
      // ⚠ `sexo` arranca SIN valor, a propósito. `patient-form.tsx` siembra 'femenino' por
      // default; acá no se copia esa decisión: es un dato clínico y no queremos que quede
      // guardado por inferencia si el usuario no lo elige. El schema lo exige, así que el
      // submit no pasa hasta que se seleccione.
    },
  })

  /** Limpia el resultado del choque de DNI: cualquier edición vuelve a habilitar el alta. */
  function limpiarChoque() {
    if (existentes || archivado) {
      setExistentes(null)
      setArchivado(false)
    }
  }

  /**
   * El POST devolvió 400 por DNI duplicado. **No es un callejón sin salida**: se busca ese
   * DNI para ofrecer el paciente que ya existe.
   *
   * ⚠ La búsqueda puede volver VACÍA aunque el paciente exista: `GET /api/pacientes` filtra
   * `.is('archivado_at', null)` y el UNIQUE `(creado_por, dni)` **no es parcial**, así que un
   * paciente ARCHIVADO sigue ocupando su DNI pero no aparece en el buscador. Esa rama es la
   * que se explica al usuario.
   */
  async function resolverDniDuplicado(dni: string) {
    try {
      const res = await fetch(`/api/pacientes?q=${encodeURIComponent(dni)}`)
      if (!res.ok) {
        // No se pudo averiguar de cuál de los dos casos se trata: se informa el choque
        // a secas, sin inventar una explicación.
        toast.error('Ya existe un paciente con ese DNI', {
          description: 'No se pudo recuperar el paciente existente. Probá buscarlo por nombre.',
        })
        return
      }
      const json = await res.json()
      const encontrados: PacienteExistente[] = json.data ?? []

      if (encontrados.length > 0) {
        // ⚠ El `ilike` del endpoint es por CONTENCIÓN (`%dni%`), así que puede devolver más
        // de una fila (p. ej. buscar '1234567' trae también al DNI '12345678'). Se renderizan
        // todas y elige el usuario: acá no se adivina cuál es.
        setExistentes(encontrados)
        setArchivado(false)
      } else {
        setExistentes(null)
        setArchivado(true)
      }
    } catch {
      toast.error('Ya existe un paciente con ese DNI', {
        description: 'No se pudo recuperar el paciente existente. Probá buscarlo por nombre.',
      })
    }
  }

  async function onSubmit(data: PacienteAltaRapidaValues) {
    setIsLoading(true)
    limpiarChoque()
    try {
      const res = await fetch('/api/pacientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      // ⚠ El endpoint responde 201, no 200: la condición es `res.ok`.
      if (res.ok) {
        const json = await res.json()
        const nuevo = json.data
        toast.success('Paciente registrado')
        onCreado({ id: nuevo.id, nombre_completo: nuevo.nombre_completo })
        return
      }

      const errorData = await res.json().catch(() => null)
      const mensaje: string = errorData?.error || 'No se pudo registrar el paciente'

      // 400 por DNI duplicado — el único 400 que el endpoint devuelve con este texto.
      if (res.status === 400 && mensaje.includes('DNI')) {
        await resolverDniDuplicado(data.dni)
        return
      }

      // 403 (sin `editar_pacientes`) y cualquier otro: se muestra lo que dice el servidor.
      toast.error('No se pudo registrar el paciente', { description: mensaje })
    } catch (e) {
      const description = e instanceof Error ? e.message : 'Error inesperado'
      toast.error('No se pudo registrar el paciente', { description })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <p className="text-xs text-muted-foreground -mt-1">
          Se registra al paciente con los datos mínimos. Después vas a poder completar el
          resto de la ficha desde <span className="font-medium">Pacientes</span>.
        </p>

        {/* ── Nombre ─────────────────────────────────────────── */}
        <FormField
          control={form.control}
          name="nombre_completo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Nombre completo <span className="text-destructive-strong">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="Nombre y apellido"
                  {...field}
                  value={field.value || ''}
                  onChange={(e) => { field.onChange(e); limpiarChoque() }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ── DNI ────────────────────────────────────────────── */}
        <FormField
          control={form.control}
          name="dni"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                DNI <span className="text-destructive-strong">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  inputMode="numeric"
                  placeholder="Sin puntos ni espacios"
                  {...field}
                  value={field.value || ''}
                  onChange={(e) => { field.onChange(e); limpiarChoque() }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ── Fecha de nacimiento + Sexo ─────────────────────── */}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="fecha_nacimiento"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Fecha de nacimiento <span className="text-destructive-strong">*</span>
                </FormLabel>
                <FormControl>
                  <Input type="date" {...field} value={field.value || ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="sexo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Sexo <span className="text-destructive-strong">*</span>
                </FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ''}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="femenino">Femenino</SelectItem>
                    <SelectItem value="masculino">Masculino</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* ── Teléfono ───────────────────────────────────────── */}
        <FormField
          control={form.control}
          name="telefono"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Teléfono <span className="text-destructive-strong">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  inputMode="tel"
                  placeholder="+54 11 1234-5678"
                  {...field}
                  value={field.value || ''}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ── El DNI ya existe: el paciente está ACTIVO ──────── */}
        {existentes && existentes.length > 0 && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
            <p className="text-sm font-medium text-foreground">
              Ese DNI ya está registrado
            </p>
            <p className="text-xs text-muted-foreground">
              {existentes.length === 1
                ? 'El paciente ya existe. Podés seleccionarlo directamente:'
                : 'Hay más de un paciente con un DNI parecido. Elegí cuál:'}
            </p>
            <ul className="space-y-1">
              {existentes.map((p) => (
                <li key={p.id}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-between gap-2 h-auto py-2"
                    onClick={() => onCreado({ id: p.id, nombre_completo: p.nombre_completo })}
                  >
                    <span className="font-medium truncate">{p.nombre_completo}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      DNI: {p.dni}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── El DNI ya existe, pero el paciente está ARCHIVADO ── */}
        {/* El POST choca contra el UNIQUE (que no distingue archivados) y el buscador no lo
            devuelve. Sin esta explicación el usuario queda trabado: la app le dice que el
            paciente existe y a la vez no se lo muestra. */}
        {archivado && (
          <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-1.5">
            <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <Archive className="h-3.5 w-3.5" />
              Ese DNI pertenece a un paciente archivado
            </p>
            <p className="text-xs text-muted-foreground">
              Por eso no aparece en el buscador. Para volver a usarlo hay que{' '}
              <span className="font-medium">desarchivarlo</span> desde{' '}
              <span className="font-medium">Pacientes</span>, activando el filtro de
              archivados.
            </p>
            {/* ⚠ Desarchivar es EXCLUSIVO del médico (regla de negocio 9): no se ofrece la
                acción desde acá, solo se indica dónde está. */}
            <p className="text-xs text-muted-foreground">
              Solo el médico titular puede desarchivar un paciente.
            </p>
          </div>
        )}

        {/* ── Acciones ───────────────────────────────────────── */}
        <div className="pt-4 border-t flex justify-between items-center gap-2">
          <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={onCancelar}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Cancelar
          </Button>
          <Button type="submit" disabled={isLoading} className="min-w-40 gap-1.5">
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <UserPlus className="h-4 w-4" />
                Crear y seleccionar
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  )
}
