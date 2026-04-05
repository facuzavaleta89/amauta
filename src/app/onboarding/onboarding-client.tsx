'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { buscarMedicos, enviarSolicitud } from './actions'
import { CheckCircle2, Clock, XCircle, Search, Send, UserCheck, Stethoscope, Loader2, AlertCircle, Mail } from 'lucide-react'
import { logout } from '@/app/(auth)/actions'

interface SolicitudActual {
  id: string
  estado: string
  medico_nombre: string
  medico_email: string
  created_at: string
  respondido_at: string | null
}

interface MedicoResult {
  id: string
  full_name: string
  email: string
}

interface Props {
  userName: string
  solicitudActual: SolicitudActual | null
}

export function OnboardingClient({ userName, solicitudActual }: Props) {
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState<MedicoResult[]>([])
  const [busquedaError, setBusquedaError] = useState<string | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [medicoSeleccionado, setMedicoSeleccionado] = useState<MedicoResult | null>(null)
  const [mensaje, setMensaje] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [enviada, setEnviada] = useState(false)
  const [solicitud, setSolicitud] = useState<SolicitudActual | null>(solicitudActual)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce de búsqueda
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < 3) { setResultados([]); setBusquedaError(null); return }

    debounceRef.current = setTimeout(async () => {
      setBuscando(true)
      setBusquedaError(null)
      const { data, error } = await buscarMedicos(query)
      setResultados(data ?? [])
      if (error) setBusquedaError(error)
      setBuscando(false)
    }, 500)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  function handleSeleccionar(medico: MedicoResult) {
    setMedicoSeleccionado(medico)
    setQuery('')
    setResultados([])
  }

  function handleEnviar() {
    if (!medicoSeleccionado) return
    setErrorMsg(null)
    startTransition(async () => {
      const { error } = await enviarSolicitud(medicoSeleccionado.id, mensaje)
      if (error) {
        setErrorMsg(error)
      } else {
        setEnviada(true)
        setSolicitud({
          id: '',
          estado: 'pendiente',
          medico_nombre: medicoSeleccionado.full_name,
          medico_email: medicoSeleccionado.email,
          created_at: new Date().toISOString(),
          respondido_at: null,
        })
      }
    })
  }

  const primerNombre = userName.split(' ')[0]

  // ── Estado: rechazada ──────────────────────────────────────
  if (solicitud?.estado === 'rechazada') {
    return (
      <div className="w-full max-w-md">
        <div className="bg-card border border-border rounded-2xl shadow-xl p-8 text-center space-y-5">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Solicitud rechazada</h1>
            <p className="text-sm text-muted-foreground mt-2">
              <strong>{solicitud.medico_nombre}</strong> no aceptó tu solicitud de vinculación.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Podés intentar con otro médico o contactarlo directamente para coordinar.
          </p>
          <button
            onClick={() => setSolicitud(null)}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Buscar otro médico
          </button>
          <button
            onClick={() => logout()}
            className="w-full py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    )
  }

  // ── Estado: pendiente (ya enviada) ─────────────────────────
  if (solicitud?.estado === 'pendiente' || enviada) {
    return (
      <div className="w-full max-w-md">
        <div className="bg-card border border-border rounded-2xl shadow-xl p-8 text-center space-y-5">
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Clock className="h-8 w-8 text-amber-500" />
              </div>
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500" />
              </span>
            </div>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Esperando aprobación</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Tu solicitud fue enviada a
            </p>
          </div>
          <div className="bg-muted/50 rounded-xl p-4 text-left space-y-1">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium text-foreground">{solicitud?.medico_nombre}</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">{solicitud?.medico_email}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Cuando el médico apruebe tu solicitud, podrás acceder al sistema automáticamente. Podés cerrar esta ventana y volver más tarde.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Verificar estado
          </button>
          <button
            onClick={() => logout()}
            className="w-full py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    )
  }

  // ── Flujo principal ────────────────────────────────────────
  return (
    <div className="w-full max-w-lg">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
          <Stethoscope className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Hola, {primerNombre}</h1>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Para acceder al sistema necesitás vincularte con el médico con quien trabajás.
          Buscalo por nombre o email y enviá tu solicitud.
        </p>
      </div>

      <div className="bg-card border border-border rounded-2xl shadow-xl p-6 space-y-5">

        {/* Paso 1: Buscar */}
        {!medicoSeleccionado && (
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">
              Buscar médico
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nombre o email del médico..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
              />
              {buscando && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
              )}
            </div>

            {/* Resultados */}
            {resultados.length > 0 && (
              <div className="border border-border rounded-xl overflow-hidden">
                {resultados.map((medico, i) => (
                  <button
                    key={medico.id}
                    onClick={() => handleSeleccionar(medico)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted transition-colors ${
                      i > 0 ? 'border-t border-border' : ''
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-primary text-sm font-semibold">
                        {medico.full_name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{medico.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{medico.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {query.trim().length >= 3 && !buscando && resultados.length === 0 && (
              <p className={`text-xs text-center py-2 ${busquedaError ? 'text-destructive' : 'text-muted-foreground'}`}>
                {busquedaError ?? 'No se encontraron médicos con ese nombre o email.'}
              </p>
            )}
          </div>
        )}

        {/* Paso 2: Confirmar médico seleccionado */}
        {medicoSeleccionado && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Médico seleccionado</label>
              <button
                onClick={() => { setMedicoSeleccionado(null); setMensaje('') }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cambiar
              </button>
            </div>

            <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl p-4">
              <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <span className="text-primary text-sm font-bold">
                  {medicoSeleccionado.full_name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{medicoSeleccionado.full_name}</p>
                <p className="text-xs text-muted-foreground">{medicoSeleccionado.email}</p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-primary ml-auto shrink-0" />
            </div>

            {/* Mensaje opcional */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Mensaje <span className="text-muted-foreground font-normal">(opcional)</span>
              </label>
              <textarea
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                placeholder="Presentate brevemente al médico..."
                rows={3}
                maxLength={300}
                className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground resize-none"
              />
              <p className="text-xs text-muted-foreground text-right">{mensaje.length}/300</p>
            </div>

            {/* Error */}
            {errorMsg && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/8 border border-destructive/20 rounded-xl px-3 py-2.5">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {errorMsg}
              </div>
            )}

            {/* Botón enviar */}
            <button
              onClick={handleEnviar}
              disabled={isPending}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</>
              ) : (
                <><Send className="h-4 w-4" /> Enviar solicitud</>
              )}
            </button>
          </div>
        )}

        {/* Ayuda */}
        <p className="text-xs text-muted-foreground text-center pt-1">
          ¿Problemas para encontrar al médico?{' '}
          <span className="text-foreground">Pedile que comparta su email de registro.</span>
        </p>
      </div>

      {/* Footer */}
      <div className="text-center mt-6">
        <button
          onClick={() => logout()}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
