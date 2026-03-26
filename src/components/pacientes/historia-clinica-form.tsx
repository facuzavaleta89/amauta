'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Save, Loader2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import { historiaSchema, type HistoriaFormData } from '@/lib/validations/historia.schema'

interface HistoriaClinicaFormProps {
  pacienteId: string
  pacienteNombre: string
  initialData?: any | null
}

export function HistoriaClinicaForm({ pacienteId, pacienteNombre, initialData }: HistoriaClinicaFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<HistoriaFormData>({
    resolver: zodResolver(historiaSchema),
    defaultValues: {
      antecedentes_patologicos: initialData?.antecedentes_patologicos || '',
      medicacion_diaria: initialData?.medicacion_diaria || '',
      habitos_toxicos: initialData?.habitos_toxicos || '',
      actividad_fisica: initialData?.actividad_fisica || '',
      actividad_laboral: initialData?.actividad_laboral || '',
      antecedentes_quirurgicos: initialData?.antecedentes_quirurgicos || '',
      clinica_actual: initialData?.clinica_actual || '',
      examen_fisico: initialData?.examen_fisico || '',
      laboratorio: initialData?.laboratorio || '',
      estudios_complementarios: initialData?.estudios_complementarios || '',
      conducta: initialData?.conducta || '',
      proximo_control: initialData?.proximo_control || '',
      peso_inicial: initialData?.peso_inicial ?? '',
      talla: initialData?.talla ?? '',
      perimetro_cintura: initialData?.perimetro_cintura ?? '',
    },
  })

  async function onSubmit(data: HistoriaFormData) {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/pacientes/${pacienteId}/historia`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        throw new Error('Error al guardar la historia clínica')
      }

      toast.success('Historia clínica guardada exitosamente')
      router.refresh()
      router.push(`/pacientes/${pacienteId}`)
    } catch (error) {
      toast.error('Ocurrió un error al guardar')
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon" className="rounded-full">
            <Link href={`/pacientes/${pacienteId}`}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Historia Clínica</h1>
            <p className="text-muted-foreground">Paciente: {pacienteNombre}</p>
          </div>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Antecedentes</CardTitle>
                <CardDescription>Información médica de base y factores de riesgo.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="antecedentes_patologicos"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Antecedentes Patológicos</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Enfermedades preexistentes, alergias..." className="resize-y" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="medicacion_diaria"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Medicación Diaria</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Medicamentos actuales..." className="resize-y" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="antecedentes_quirurgicos"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Antecedentes Quirúrgicos</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Cirugías previas..." className="resize-y" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="habitos_toxicos"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estilo de Vida y Hábitos</FormLabel>
                        <FormControl>
                          <Input placeholder="Tabaco, alcohol..." {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="actividad_fisica"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Actividad Física</FormLabel>
                        <FormControl>
                          <Input placeholder="Deportes, frecuencia..." {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="actividad_laboral"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Actividad Laboral</FormLabel>
                        <FormControl>
                          <Input placeholder="Ocupación, estrés..." {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Mediciones Físicas Iniciales</CardTitle>
                <CardDescription>Datos base de biometría para referencias futuras.</CardDescription>
              </CardHeader>
              <CardContent>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="peso_inicial"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Peso (kg)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.1" placeholder="Ej. 70.5" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="talla"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Talla (cm)</FormLabel>
                        <FormControl>
                          <Input type="number" step="1" placeholder="Ej. 175" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="perimetro_cintura"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cintura (cm)</FormLabel>
                        <FormControl>
                          <Input type="number" step="1" placeholder="Ej. 90" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Evolución / Consulta Actual</CardTitle>
                <CardDescription>Información del estado del paciente y conducta.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="clinica_actual"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Motivo de Consulta / Clínica Actual</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Razones por las que asiste hoy..." className="h-24" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="examen_fisico"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Examen Físico</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Hallazgos..." className="resize-y" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="laboratorio"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Laboratorio</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Resultados relevantes..." className="resize-y" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="estudios_complementarios"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estudios Complementarios</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Imágenes, ecografías..." className="resize-y" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="conducta"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Conducta Médica / Plan</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Tratamiento a seguir..." className="resize-y" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="proximo_control"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Próximo Control (Opcional)</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" type="button" onClick={() => router.back()} disabled={isLoading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading} className="gap-2">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar Historia
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
