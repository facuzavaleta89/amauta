import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PatientForm } from '@/components/pacientes/patient-form'
import { PacienteAcciones } from '@/components/pacientes/paciente-acciones'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Pencil, CalendarDays, Phone, Mail, MapPin, ShieldCheck, FileText, ClipboardList, Award, Archive, FolderOpen } from 'lucide-react'
import Link from 'next/link'
import PageHeader from '@/components/shared/page-header'
import { resolverObraSocial, SIN_OBRA_SOCIAL_LABEL } from '@/lib/pacientes/obra-social'
import { differenceInYears, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatFecha } from '@/lib/utils/format-date'
import type { Metadata } from 'next'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ edit?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('pacientes').select('nombre_completo').eq('id', id).single()
  return { title: data?.nombre_completo ?? 'Paciente' }
}

export default async function PacienteDetailPage({ params, searchParams }: Props) {
  const { id } = await params
  const { edit } = await searchParams

  const supabase = await createClient()

  const { data: paciente, error } = await supabase
    .from('pacientes')
    .select('*, obras_sociales ( id, nombre )')
    .eq('id', id)
    .single()

  if (error || !paciente) {
    notFound()
  }

  const { data: obrasSociales } = await supabase.from('obras_sociales').select('*').order('nombre')

  // Rol del usuario actual: archivar/desarchivar/eliminar es exclusivo del médico.
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, ver_historia_clinica, ver_turnos, crear_pedidos, crear_certificados, editar_pacientes')
    .eq('id', user!.id)
    .single()
  const esMedico = profile?.role === 'medico'
  // Decide qué acciones se ven habilitadas. El médico siempre puede; el asistente,
  // según su permiso. Para los botones esto es SOLO UX —la protección real la hacen
  // las páginas destino y los endpoints—, salvo `puedeEditar`, que además gatea la
  // apertura del formulario de edición (ver `isEditing` abajo).
  const puedeVerHistoria = esMedico || !!profile?.ver_historia_clinica
  const puedeVerTurnos   = esMedico || !!profile?.ver_turnos
  const puedeCrearPedido = esMedico || !!profile?.crear_pedidos
  const puedeCrearCert   = esMedico || !!profile?.crear_certificados
  const puedeEditar      = esMedico || !!profile?.editar_pacientes

  const archivado = Boolean(paciente.archivado_at)

  // Un paciente archivado no se edita, ni siquiera entrando por ?edit=true.
  // Y sin `editar_pacientes` tampoco: entrar por URL ya no abre el formulario —
  // se muestra la ficha normal. El PATCH del endpoint lo rechaza igual (403).
  const isEditing = edit === 'true' && !archivado && puedeEditar

  const edad = paciente.fecha_nacimiento
    ? differenceInYears(new Date(), new Date(paciente.fecha_nacimiento))
    : null

  const obraSocialNombre = resolverObraSocial(paciente)

  // El <p> de la descripción antes llevaba `capitalize` (el sexo se guarda en
  // minúscula). PageHeader no expone className para la descripción, así que la
  // mayúscula inicial se resuelve acá, sobre el dato.
  const sexoLabel = paciente.sexo
    ? paciente.sexo.charAt(0).toUpperCase() + paciente.sexo.slice(1)
    : paciente.sexo

  if (isEditing) {
    return (
      <div className="max-w-4xl space-y-6">
        <PageHeader
          title="Editar Paciente"
          description={`Modificá los datos de ${paciente.nombre_completo}`}
          backHref={`/pacientes/${id}`}
        />

        <PatientForm
          initialData={paciente}
          obrasSociales={obrasSociales || []}
        />
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* El badge "Archivado" viaja por el slot de acciones de PageHeader: el título
          lo emite el componente compartido y no admite markup adyacente (decisión de
          producto: nada de íconos ni adornos pegados al h1). */}
      <PageHeader
        title={paciente.nombre_completo}
        description={`${sexoLabel} · ${edad !== null ? `${edad} años` : 'Edad desconocida'}`}
        backHref="/pacientes"
      >
        {archivado && (
          <Badge variant="secondary" className="gap-1 text-amber-700 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/10">
            <Archive className="h-3 w-3" />
            Archivado
          </Badge>
        )}
        {/* ⚠ Acá `archivado` OCULTA el botón (comportamiento previo, se conserva);
            la falta de permiso lo muestra deshabilitado, como el resto. */}
        {!archivado && (
          puedeEditar ? (
            <Button asChild variant="outline" className="gap-2">
              <Link href={`/pacientes/${id}?edit=true`}>
                <Pencil className="h-4 w-4" />
                <span className="hidden sm:inline">Editar</span>
              </Link>
            </Button>
          ) : (
            <Button variant="outline" className="gap-2" disabled title="Requiere permiso para editar pacientes">
              <Pencil className="h-4 w-4" />
              <span className="hidden sm:inline">Editar</span>
            </Button>
          )
        )}
        {esMedico && (
          <PacienteAcciones
            patientId={paciente.id}
            patientName={paciente.nombre_completo}
            archivado={archivado}
          />
        )}
      </PageHeader>

      {/* Aviso de paciente archivado */}
      {archivado && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
          <Archive className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-amber-800 dark:text-amber-200">
            Este paciente está <strong>archivado</strong>. Sus datos e historia clínica se conservan,
            pero no se le pueden emitir documentos ni editar mientras esté archivado.
            {esMedico && ' Usá "Desarchivar" para reactivarlo.'}
          </p>
        </div>
      )}

      {/* Cards de información */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Datos personales */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Datos Personales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">DNI</span>
              <span className="font-mono font-medium">{paciente.dni}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Fecha de nacimiento</span>
              <span className="font-medium">
                {paciente.fecha_nacimiento
                  ? format(new Date(paciente.fecha_nacimiento + 'T12:00:00'), "d 'de' MMMM 'de' yyyy", { locale: es })
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Sexo</span>
              <Badge variant="outline" className="capitalize text-xs">{paciente.sexo}</Badge>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Registrado</span>
              <span className="text-muted-foreground">
                {/* `created_at` es TIMESTAMPTZ: zona AR fija (antes salía en la del
                    runtime, UTC en Vercel, y después de las 21:00 ART mostraba el día
                    siguiente). `formatFecha` ya usa "d MMM yyyy" por defecto. */}
                {formatFecha(paciente.created_at)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Contacto */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Contacto y Residencia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>{paciente.telefono ?? <span className="text-muted-foreground">Sin teléfono</span>}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>{paciente.email ?? <span className="text-muted-foreground">Sin email</span>}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>
                {[paciente.ciudad, paciente.provincia].filter(Boolean).join(', ') ||
                  <span className="text-muted-foreground">Sin dirección</span>}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Obra Social */}
        <Card className="border-border/60 shadow-sm md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Cobertura Médica
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-6">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Obra Social</p>
              <p className="text-sm font-medium">{obraSocialNombre ?? SIN_OBRA_SOCIAL_LABEL}</p>
            </div>
            {paciente.numero_afiliado && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">N° de Afiliado</p>
                <p className="text-sm font-mono font-medium">{paciente.numero_afiliado}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Accesos rápidos. Las acciones de escritura se deshabilitan si está archivado. */}
      <div className="flex flex-wrap gap-3">
        {/* Cada acción se deshabilita si el paciente está archivado O si falta el permiso.
            El motivo del `title` distingue las dos causas. Sin permiso el botón va SIN
            <Link>: un <a> no se apaga con `disabled`. */}
        {archivado || !puedeEditar ? (
          <Button
            variant="outline"
            className="gap-2"
            disabled
            title={archivado ? 'Paciente archivado' : 'Requiere permiso para editar pacientes'}
          >
            <Pencil className="h-4 w-4" />
            Editar datos
          </Button>
        ) : (
          <Button variant="outline" className="gap-2" asChild>
            <Link href={`/pacientes/${id}?edit=true`}>
              <Pencil className="h-4 w-4" />
              Editar datos
            </Link>
          </Button>
        )}
        {/* Ver turnos no depende de `archivado`: la agenda se consulta igual. */}
        {puedeVerTurnos ? (
          <Button variant="outline" className="gap-2" asChild>
            <Link href={`/turnero?paciente_id=${id}`}>
              <CalendarDays className="h-4 w-4" />
              Ver turnos
            </Link>
          </Button>
        ) : (
          <Button variant="outline" className="gap-2" disabled title="Requiere permiso para ver turnos">
            <CalendarDays className="h-4 w-4" />
            Ver turnos
          </Button>
        )}
        {archivado || !puedeCrearPedido ? (
          <Button
            variant="outline"
            className="gap-2"
            disabled
            title={archivado
              ? 'No se pueden emitir documentos a un paciente archivado'
              : 'Requiere permiso para emitir pedidos'}
          >
            <ClipboardList className="h-4 w-4" />
            Nuevo Pedido
          </Button>
        ) : (
          <Button variant="outline" className="gap-2" asChild>
            <Link href={`/pedidos/nuevo?paciente_id=${id}`}>
              <ClipboardList className="h-4 w-4" />
              Nuevo Pedido
            </Link>
          </Button>
        )}
        {archivado || !puedeCrearCert ? (
          <Button
            variant="outline"
            className="gap-2"
            disabled
            title={archivado
              ? 'No se pueden emitir documentos a un paciente archivado'
              : 'Requiere permiso para emitir certificados'}
          >
            <Award className="h-4 w-4" />
            Nuevo Certificado
          </Button>
        ) : (
          <Button variant="outline" className="gap-2" asChild>
            <Link href={`/certificados/nuevo?paciente_id=${id}`}>
              <Award className="h-4 w-4" />
              Nuevo Certificado
            </Link>
          </Button>
        )}
        {/* Sin `ver_historia_clinica` los dos botones se muestran deshabilitados y SIN
            <Link>: un <a> no se apaga con `disabled`, así que hay que sacar el link. */}
        {puedeVerHistoria ? (
          <Button variant="default" className="gap-2" asChild>
            <Link href={`/pacientes/${id}/historia`}>
              <FileText className="h-4 w-4" />
              Historia clínica
            </Link>
          </Button>
        ) : (
          <Button variant="default" className="gap-2" disabled>
            <FileText className="h-4 w-4" />
            Historia clínica
          </Button>
        )}
        {/* Estudios: se pueden ver aun archivado (la subida se bloquea dentro de la página). */}
        {puedeVerHistoria ? (
          <Button variant="outline" className="gap-2" asChild>
            <Link href={`/pacientes/${id}/estudios`}>
              <FolderOpen className="h-4 w-4" />
              Estudios
            </Link>
          </Button>
        ) : (
          <Button variant="outline" className="gap-2" disabled>
            <FolderOpen className="h-4 w-4" />
            Estudios
          </Button>
        )}
      </div>
    </div>
  )
}
