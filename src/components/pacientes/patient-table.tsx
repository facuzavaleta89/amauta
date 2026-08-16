'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Eye, Pencil, FileText, ChevronRight, Archive } from 'lucide-react'
import { usePermisos } from '@/contexts/permisos-context'
import type { PacienteWithObraSocial } from '@/types/paciente'
import { resolverObraSocial } from '@/lib/pacientes/obra-social'
import { differenceInYears } from 'date-fns'

interface PatientTableProps {
  pacientes: PacienteWithObraSocial[]
}

export function PatientTable({ pacientes }: PatientTableProps) {
  const router = useRouter()

  // Solo UX: si el asistente no tiene el permiso, el botón se ve deshabilitado en vez
  // de dejarlo clickear y rebotar contra /sin-acceso. La protección real vive en el
  // servidor (la página hace su propio chequeo) y no depende de esto.
  // ⚠ El hook va ANTES del early return de abajo (reglas de los hooks).
  const { tienePermiso } = usePermisos()
  const puedeVerHistoria = tienePermiso('ver_historia_clinica')
  const puedeEditar = tienePermiso('editar_pacientes')

  if (pacientes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground text-sm">No se encontraron pacientes</p>
        <p className="text-muted-foreground/60 text-xs mt-1">
          Probá cambiando los filtros o registrá un nuevo paciente
        </p>
      </div>
    )
  }

  return (
    <>
      {/* ── Vista móvil: cards ──────────────────────────────── */}
      <div className="md:hidden space-y-2">
        {pacientes.map((p) => {
          const edad = p.fecha_nacimiento
            ? differenceInYears(new Date(), new Date(p.fecha_nacimiento))
            : null
          const obraSocial = resolverObraSocial(p)

          return (
            <div
              key={p.id}
              onClick={() => router.push(`/pacientes/${p.id}`)}
              className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-card hover:bg-muted/30 active:bg-muted/50 cursor-pointer transition-colors"
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-primary">
                  {p.nombre_completo.charAt(0).toUpperCase()}
                </span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground leading-tight truncate flex items-center gap-1.5">
                  {p.nombre_completo}
                  {p.archivado_at && (
                    <Badge variant="secondary" className="gap-1 text-[10px] font-normal h-4 px-1.5 text-amber-700 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/10 shrink-0">
                      <Archive className="h-2.5 w-2.5" />
                      Archivado
                    </Badge>
                  )}
                </p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-muted-foreground font-mono">
                    DNI {p.dni}
                  </span>
                  {edad !== null && (
                    <span className="text-xs text-muted-foreground">
                      · {edad} años
                    </span>
                  )}
                  {obraSocial && (
                    <Badge variant="outline" className="text-[10px] font-normal h-4 px-1.5">
                      {obraSocial}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Acciones rápidas */}
              <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                {puedeVerHistoria ? (
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 text-muted-foreground hover:text-primary"
                  >
                    <Link href={`/pacientes/${p.id}/historia`} aria-label="Historia clínica">
                      <FileText className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : (
                  /* Sin permiso: mismo botón pero deshabilitado y SIN <Link> — un <a> no
                     se deshabilita con `disabled`, así que hay que sacar el link. */
                  <Button
                    disabled
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 text-muted-foreground"
                    aria-label="Historia clínica (requiere permiso)"
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 text-muted-foreground hover:text-primary"
                >
                  <Link href={`/pacientes/${p.id}`} aria-label="Ver paciente">
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Vista desktop: tabla ────────────────────────────── */}
      <div className="hidden md:block rounded-lg border border-border/60 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="font-semibold text-foreground">Paciente</TableHead>
              <TableHead className="font-semibold text-foreground">DNI</TableHead>
              <TableHead className="font-semibold text-foreground">Edad</TableHead>
              <TableHead className="font-semibold text-foreground hidden lg:table-cell">Obra Social</TableHead>
              <TableHead className="font-semibold text-foreground hidden xl:table-cell">Contacto</TableHead>
              <TableHead className="font-semibold text-foreground text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pacientes.map((p) => {
              const edad = p.fecha_nacimiento
                ? differenceInYears(new Date(), new Date(p.fecha_nacimiento))
                : '—'
              const obraSocial = resolverObraSocial(p) ?? '—'

              return (
                <TableRow
                  key={p.id}
                  onClick={() => router.push(`/pacientes/${p.id}`)}
                  className="hover:bg-muted/30 cursor-pointer transition-colors"
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-primary">
                          {p.nombre_completo.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-sm text-foreground leading-tight flex items-center gap-1.5">
                          {p.nombre_completo}
                          {p.archivado_at && (
                            <Badge variant="secondary" className="gap-1 text-[10px] font-normal h-4 px-1.5 text-amber-700 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/10">
                              <Archive className="h-2.5 w-2.5" />
                              Archivado
                            </Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">{p.sexo}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm font-mono text-foreground/80">{p.dni}</TableCell>
                  <TableCell className="text-sm text-foreground/80">{edad} años</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Badge variant="outline" className="text-xs font-normal">
                      {obraSocial}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">
                    {p.telefono ?? p.email ?? '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-primary relative z-10"
                      >
                        <Link
                          href={`/pacientes/${p.id}`}
                          aria-label="Ver paciente"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                      {puedeEditar ? (
                        <Button
                          asChild
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-primary relative z-10"
                        >
                          <Link
                            href={`/pacientes/${p.id}?edit=true`}
                            aria-label="Editar paciente"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                      ) : (
                        <Button
                          disabled
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground relative z-10"
                          aria-label="Editar paciente (requiere permiso)"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {puedeVerHistoria ? (
                        <Button
                          asChild
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-primary relative z-10"
                        >
                          <Link
                            href={`/pacientes/${p.id}/historia`}
                            aria-label="Historia clínica"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <FileText className="h-4 w-4" />
                          </Link>
                        </Button>
                      ) : (
                        /* Sin permiso: deshabilitado y sin <Link> (ver nota en la vista mosaico). */
                        <Button
                          disabled
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground relative z-10"
                          aria-label="Historia clínica (requiere permiso)"
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
