'use client'

import { useState, useEffect, useMemo } from 'react'
import { useForm, useWatch, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  Save, CheckCircle2, X, Loader2, Lock, Plus, Trash2,
  ClipboardList, Activity, Beaker, Stethoscope, CalendarClock, FileText, Pill,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'

import { consultaSchema, type ConsultaFormInput } from '@/lib/validations/consulta.schema'
import { FinalizarDialog } from './finalizar-dialog'
import { ConsultaPDFButton } from './pdf-download-button'
import type { Consulta, CampoExtraSeccion } from '@/types/consulta'

// ── Tipos ─────────────────────────────────────────────────────

interface ConsultaDetailProps {
  mode: 'new' | 'edit' | 'view'
  consulta: Consulta | null   // null cuando mode='new'
  pacienteId: string
  onSaved: (c: Consulta) => void
  onCancel: () => void
}

// ── Helpers de visualización ──────────────────────────────────

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  )
}

function SectionHeader({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4 text-primary shrink-0" />
      <h3 className="text-sm font-semibold text-foreground">{label}</h3>
      <Separator className="flex-1" />
    </div>
  )
}

// ── Vista de sólo lectura (consulta finalizada) ───────────────

function ConsultaReadOnly({ consulta }: { consulta: Consulta }) {
  const examenExtra = (consulta.campos_extra ?? []).filter((c) => c.seccion === 'examen_fisico')
  const metabolicoExtra = (consulta.campos_extra ?? []).filter((c) => c.seccion === 'parametros_metabolicos')
  const hasExamenFisico = !!(
    consulta.peso_kg || consulta.talla_cm || consulta.ta_sistolica ||
    consulta.ta_diastolica || consulta.frecuencia_cardiaca || consulta.temperatura
  ) || examenExtra.length > 0
  const hasMetabolico = !!(
    consulta.glucemia_ayunas || consulta.glucemia_postprandial || consulta.hba1c ||
    consulta.trigliceridos || consulta.colesterol_ldl || consulta.colesterol_hdl
  ) || metabolicoExtra.length > 0
  const imc = consulta.peso_kg && consulta.talla_cm
    ? (consulta.peso_kg / Math.pow(consulta.talla_cm / 100, 2)).toFixed(1)
    : null

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Lock className="h-4 w-4 text-emerald-600" />
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Finalizada</Badge>
          </div>
          <time className="text-lg font-bold text-foreground block">
            {format(new Date(consulta.fecha_hora), "d 'de' MMMM 'de' yyyy — HH:mm 'hs'", { locale: es })}
          </time>
          <p className="text-xs text-muted-foreground mt-0.5">
            La consulta está finalizada y no puede editarse.
          </p>
        </div>
        <ConsultaPDFButton consultaId={consulta.id} />
      </div>

      <Separator />

      {/* Motivo */}
      {consulta.motivo_consulta && (
        <div>
          <SectionHeader icon={ClipboardList} label="Motivo de Consulta" />
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{consulta.motivo_consulta}</p>
        </div>
      )}

      {/* Medicación actual */}
      {consulta.medicacion_actual && (
        <div>
          <SectionHeader icon={Pill} label="Medicación Actual" />
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{consulta.medicacion_actual}</p>
        </div>
      )}

      {/* Anamnesis */}
      {consulta.anamnesis && (
        <div>
          <SectionHeader icon={FileText} label="Anamnesis" />
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{consulta.anamnesis}</p>
        </div>
      )}

      {/* Examen físico */}
      {hasExamenFisico && (
        <div>
          <SectionHeader icon={Activity} label="Examen Físico" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Peso" value={consulta.peso_kg ? `${consulta.peso_kg} kg` : null} />
            <Field label="Talla" value={consulta.talla_cm ? `${consulta.talla_cm} cm` : null} />
            <Field label="IMC" value={imc ? `${imc} kg/m²` : null} />
            <Field label="TA Sistólica" value={consulta.ta_sistolica ? `${consulta.ta_sistolica} mmHg` : null} />
            <Field label="TA Diastólica" value={consulta.ta_diastolica ? `${consulta.ta_diastolica} mmHg` : null} />
            <Field label="FC" value={consulta.frecuencia_cardiaca ? `${consulta.frecuencia_cardiaca} lpm` : null} />
            <Field label="Temperatura" value={consulta.temperatura ? `${consulta.temperatura} °C` : null} />
            {examenExtra.map((c, i) => <Field key={`ef-${i}`} label={c.nombre} value={c.valor || '—'} />)}
          </div>
        </div>
      )}

      {/* Metabólicos */}
      {hasMetabolico && (
        <div>
          <SectionHeader icon={Beaker} label="Parámetros Metabólicos" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label="Glucemia en ayunas" value={consulta.glucemia_ayunas ? `${consulta.glucemia_ayunas} mg/dL` : null} />
            <Field label="Glucemia postprandial" value={consulta.glucemia_postprandial ? `${consulta.glucemia_postprandial} mg/dL` : null} />
            <Field label="HbA1c" value={consulta.hba1c ? `${consulta.hba1c}%` : null} />
            <Field label="Triglicéridos" value={consulta.trigliceridos ? `${consulta.trigliceridos} mg/dL` : null} />
            <Field label="LDL" value={consulta.colesterol_ldl ? `${consulta.colesterol_ldl} mg/dL` : null} />
            <Field label="HDL" value={consulta.colesterol_hdl ? `${consulta.colesterol_hdl} mg/dL` : null} />
            {metabolicoExtra.map((c, i) => <Field key={`pm-${i}`} label={c.nombre} value={c.valor || '—'} />)}
          </div>
        </div>
      )}

      {/* Diagnóstico y plan */}
      {(consulta.diagnostico || consulta.plan_terapeutico || consulta.observaciones) && (
        <div>
          <SectionHeader icon={Stethoscope} label="Diagnóstico y Plan" />
          <div className="space-y-4">
            {consulta.diagnostico       && <Field label="Diagnóstico" value={consulta.diagnostico} />}
            {consulta.plan_terapeutico  && <Field label="Plan terapéutico" value={consulta.plan_terapeutico} />}
            {consulta.observaciones     && <Field label="Observaciones" value={consulta.observaciones} />}
          </div>
        </div>
      )}

      {/* Seguimiento */}
      {(() => {
        if (!consulta.proximo_turno_sugerido) return null
        const tieneHora = consulta.proximo_turno_sugerido.includes('T')
        const fechaObj = tieneHora
          ? new Date(consulta.proximo_turno_sugerido)
          : new Date(consulta.proximo_turno_sugerido + 'T12:00:00')

        if (isNaN(fechaObj.getTime())) return null

        const valorFormateado = tieneHora
          ? format(fechaObj, "d 'de' MMMM 'de' yyyy 'a las' HH:mm 'hs'", { locale: es })
          : format(fechaObj, "d 'de' MMMM 'de' yyyy", { locale: es })

        return (
          <div>
            <SectionHeader icon={CalendarClock} label="Seguimiento" />
            <Field
              label="Próximo control sugerido"
              value={valorFormateado}
            />
          </div>
        )
      })()}
    </div>
  )
}

// ── Formulario (nueva / editar borrador) ──────────────────────

function ConsultaForm({
  mode, consulta, pacienteId, onSaved, onCancel,
}: Pick<ConsultaDetailProps, 'mode' | 'consulta' | 'pacienteId' | 'onSaved' | 'onCancel'>) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showFinalizar, setShowFinalizar] = useState(false)

  // Valor default para fecha_hora: ahora, en formato datetime-local
  const nowLocal = useMemo(() => {
    const now = new Date()
    now.setSeconds(0, 0)
    return now.toISOString().slice(0, 16)
  }, [])

  const todayStr = useMemo(() => {
    return new Date().toISOString().split('T')[0]
  }, [])

  const form = useForm<ConsultaFormInput>({
    resolver: zodResolver(consultaSchema) as any,
    defaultValues: {
      paciente_id:           pacienteId,
      fecha_hora:            consulta?.fecha_hora
        ? new Date(consulta.fecha_hora).toISOString().slice(0, 16)
        : nowLocal,
      motivo_consulta:       consulta?.motivo_consulta ?? '',
      anamnesis:             consulta?.anamnesis ?? '',
      peso_kg:               consulta?.peso_kg ?? '',
      talla_cm:              consulta?.talla_cm ?? '',
      ta_sistolica:          consulta?.ta_sistolica ?? '',
      ta_diastolica:         consulta?.ta_diastolica ?? '',
      frecuencia_cardiaca:   consulta?.frecuencia_cardiaca ?? '',
      temperatura:           consulta?.temperatura ?? '',
      glucemia_ayunas:       consulta?.glucemia_ayunas ?? '',
      glucemia_postprandial: consulta?.glucemia_postprandial ?? '',
      hba1c:                 consulta?.hba1c ?? '',
      trigliceridos:         consulta?.trigliceridos ?? '',
      colesterol_ldl:        consulta?.colesterol_ldl ?? '',
      colesterol_hdl:        consulta?.colesterol_hdl ?? '',
      diagnostico:           consulta?.diagnostico ?? '',
      plan_terapeutico:      consulta?.plan_terapeutico ?? '',
      medicacion_actual:     consulta?.medicacion_actual ?? '',
      observaciones:         consulta?.observaciones ?? '',
      proximo_turno_sugerido: consulta?.proximo_turno_sugerido ?? '',
      campos_extra:          consulta?.campos_extra ?? [],
      estado: 'borrador',
    },
  })

  // Campos extra ad-hoc (examen físico / parámetros metabólicos)
  const { fields: camposExtra, append: appendCampo, remove: removeCampo } =
    useFieldArray({ control: form.control, name: 'campos_extra' })

  // IMC calculado en tiempo real
  const pesoVal  = useWatch({ control: form.control, name: 'peso_kg' })
  const tallaVal = useWatch({ control: form.control, name: 'talla_cm' })
  const imc = useMemo(() => {
    const p = parseFloat(String(pesoVal))
    const t = parseFloat(String(tallaVal))
    if (p > 0 && t > 0) return (p / Math.pow(t / 100, 2)).toFixed(1)
    return null
  }, [pesoVal, tallaVal])

  // Extraer valores iniciales para los inputs separados
  const initialDate = useMemo(() => {
    if (consulta?.proximo_turno_sugerido && consulta.proximo_turno_sugerido.includes('T')) {
      return consulta.proximo_turno_sugerido.split('T')[0]
    }
    return consulta?.proximo_turno_sugerido || ''
  }, [consulta])

  const initialTime = useMemo(() => {
    if (consulta?.proximo_turno_sugerido && consulta.proximo_turno_sugerido.includes('T')) {
      return consulta.proximo_turno_sugerido.split('T')[1]
    }
    return '09:00' // Hora por defecto sugerida
  }, [consulta])

  const [proximoFecha, setProximoFecha] = useState(initialDate)
  const [proximoHora, setProximoHora] = useState(initialTime)

  useEffect(() => {
    if (proximoFecha) {
      form.setValue('proximo_turno_sugerido', `${proximoFecha}T${proximoHora || '09:00'}`)
    } else {
      form.setValue('proximo_turno_sugerido', '')
    }
  }, [proximoFecha, proximoHora, form])

  async function submitWithEstado(estado: 'borrador' | 'finalizada') {
    // Descartar filas de campos extra completamente vacías antes de validar
    const camposActuales = form.getValues('campos_extra') ?? []
    const camposPodados = camposActuales.filter(
      (c) => (c?.nombre ?? '').trim() !== '' || (c?.valor ?? '').trim() !== ''
    )
    if (camposPodados.length !== camposActuales.length) {
      form.setValue('campos_extra', camposPodados)
    }

    const valid = await form.trigger()
    if (!valid) return

    setIsSubmitting(true)
    setShowFinalizar(false)

    try {
      const values = form.getValues()
      const payload = { ...values, estado }

      const url    = consulta ? `/api/consultas/${consulta.id}` : '/api/consultas'
      const method = consulta ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al guardar')
      }

      const json = await res.json()
      const { data } = json

      toast.success(estado === 'finalizada' ? 'Consulta finalizada correctamente' : 'Borrador guardado')

      onSaved(data)
    } catch (err: any) {
      toast.error(err.message || 'Ocurrió un error')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Helper para campos numéricos
  const numericProps = (field: any) => ({
    ...field,
    value: field.value ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => field.onChange(e.target.value),
  })

  // Render de los campos extra ad-hoc de una sección (nombre + valor + eliminar)
  const renderCamposExtra = (seccion: CampoExtraSeccion) => (
    <div className="mt-4 space-y-2">
      {camposExtra.map((campo, index) =>
        campo.seccion === seccion ? (
          <div key={campo.id} className="flex items-start gap-2">
            <FormField control={form.control} name={`campos_extra.${index}.nombre`} render={({ field }) => (
              <FormItem className="flex-1">
                <FormControl><Input placeholder="Nombre del campo" {...field} value={field.value || ''} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name={`campos_extra.${index}.valor`} render={({ field }) => (
              <FormItem className="flex-1">
                <FormControl><Input placeholder="Valor" {...field} value={field.value || ''} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => removeCampo(index)}
              aria-label="Eliminar campo"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ) : null
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => appendCampo({ seccion, nombre: '', valor: '' })}
        disabled={camposExtra.length >= 20}
      >
        <Plus className="h-4 w-4" />
        Agregar campo
      </Button>
    </div>
  )

  return (
    <>
      <Form {...form}>
        <form className="space-y-8" onSubmit={(e) => e.preventDefault()}>

          {/* ── Sección 1: Datos generales ── */}
          <div>
            <SectionHeader icon={ClipboardList} label="Datos Generales" />
            <div className="grid grid-cols-1 gap-4">
              <FormField control={form.control} name="fecha_hora" render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha y hora de la consulta</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="motivo_consulta" render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo de consulta <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Textarea placeholder="¿Por qué consulta hoy el paciente?" className="resize-y min-h-[80px]" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </div>

          {/* ── Medicación actual (entre motivo y anamnesis) ── */}
          <div>
            <SectionHeader icon={Pill} label="Medicación Actual" />
            <FormField control={form.control} name="medicacion_actual" render={({ field }) => (
              <FormItem>
                <FormLabel>Medicación actual</FormLabel>
                <FormControl><Textarea placeholder="Medicamentos que toma actualmente…" className="resize-y" {...field} value={field.value || ''} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>

          {/* ── Sección 2: Anamnesis ── */}
          <div>
            <SectionHeader icon={FileText} label="Anamnesis" />
            <FormField control={form.control} name="anamnesis" render={({ field }) => (
              <FormItem>
                <FormLabel>Anamnesis / síntomas actuales</FormLabel>
                <FormControl>
                  <Textarea placeholder="Descripción de la evolución clínica del paciente…" className="resize-y min-h-[100px]" {...field} value={field.value || ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>

          {/* ── Sección 3: Examen físico ── */}
          <div>
            <SectionHeader icon={Activity} label="Examen Físico" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <FormField control={form.control} name="peso_kg" render={({ field }) => (
                <FormItem>
                  <FormLabel>Peso (kg)</FormLabel>
                  <FormControl><Input type="number" step="0.1" placeholder="70.5" {...numericProps(field)} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="talla_cm" render={({ field }) => (
                <FormItem>
                  <FormLabel>Talla (cm)</FormLabel>
                  <FormControl><Input type="number" step="1" placeholder="175" {...numericProps(field)} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormItem>
                <FormLabel>IMC</FormLabel>
                <Input
                  readOnly
                  value={imc ? `${imc} kg/m²` : '—'}
                  className="bg-muted/50 text-muted-foreground cursor-default"
                />
              </FormItem>
              <FormField control={form.control} name="ta_sistolica" render={({ field }) => (
                <FormItem>
                  <FormLabel>TA Sistólica (mmHg)</FormLabel>
                  <FormControl><Input type="number" step="1" placeholder="120" {...numericProps(field)} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="ta_diastolica" render={({ field }) => (
                <FormItem>
                  <FormLabel>TA Diastólica (mmHg)</FormLabel>
                  <FormControl><Input type="number" step="1" placeholder="80" {...numericProps(field)} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="frecuencia_cardiaca" render={({ field }) => (
                <FormItem>
                  <FormLabel>FC (lpm)</FormLabel>
                  <FormControl><Input type="number" step="1" placeholder="72" {...numericProps(field)} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="temperatura" render={({ field }) => (
                <FormItem>
                  <FormLabel>Temperatura (°C)</FormLabel>
                  <FormControl><Input type="number" step="0.1" placeholder="36.5" {...numericProps(field)} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            {renderCamposExtra('examen_fisico')}
          </div>

          {/* ── Sección 4: Parámetros metabólicos ── */}
          <div>
            <SectionHeader icon={Beaker} label="Parámetros Metabólicos" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <FormField control={form.control} name="glucemia_ayunas" render={({ field }) => (
                <FormItem>
                  <FormLabel>Glucemia ayunas (mg/dL)</FormLabel>
                  <FormControl><Input type="number" step="0.1" placeholder="100" {...numericProps(field)} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="glucemia_postprandial" render={({ field }) => (
                <FormItem>
                  <FormLabel>Glucemia postprandial (mg/dL)</FormLabel>
                  <FormControl><Input type="number" step="0.1" placeholder="140" {...numericProps(field)} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="hba1c" render={({ field }) => (
                <FormItem>
                  <FormLabel>HbA1c (%)</FormLabel>
                  <FormControl><Input type="number" step="0.1" placeholder="6.5" {...numericProps(field)} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="trigliceridos" render={({ field }) => (
                <FormItem>
                  <FormLabel>Triglicéridos (mg/dL)</FormLabel>
                  <FormControl><Input type="number" step="1" placeholder="150" {...numericProps(field)} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="colesterol_ldl" render={({ field }) => (
                <FormItem>
                  <FormLabel>Colesterol LDL (mg/dL)</FormLabel>
                  <FormControl><Input type="number" step="1" placeholder="100" {...numericProps(field)} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="colesterol_hdl" render={({ field }) => (
                <FormItem>
                  <FormLabel>Colesterol HDL (mg/dL)</FormLabel>
                  <FormControl><Input type="number" step="1" placeholder="55" {...numericProps(field)} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            {renderCamposExtra('parametros_metabolicos')}
          </div>

          {/* ── Sección 5: Diagnóstico y plan ── */}
          <div>
            <SectionHeader icon={Stethoscope} label="Diagnóstico y Plan" />
            <div className="space-y-4">
              <FormField control={form.control} name="diagnostico" render={({ field }) => (
                <FormItem>
                  <FormLabel>Diagnóstico</FormLabel>
                  <FormControl><Textarea placeholder="Diagnóstico presuntivo o definitivo…" className="resize-y" {...field} value={field.value || ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="plan_terapeutico" render={({ field }) => (
                <FormItem>
                  <FormLabel>Plan terapéutico / indicaciones</FormLabel>
                  <FormControl><Textarea placeholder="Indicaciones, cambios de tratamiento…" className="resize-y" {...field} value={field.value || ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="observaciones" render={({ field }) => (
                <FormItem>
                  <FormLabel>Observaciones adicionales</FormLabel>
                  <FormControl><Textarea placeholder="Notas complementarias…" className="resize-y" {...field} value={field.value || ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </div>

          {/* ── Sección 6: Seguimiento ── */}
          <div>
            <SectionHeader icon={CalendarClock} label="Seguimiento" />
            <div className="flex flex-wrap items-end gap-3 max-w-md">
              <FormItem className="flex-1 min-w-[200px]">
                <FormLabel>Fecha del próximo turno</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    min={todayStr}
                    value={proximoFecha}
                    onChange={(e) => setProximoFecha(e.target.value)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>

              {proximoFecha && (
                <FormItem className="w-[120px]">
                  <FormLabel>Hora sugerida</FormLabel>
                  <FormControl>
                    <Input
                      type="time"
                      value={proximoHora}
                      onChange={(e) => setProximoHora(e.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Si seleccionás una fecha, se creará automáticamente un turno pendiente en la agenda. La hora por defecto es 09:00.
            </p>
          </div>

          {/* ── Acciones ── */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/60">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
              className="gap-2"
            >
              <X className="h-4 w-4" />
              Cancelar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => submitWithEstado('borrador')}
              disabled={isSubmitting}
              className="gap-2"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar borrador
            </Button>
            <Button
              type="button"
              onClick={() => setShowFinalizar(true)}
              disabled={isSubmitting}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
            >
              <CheckCircle2 className="h-4 w-4" />
              Finalizar consulta
            </Button>
          </div>
        </form>
      </Form>

      <FinalizarDialog
        open={showFinalizar}
        onOpenChange={setShowFinalizar}
        onConfirm={() => submitWithEstado('finalizada')}
        isLoading={isSubmitting}
      />
    </>
  )
}

// ── Componente principal ──────────────────────────────────────

export function ConsultaDetail({
  mode, consulta, pacienteId, onSaved, onCancel,
}: ConsultaDetailProps) {
  if (mode === 'view' && consulta) {
    return (
      <ConsultaReadOnly consulta={consulta} />
    )
  }

  return (
    <ConsultaForm
      mode={mode}
      consulta={consulta}
      pacienteId={pacienteId}
      onSaved={onSaved}
      onCancel={onCancel}
    />
  )
}
