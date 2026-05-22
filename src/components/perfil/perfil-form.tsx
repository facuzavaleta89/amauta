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
import { toast } from 'sonner'
import {
  User,
  Shield,
  FileSignature,
  Users,
  Loader2,
  Trash2,
  Upload,
  AlertCircle,
  FileImage,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'

import { SignaturePad } from './signature-pad'
import {
  actualizarPerfil,
  guardarFirma,
  actualizarPermisoAsistente,
  desvincularAsistente,
} from '@/app/(app)/perfil/actions'

// ── Componente Switch Custom ────────────────────────────────────────────────
interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}

function Switch({ checked, onCheckedChange, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none',
        checked ? 'bg-primary' : 'bg-muted-foreground/30',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out',
          checked ? 'translate-x-4' : 'translate-x-0'
        )}
      />
    </button>
  )
}

// ── Tipos ───────────────────────────────────────────────────────────────────
interface Asistente {
  id: string
  full_name: string
  email: string
  puede_ver_historias: boolean
  puede_editar_agenda: boolean
  created_at: string
}

interface PerfilFormProps {
  profile: {
    id: string
    full_name: string
    role: 'medico' | 'asistente'
    matricula: string | null
    firma_url: string | null
    puede_ver_historias: boolean
    puede_editar_agenda: boolean
    medico_id: string | null
  }
  userEmail: string
  medicoVinculado?: { full_name: string; email: string } | null
  asistentesIniciales: Asistente[]
}

export function PerfilForm({
  profile,
  userEmail,
  medicoVinculado,
  asistentesIniciales,
}: PerfilFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Estados locales
  const [fullName, setFullName] = useState(profile.full_name)
  const [matricula, setMatricula] = useState(profile.matricula || '')
  const [firma, setFirma] = useState<string | null>(profile.firma_url)
  const [asistentes, setAsistentes] = useState<Asistente[]>(asistentesIniciales)

  const isMedico = profile.role === 'medico'

  // 1. Guardar Datos Básicos
  const handleSaveDatos = async (e: React.FormEvent) => {
    e.preventDefault()
    startTransition(async () => {
      const res = await actualizarPerfil(fullName, isMedico ? matricula : null)
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success('Perfil actualizado correctamente')
        router.refresh()
      }
    })
  }

  // 2. Guardar Firma (Pad o Archivo)
  const handleSaveFirma = async (base64Data: string) => {
    startTransition(async () => {
      const res = await guardarFirma(base64Data)
      if (res.error) {
        toast.error(res.error)
      } else {
        setFirma(base64Data)
        toast.success('Firma digital actualizada con éxito')
        router.refresh()
      }
    })
  }

  // 3. Eliminar Firma
  const handleDeleteFirma = async () => {
    startTransition(async () => {
      const res = await guardarFirma(null)
      if (res.error) {
        toast.error(res.error)
      } else {
        setFirma(null)
        toast.success('Firma eliminada')
        router.refresh()
      }
    })
  }

  // 4. Subir archivo de firma y convertir a base64
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      return toast.error('El archivo debe ser una imagen (PNG/JPG)')
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        handleSaveFirma(reader.result)
      }
    };
    reader.readAsDataURL(file)
  }

  // 5. Cambiar permisos de asistente
  const handleTogglePermiso = async (
    asistenteId: string,
    permiso: 'puede_ver_historias' | 'puede_editar_agenda',
    valor: boolean
  ) => {
    // Optimista UI
    setAsistentes((prev) =>
      prev.map((a) => (a.id === asistenteId ? { ...a, [permiso]: valor } : a))
    )

    const res = await actualizarPermisoAsistente(asistenteId, permiso, valor)
    if (res.error) {
      toast.error(res.error)
      // Rollback
      setAsistentes((prev) =>
        prev.map((a) => (a.id === asistenteId ? { ...a, [permiso]: !valor } : a))
      )
    } else {
      toast.success('Permiso actualizado')
      router.refresh()
    }
  }

  // 6. Desvincular asistente
  const handleDesvincular = async (asistenteId: string) => {
    startTransition(async () => {
      const res = await desvincularAsistente(asistenteId)
      if (res.error) {
        toast.error(res.error)
      } else {
        setAsistentes((prev) => prev.filter((a) => a.id !== asistenteId))
        toast.success('Asistente desvinculado con éxito')
        router.refresh()
      }
    })
  }

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
            <User className="h-3.5 w-3.5" />
            Mis Datos
          </TabsTrigger>
          <TabsTrigger value="firma" className="gap-1.5 text-xs" disabled={!isMedico}>
            <FileSignature className="h-3.5 w-3.5" />
            Firma Digital
          </TabsTrigger>
          <TabsTrigger value="asistentes" className="gap-1.5 text-xs" disabled={!isMedico}>
            <Users className="h-3.5 w-3.5" />
            Asistentes
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: DATOS PERSONALES ────────────────────────────── */}
        <TabsContent value="datos">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-lg">Datos Personales</CardTitle>
              <CardDescription>
                Información de contacto y acreditación del profesional.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveDatos} className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center p-3 rounded-lg bg-muted/30 mb-2">
                  <Avatar className="h-14 w-14">
                    <AvatarFallback className="bg-primary/10 text-primary text-lg font-bold">
                      {fullName.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{fullName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{userEmail}</p>
                    <span className="inline-flex items-center gap-1.5 mt-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary capitalize">
                      <Shield className="h-3 w-3" />
                      Rol: {profile.role}
                    </span>
                  </div>
                </div>

                <Separator className="my-2" />

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="full_name">Nombre completo</Label>
                    <Input
                      id="full_name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                    />
                  </div>

                  {isMedico ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="matricula">Matrícula profesional</Label>
                      <Input
                        id="matricula"
                        placeholder="Ej: MN 123456 / MP 98765"
                        value={matricula}
                        onChange={(e) => setMatricula(e.target.value)}
                      />
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Label>Médico vinculado</Label>
                      <Input
                        value={
                          medicoVinculado
                            ? `${medicoVinculado.full_name} (${medicoVinculado.email})`
                            : 'No vinculado'
                        }
                        disabled
                        className="bg-muted text-muted-foreground"
                      />
                    </div>
                  )}
                </div>

                {!isMedico && medicoVinculado && (
                  <div className="p-3 bg-primary/5 rounded-lg border border-primary/10 flex items-start gap-2.5 mt-2">
                    <AlertCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-primary uppercase tracking-wide">
                        Tus permisos activos
                      </p>
                      <ul className="text-xs text-muted-foreground list-disc list-inside mt-1.5 space-y-1">
                        <li>
                          Visualizar historias clínicas:{' '}
                          <strong className={profile.puede_ver_historias ? 'text-emerald-600' : 'text-rose-500'}>
                            {profile.puede_ver_historias ? 'Habilitado' : 'Desactivado'}
                          </strong>
                        </li>
                        <li>
                          Modificar agenda y turnos:{' '}
                          <strong className={profile.puede_editar_agenda ? 'text-emerald-600' : 'text-rose-500'}>
                            {profile.puede_editar_agenda ? 'Habilitado' : 'Desactivado'}
                          </strong>
                        </li>
                      </ul>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end pt-2">
                  <Button type="submit" disabled={isPending} className="gap-1.5">
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    Guardar cambios
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 2: FIRMA DIGITAL ───────────────────────────────── */}
        <TabsContent value="firma">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-lg">Firma Digital</CardTitle>
              <CardDescription>
                Esta firma se estampará automáticamente en tus recetas, pedidos médicos y certificados generados en PDF.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6 items-start">
                {/* Visualizar firma actual */}
                <div className="space-y-3">
                  <Label>Firma actual registrada</Label>
                  <div className="flex items-center justify-center border border-border/80 rounded-xl bg-muted/10 h-48 relative overflow-hidden">
                    {firma ? (
                      <div className="flex flex-col items-center justify-center p-4">
                        <img
                          src={firma}
                          alt="Firma digitalizada"
                          className="h-28 w-auto object-contain select-none"
                        />
                        <span className="text-[10px] text-muted-foreground mt-2 font-mono">
                          Firma en formato base64 segura
                        </span>
                      </div>
                    ) : (
                      <div className="text-center p-4 text-muted-foreground/60">
                        <FileImage className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
                        <p className="text-sm font-medium">No hay ninguna firma registrada</p>
                        <p className="text-xs">Usa el pad o subí una imagen para registrar una</p>
                      </div>
                    )}
                  </div>
                  {firma && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleDeleteFirma}
                      disabled={isPending}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full gap-1.5"
                    >
                      <Trash2 className="h-4 w-4" />
                      Eliminar firma actual
                    </Button>
                  )}
                </div>

                {/* Subir o crear firma */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Subir firma como imagen</Label>
                    <div className="relative flex items-center justify-center border-2 border-dashed border-border rounded-lg p-4 bg-muted/20 hover:bg-muted/30 transition-colors cursor-pointer group">
                      <input
                        type="file"
                        accept="image/png, image/jpeg"
                        onChange={handleFileUpload}
                        disabled={isPending}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      <div className="text-center pointer-events-none text-muted-foreground group-hover:text-foreground transition-colors">
                        <Upload className="h-6 w-6 mx-auto mb-1.5 text-muted-foreground/80" />
                        <p className="text-xs font-semibold">Cargar imagen (PNG o JPG)</p>
                        <p className="text-[10px] text-muted-foreground/80">Recomendado: fondo transparente</p>
                      </div>
                    </div>
                  </div>

                  <Separator className="my-2" />

                  <div className="space-y-2">
                    <Label>Dibujar firma digital</Label>
                    <SignaturePad onSave={handleSaveFirma} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 3: GESTIÓN DE ASISTENTES ───────────────────────── */}
        <TabsContent value="asistentes">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-lg">Gestión de Asistentes</CardTitle>
              <CardDescription>
                Administrá y otorga permisos detallados a los asistentes vinculados a tu consultorio.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {asistentes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Users className="h-10 w-10 text-muted-foreground/30 mb-2" />
                  <p className="text-sm font-semibold text-muted-foreground">
                    No tenés asistentes vinculados
                  </p>
                  <p className="text-xs text-muted-foreground/60 max-w-sm mt-1">
                    Tus asistentes pueden vincularse enviando una solicitud desde su sección de registro/onboarding usando tu correo.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {asistentes.map((a) => (
                    <div
                      key={a.id}
                      className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl border border-border bg-card/60 gap-4"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-primary/10 text-primary font-bold">
                            {a.full_name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-sm text-foreground leading-tight">
                            {a.full_name}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">{a.email}</p>
                        </div>
                      </div>

                      {/* Permisos */}
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={a.puede_ver_historias}
                            onCheckedChange={(checked) =>
                              handleTogglePermiso(a.id, 'puede_ver_historias', checked)
                            }
                          />
                          <div className="text-left">
                            <p className="text-[11px] font-medium text-foreground leading-none">
                              Historias Clínicas
                            </p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">Ver y editar</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Switch
                            checked={a.puede_editar_agenda}
                            onCheckedChange={(checked) =>
                              handleTogglePermiso(a.id, 'puede_editar_agenda', checked)
                            }
                          />
                          <div className="text-left">
                            <p className="text-[11px] font-medium text-foreground leading-none">
                              Modificar Agenda
                            </p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">Agenda y turnos</p>
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDesvincular(a.id)}
                          disabled={isPending}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1 h-8 text-xs px-2"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Desvincular
                        </Button>
                      </div>
                    </div>
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
