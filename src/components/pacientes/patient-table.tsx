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
import { Eye, Pencil, FileText } from 'lucide-react'
import type { PacienteWithObraSocial } from '@/types/paciente'
import { differenceInYears } from 'date-fns'

interface PatientTableProps {
  pacientes: PacienteWithObraSocial[]
}

export function PatientTable({ pacientes }: PatientTableProps) {
  const router = useRouter()

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
    <div className="rounded-lg border border-border/60 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="font-semibold text-foreground">Paciente</TableHead>
            <TableHead className="font-semibold text-foreground">DNI</TableHead>
            <TableHead className="font-semibold text-foreground">Edad</TableHead>
            <TableHead className="font-semibold text-foreground hidden md:table-cell">Obra Social</TableHead>
            <TableHead className="font-semibold text-foreground hidden lg:table-cell">Contacto</TableHead>
            <TableHead className="font-semibold text-foreground text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pacientes.map((p) => {
            const edad = p.fecha_nacimiento
              ? differenceInYears(new Date(), new Date(p.fecha_nacimiento))
              : '—'
            const obraSocial = p.obras_sociales?.nombre ?? p.obra_social_otro ?? '—'

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
                      <p className="font-medium text-sm text-foreground leading-tight">
                        {p.nombre_completo}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">{p.sexo}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm font-mono text-foreground/80">{p.dni}</TableCell>
                <TableCell className="text-sm text-foreground/80">{edad} años</TableCell>
                <TableCell className="hidden md:table-cell">
                  <Badge variant="outline" className="text-xs font-normal">
                    {obraSocial}
                  </Badge>
                </TableCell>
                <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
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
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
