'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Search, X } from 'lucide-react'
import type { ObraSocial } from '@/types/paciente'

interface PatientFiltersProps {
  obrasSociales: ObraSocial[]
}

export function PatientFilters({ obrasSociales }: PatientFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const q = searchParams.get('q') ?? ''
  const obraSocialId = searchParams.get('obra_social_id') ?? ''
  const sexo = searchParams.get('sexo') ?? ''

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      params.delete('page') // reset pagination
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams]
  )

  const hasFilters = q || obraSocialId || sexo

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      {/* Búsqueda */}
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          id="patient-search"
          placeholder="Buscar por nombre o DNI..."
          defaultValue={q}
          onChange={(e) => updateParam('q', e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      {/* Obra Social */}
      <Select
        value={obraSocialId || 'all'}
        onValueChange={(v) => updateParam('obra_social_id', v === 'all' ? '' : v)}
      >
        <SelectTrigger id="filter-obra-social" className="w-full sm:w-48 h-9">
          <SelectValue placeholder="Obra social" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas las obras sociales</SelectItem>
          {obrasSociales.map((os) => (
            <SelectItem key={os.id} value={String(os.id)}>
              {os.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Sexo */}
      <Select
        value={sexo || 'all'}
        onValueChange={(v) => updateParam('sexo', v === 'all' ? '' : v)}
      >
        <SelectTrigger id="filter-sexo" className="w-full sm:w-36 h-9">
          <SelectValue placeholder="Sexo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="masculino">Masculino</SelectItem>
          <SelectItem value="femenino">Femenino</SelectItem>
          <SelectItem value="otro">Otro</SelectItem>
        </SelectContent>
      </Select>

      {/* Limpiar filtros */}
      {hasFilters && (
        <Button
          id="clear-filters"
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 text-muted-foreground"
          onClick={() => router.push(pathname)}
        >
          <X className="h-4 w-4" />
          Limpiar
        </Button>
      )}
    </div>
  )
}
