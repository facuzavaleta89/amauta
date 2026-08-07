'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import {
  User, Shield, FileSignature, Users, Loader2, Trash2, Upload, FileImage, Plus, Building2,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { SignaturePad } from './signature-pad'
import {
  actualizarPerfil, guardarFirma, guardarLogo,
  actualizarPermisosAsistente, desvincularAsistente,
} from '@/app/(app)/perfil/actions'
import type { Asistente, Matricula, MatriculaTipo, PermisosAsistente, PermisoKey } from '@/types/roles'
import { TITULOS_DISPONIBLES, PERMISO_LABELS, PERMISOS_GRUPOS } from '@/types/roles'

// ── Tipos ────────────────────────────────────────────────────
interface PerfilFormProps {
  profile: {
    id: string; full_name: string; role: 'medico' | 'asistente'
    matriculas: Matricula[]; titulo: string | null
    firma_url: string | null; logo_url: string | null
    medico_id: string | null
    permisos: PermisosAsistente
  }
  userEmail: string
  medicoVinculado?: { full_name: string; email: string } | null
  asistentesIniciales: Asistente[]
}

// ── Componente selector de título ───────────────────────────
function TituloSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isCustom = value !== '' && !(TITULOS_DISPONIBLES as readonly string[]).includes(value)
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onChange('')}
          className={cn('px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
            value === '' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50')}>
          Sin título
        </button>
        {TITULOS_DISPONIBLES.map((t) => (
          <button key={t} type="button" onClick={() => onChange(t)}
            className={cn('px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
              value === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50')}>
            {t}
          </button>
        ))}
        <button type="button" onClick={() => { if (!isCustom) onChange('') }}
          className={cn('px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
            isCustom ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50')}>
          Otro
        </button>
      </div>
      {isCustom && (
        <div className="pt-1">
          <Input value={value} onChange={(e) => onChange(e.target.value)}
            placeholder="Ej: Prof., Psic., Bioq." className="max-w-xs text-sm" maxLength={30} />
        </div>
      )}
    </div>
  )
}

// ── Editor de matrículas ─────────────────────────────────────
function MatriculasEditor({ matriculas, onChange }: { matriculas: Matricula[]; onChange: (v: Matricula[]) => void }) {
  const tipos: MatriculaTipo[] = ['MP', 'MN', 'ME']
  const tipoLabel: Record<MatriculaTipo, string> = { MP: 'Provincial', MN: 'Nacional', ME: 'Especialidad' }

  const inUseTypes = matriculas.map((m) => m.tipo)
  const availableTypes = tipos.filter((t) => !inUseTypes.includes(t))

  const add = () => {
    if (availableTypes.length === 0) return
    onChange([...matriculas, { tipo: availableTypes[0], numero: '' }])
  }
  const remove = (i: number) => onChange(matriculas.filter((_, idx) => idx !== i))
  const update = (i: number, field: keyof Matricula, val: string) => {
    const next = matriculas.map((m, idx) => idx === i ? { ...m, [field]: val } : m)
    onChange(next)
  }

  return (
    <div className="space-y-4">
      {matriculas.map((m, i) => {
        return (
          <div key={i} className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 bg-muted/20 sm:bg-transparent p-2 sm:p-0 rounded-lg">
            {/* Selector tipo */}
            <div className="flex rounded-lg border border-border overflow-hidden shrink-0 w-full sm:w-auto">
              {tipos.map((t) => {
                const isSelected = m.tipo === t
                const isDisabled = !isSelected && inUseTypes.includes(t)
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => update(i, 'tipo', t)}
                    title={isDisabled ? `${tipoLabel[t]} (ya agregada)` : tipoLabel[t]}
                    className={cn(
                      'flex-1 sm:flex-initial px-3 py-2 sm:py-1.5 text-xs font-bold transition-colors text-center',
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted',
                      isDisabled && 'opacity-35 cursor-not-allowed hover:bg-transparent'
                    )}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-2 w-full sm:flex-1">
              <Input value={m.numero} onChange={(e) => update(i, 'numero', e.target.value)}
                placeholder="Número de matrícula" maxLength={15} className="flex-1 text-sm font-mono" />
              <button type="button" onClick={() => remove(i)}
                className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        )
      })}
      {availableTypes.length > 0 && (
        <button type="button" onClick={add}
          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors font-medium pt-1">
          <Plus className="h-3.5 w-3.5" />
          Agregar matrícula {matriculas.length > 0 ? 'adicional' : ''}
        </button>
      )}
      {matriculas.length === 0 && (
        <p className="text-xs text-muted-foreground">Aún no hay matrículas cargadas.</p>
      )}
    </div>
  )
}

// ── Subidor de imagen (firma o logo) ─────────────────────────
function ImageUploader({
  label, hint, current, onSave, onDelete, isPending, accept = 'image/png, image/jpeg',
}: {
  label: string; hint: string; current: string | null
  onSave: (b64: string) => void; onDelete: () => void
  isPending: boolean; accept?: string
}) {
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error('El archivo debe ser una imagen')
    const reader = new FileReader()
    reader.onload = () => { if (typeof reader.result === 'string') onSave(reader.result) }
    reader.readAsDataURL(file)
  }
  return (
    <div className="grid md:grid-cols-2 gap-6 items-start">
      {/* Preview */}
      <div className="space-y-3">
        <Label>{label} actual</Label>
        <div className="flex items-center justify-center border border-border/80 rounded-xl bg-muted/10 h-48 relative overflow-hidden">
          {current ? (
            <div className="flex flex-col items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- src es un data-URI base64 del archivo subido (readAsDataURL); next/image no optimiza data-URIs */}
              <img src={current} alt={label} className="h-28 w-auto object-contain select-none" />
              <span className="text-[10px] text-muted-foreground mt-2 font-mono">Almacenado como base64</span>
            </div>
          ) : (
            <div className="text-center p-4 text-muted-foreground/60">
              <FileImage className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm font-medium">Sin {label.toLowerCase()} registrada</p>
              <p className="text-xs">{hint}</p>
            </div>
          )}
        </div>
        {current && (
          <Button type="button" variant="ghost" size="sm" onClick={onDelete} disabled={isPending}
            className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full gap-1.5">
            <Trash2 className="h-4 w-4" />Eliminar
          </Button>
        )}
      </div>
      {/* Upload */}
      <div className="space-y-2">
        <Label>Subir imagen</Label>
        <div className="relative flex items-center justify-center border-2 border-dashed border-border rounded-lg p-4 bg-muted/20 hover:bg-muted/30 transition-colors cursor-pointer group">
          <input type="file" accept={accept} onChange={handleFile} disabled={isPending}
            className="absolute inset-0 opacity-0 cursor-pointer" />
          <div className="text-center pointer-events-none text-muted-foreground group-hover:text-foreground transition-colors">
            <Upload className="h-6 w-6 mx-auto mb-1.5 text-muted-foreground/80" />
            <p className="text-xs font-semibold">Cargar imagen (PNG o JPG)</p>
            <p className="text-[10px] text-muted-foreground/80">Recomendado: fondo transparente</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tarjeta de Asistente con Permisos Expandibles ──────────────
function AsistenteCard({
  asistente,
  onDesvincular,
  isPendingGlobal,
}: {
  asistente: Asistente
  onDesvincular: (id: string) => void
  isPendingGlobal: boolean
}) {
  const [permisos, setPermisos] = useState<PermisosAsistente>(asistente.permisos)
  const [isSaving, startSaving] = useTransition()
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()

  const handleToggle = (key: PermisoKey, value: boolean) => {
    setPermisos((prev) => {
      const next = { ...prev, [key]: value }
      // Dependencia lógica: si ver_historia_clinica = false, se apagan crear_consultas y finalizar_consultas
      if (key === 'ver_historia_clinica' && !value) {
        next.crear_consultas = false
        next.finalizar_consultas = false
      }
      return next
    })
  }

  const hasChanges = JSON.stringify(permisos) !== JSON.stringify(asistente.permisos)

  const handleSave = async () => {
    startSaving(async () => {
      const res = await actualizarPermisosAsistente(asistente.id, permisos)
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success('Permisos actualizados')
        asistente.permisos = permisos
        router.refresh()
      }
    })
  }

  const initials = asistente.full_name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <Card className="border border-border/60 bg-card overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary/10 text-primary font-bold">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold text-sm text-foreground leading-tight">{asistente.full_name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{asistente.email}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsOpen(!isOpen)}
            className="text-xs"
          >
            {isOpen ? 'Ocultar permisos' : 'Ver y editar permisos'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onDesvincular(asistente.id)}
            disabled={isPendingGlobal || isSaving}
            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 text-xs px-2"
          >
            <Trash2 className="h-3.5 w-3.5" />Desvincular
          </Button>
        </div>
      </div>

      {isOpen && (
        <div className="border-t border-border bg-muted/10 p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PERMISOS_GRUPOS.map((grupo) => (
              <div key={grupo.titulo} className="space-y-3 p-3 rounded-lg bg-background border border-border/50">
                <p className="text-xs font-bold text-foreground/80 tracking-wide border-b border-border/60 pb-1">
                  {grupo.titulo}
                </p>
                <div className="space-y-2.5">
                  {grupo.permisos.map((perm) => {
                    const isDependentDisabled =
                      (perm === 'crear_consultas' || perm === 'finalizar_consultas') &&
                      !permisos.ver_historia_clinica

                    const isChecked = permisos[perm]

                    return (
                      <div key={perm} className="flex items-center justify-between text-xs py-0.5">
                        <div className="space-y-0.5 pr-2">
                          <p className="font-medium text-foreground">{PERMISO_LABELS[perm]}</p>
                        </div>
                        <Switch
                          checked={isChecked}
                          disabled={isSaving || isDependentDisabled}
                          onCheckedChange={(v) => handleToggle(perm, v)}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 border-t border-border/60 pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!hasChanges || isSaving}
              onClick={() => setPermisos(asistente.permisos)}
              className="text-xs"
            >
              Deshacer
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!hasChanges || isSaving}
              onClick={handleSave}
              className="text-xs gap-1.5"
            >
              {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Guardar permisos
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

// ── Componente principal ─────────────────────────────────────
export function PerfilForm({ profile, userEmail, medicoVinculado, asistentesIniciales }: PerfilFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [fullName, setFullName] = useState(profile.full_name)
  const [matriculas, setMatriculas] = useState<Matricula[]>(profile.matriculas)
  const [titulo, setTitulo] = useState(profile.titulo ?? '')
  const [firma, setFirma] = useState<string | null>(profile.firma_url)
  const [logo, setLogo] = useState<string | null>(profile.logo_url)
  const [asistentes, setAsistentes] = useState<Asistente[]>(asistentesIniciales)

  const isMedico = profile.role === 'medico'

  // Guardar datos básicos
  const handleSaveDatos = async (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      const res = await actualizarPerfil(fullName, isMedico ? matriculas : undefined, isMedico ? (titulo || null) : null)
      if (res.error) toast.error(res.error)
      else { toast.success('Perfil actualizado correctamente'); router.refresh() }
    })
  }

  // Firma
  const handleSaveFirma = async (b64: string) => {
    startTransition(async () => {
      const res = await guardarFirma(b64)
      if (res.error) toast.error(res.error)
      else { setFirma(b64); toast.success('Firma actualizada'); router.refresh() }
    })
  }
  const handleDeleteFirma = async () => {
    startTransition(async () => {
      const res = await guardarFirma(null)
      if (res.error) toast.error(res.error)
      else { setFirma(null); toast.success('Firma eliminada'); router.refresh() }
    })
  }

  // Logo
  const handleSaveLogo = async (b64: string) => {
    startTransition(async () => {
      const res = await guardarLogo(b64)
      if (res.error) toast.error(res.error)
      else { setLogo(b64); toast.success('Logo institucional actualizado'); router.refresh() }
    })
  }
  const handleDeleteLogo = async () => {
    startTransition(async () => {
      const res = await guardarLogo(null)
      if (res.error) toast.error(res.error)
      else { setLogo(null); toast.success('Logo eliminado'); router.refresh() }
    })
  }

  const handleDesvincular = async (id: string) => {
    startTransition(async () => {
      const res = await desvincularAsistente(id)
      if (res.error) toast.error(res.error)
      else { setAsistentes((prev) => prev.filter((a) => a.id !== id)); toast.success('Asistente desvinculado'); router.refresh() }
    })
  }

  const displayName = titulo ? `${titulo} ${fullName}` : fullName

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mi Perfil</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Gestioná tus datos personales, firma digitalizada y accesos de asistentes.
        </p>
      </div>

      <Tabs defaultValue="datos" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md bg-muted/60 mb-6">
          <TabsTrigger value="datos" className="gap-1.5 text-xs">
            <User className="h-3.5 w-3.5" />Mis Datos
          </TabsTrigger>
          <TabsTrigger value="firma" className="gap-1.5 text-xs" disabled={!isMedico}>
            <FileSignature className="h-3.5 w-3.5" />Firma y Logo
          </TabsTrigger>
          <TabsTrigger value="asistentes" className="gap-1.5 text-xs" disabled={!isMedico}>
            <Users className="h-3.5 w-3.5" />Asistentes
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: DATOS ─────────────────────────────────────── */}
        <TabsContent value="datos">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-lg">Datos Personales</CardTitle>
              <CardDescription>Información de contacto y Acreditación del profesional.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveDatos} className="space-y-6">
                {/* Avatar row */}
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center p-4 rounded-xl bg-muted/30">
                  <Avatar className="h-14 w-14">
                    <AvatarFallback className="bg-primary/10 text-primary text-lg font-bold">
                      {fullName.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{displayName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{userEmail}</p>
                    <span className="inline-flex items-center gap-1.5 mt-2.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary capitalize">
                      <Shield className="h-3 w-3" />Rol: {profile.role}
                    </span>
                  </div>
                </div>

                <Separator className="my-4" />

                {/* Nombre */}
                <div className="space-y-2">
                  <Label htmlFor="full_name" className="text-sm font-medium">Nombre completo</Label>
                  <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>

                {/* Matrículas — solo médicos */}
                {isMedico ? (
                  <div className="space-y-3 pt-1">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Matrículas profesionales</Label>
                      <p className="text-[11px] text-muted-foreground">
                        <span className="font-semibold">MP</span> Provincial ·{' '}
                        <span className="font-semibold">MN</span> Nacional ·{' '}
                        <span className="font-semibold">ME</span> Especialidad
                      </p>
                    </div>
                    <MatriculasEditor matriculas={matriculas} onChange={setMatriculas} />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Médico vinculado</Label>
                    <Input
                      value={medicoVinculado ? `${medicoVinculado.full_name} (${medicoVinculado.email})` : 'No vinculado'}
                      disabled className="bg-muted text-muted-foreground"
                    />
                  </div>
                )}

                {/* Título — solo médicos */}
                {isMedico && (
                  <>
                    <Separator className="my-4" />
                    <div className="space-y-3 pt-1">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">Título / Tratamiento</Label>
                        <p className="text-[11px] text-muted-foreground">
                          Se usará en documentos generados y en el encabezado de la app.
                        </p>
                      </div>
                      <TituloSelector value={titulo} onChange={setTitulo} />
                    </div>
                  </>
                )}

                {/* Permisos asistente */}
                {!isMedico && medicoVinculado && (
                  <div className="p-4 bg-muted/40 rounded-xl border border-border">
                    <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Shield className="h-4 w-4 text-primary" />
                      Tus permisos activos
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {PERMISOS_GRUPOS.map((grupo) => (
                        <div key={grupo.titulo} className="space-y-1.5 p-3 rounded-lg bg-background border border-border/60">
                          <p className="text-xs font-bold text-foreground/85">{grupo.titulo}</p>
                          <ul className="text-xs space-y-1.5 text-muted-foreground mt-1">
                            {grupo.permisos.map((perm) => {
                              const habilitado = profile.permisos[perm] === true
                              return (
                                <li key={perm} className="flex items-center justify-between">
                                  <span>{PERMISO_LABELS[perm]}</span>
                                  <span className={cn(
                                    "px-1.5 py-0.5 rounded text-[10px] font-semibold",
                                    habilitado ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-500"
                                  )}>
                                    {habilitado ? 'Habilitado' : 'Desactivado'}
                                  </span>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end pt-2">
                  <Button type="submit" disabled={isPending} className="gap-1.5">
                    {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Guardar cambios
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 2: FIRMA Y LOGO ──────────────────────────────── */}
        <TabsContent value="firma">
          <div className="space-y-6">
            {/* Firma */}
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileSignature className="h-5 w-5 text-primary" />Firma Digital
                </CardTitle>
                <CardDescription>
                  Se estampará automáticamente en recetas, pedidos y certificados generados en PDF.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <ImageUploader
                  label="Firma" hint="Usá el pad o subí una imagen para registrar una"
                  current={firma} onSave={handleSaveFirma} onDelete={handleDeleteFirma} isPending={isPending}
                />
                <Separator />
                <div className="space-y-2">
                  <Label>Dibujar firma digital</Label>
                  <SignaturePad onSave={handleSaveFirma} />
                </div>
              </CardContent>
            </Card>

            {/* Logo institucional */}
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />Logo / Sello Institucional
                </CardTitle>
                <CardDescription>
                  Logotipo o sello de tu consultorio/institución. Se incluirá en los documentos PDF generados.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ImageUploader
                  label="Logo institucional" hint="Subí el logo o sello de tu consultorio"
                  current={logo} onSave={handleSaveLogo} onDelete={handleDeleteLogo} isPending={isPending}
                  accept="image/png, image/jpeg, image/svg+xml, image/webp"
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── TAB 3: ASISTENTES ───────────────────────────────── */}
        <TabsContent value="asistentes">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-lg">Gestión de Asistentes</CardTitle>
              <CardDescription>Administrá y otorgá permisos a los asistentes vinculados a tu consultorio.</CardDescription>
            </CardHeader>
            <CardContent>
              {asistentes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Users className="h-10 w-10 text-muted-foreground/30 mb-2" />
                  <p className="text-sm font-semibold text-muted-foreground">No tenés asistentes vinculados</p>
                  <p className="text-xs text-muted-foreground/60 max-w-sm mt-1">
                    Tus asistentes pueden vincularse enviando una solicitud desde su onboarding usando tu correo.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {asistentes.map((a) => (
                    <AsistenteCard
                      key={a.id}
                      asistente={a}
                      onDesvincular={handleDesvincular}
                      isPendingGlobal={isPending}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
