'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { PermisosProvider, MensajesProvider } from '@/contexts/permisos-context'
import type { UserRole, PermisosAsistente } from '@/types/roles'
import type { MensajeNoLeido } from '@/types/mensaje'
import type { ItemPendiente } from '@/types/notificacion'
import { createClient } from '@/lib/supabase/client'

interface Solicitud {
  id: string
  solicitante_nombre: string
  solicitante_email: string
  mensaje: string | null
  created_at: string
}

interface LayoutShellProps {
  userFullName: string
  userRole: UserRole
  userEmail: string
  userId: string
  medicoId: string | null
  userTitulo: string | null
  permisos: PermisosAsistente | null
  solicitudesPendientes: Solicitud[]
  mensajesNoLeidos: number
  mensajesIniciales: MensajeNoLeido[]
  /** Avisos del sistema sin leer (solo médico) — tercer sumando del badge */
  notificacionesSistema: ItemPendiente[]
  children: React.ReactNode
}

export function LayoutShell({
  userFullName,
  userRole,
  userEmail,
  userId,
  medicoId,
  userTitulo,
  permisos,
  solicitudesPendientes,
  mensajesNoLeidos,
  mensajesIniciales,
  notificacionesSistema,
  children,
}: LayoutShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const router = useRouter()

  const handleClose = useCallback(() => setSidebarOpen(false), [])
  const handleToggle = useCallback(() => setSidebarOpen((prev) => !prev), [])

  // Realtime: si el médico cambia los permisos del asistente,
  // refrescar la página para que el contexto se actualice.
  useEffect(() => {
    if (userRole !== 'asistente') return

    const supabase = createClient()
    const channel = supabase
      .channel(`permisos-asistente-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        () => {
          // Permisos cambiados → refrescar Server Components
          router.refresh()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, userRole, router])

  return (
    <PermisosProvider esMedico={userRole === 'medico'} permisos={permisos}>
      <MensajesProvider mensajesNoLeidos={mensajesNoLeidos}>
        <div className="flex h-dvh overflow-hidden bg-background">
          {/* ── Backdrop móvil ─────────────────────────────────────── */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
              onClick={handleClose}
              aria-hidden="true"
            />
          )}

          {/* ── Sidebar ────────────────────────────────────────────── */}
          <Sidebar
            userFullName={userFullName}
            userRole={userRole}
            userEmail={userEmail}
            userTitulo={userTitulo}
            open={sidebarOpen}
            onClose={handleClose}
          />

          {/* ── Contenido principal ────────────────────────────────── */}
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            <Header
              userFullName={userFullName}
              userRole={userRole}
              userEmail={userEmail}
              userId={userId}
              medicoId={medicoId}
              userTitulo={userTitulo}
              solicitudesPendientes={solicitudesPendientes}
              mensajesIniciales={mensajesIniciales}
              notificacionesSistema={notificacionesSistema}
              tieneAccesoMensajeria={userRole === 'medico' || (permisos?.acceso_mensajeria ?? false)}
              onMenuToggle={handleToggle}
            />
            {/*
              ⚠ ACÁ VIVE LA ALTURA DE LAS PÁGINAS DE PANTALLA COMPLETA. Antes de tocar
              una clase de estas dos líneas, leer esto entero: el turnero ya se rompió
              una vez por cambiarlas.

              El <main> NO scrollea: es un contenedor de alto DEFINIDO. El que scrollea
              es el wrapper de adentro, que tiene `h-full` (100% del alto de <main>) y
              se lleva el padding.

              Cadena de alturas, toda definida y toda colgada del `h-dvh` del shell —
              ni un `100vh`, ni un píxel de header hardcodeado:
                div.h-dvh (definida)
                  → columna `flex-1`  (item estirado de un contenedor de alto definido)
                    → <main> `flex-1 min-h-0` (post-flex de un contenedor definido)
                      → este wrapper `h-full` (porcentaje de un alto definido ⇒ definido)
                        → la página de pantalla completa `h-full`

              ⚠ POR QUÉ EL SCROLL ESTÁ ACÁ Y NO EN <main>, que es lo intuitivo:
              son los dos únicos requisitos que compiten.
                · Las páginas de pantalla completa (turnero, historia clínica) se
                  dimensionan con PORCENTAJES —`h-full`, `h-[calc(100%-3rem)]`, el
                  `height="100%"` de FullCalendar— y un porcentaje contra un contenedor
                  de alto `auto` cae a `auto`. O sea: necesitan un alto DEFINIDO, y un
                  `min-height` NO lo es (ese fue el bug: el calendario quedaba en 0).
                · Las páginas normales tienen que CRECER con su contenido sin perder el
                  padding inferior al scrollear.
              Un bloque de alto fijo no puede crecer, y uno que crece no da un alto
              definido. La salida es que el bloque de alto fijo sea además el contenedor
              de SCROLL: su padding forma parte del área scrolleable, así que el padding
              inferior se conserva aunque el contenido lo desborde (verificado: con 3000px
              de contenido, `scrollHeight` = 3000 + 48 de padding).

              ⚠ El wrapper es un BLOQUE, no un contenedor flex. Eso es deliberado:
                · las páginas normales se apilan como bloques y ocupan el ancho
                  disponible sin necesidad de `w-full`;
                · las acotadas (`max-w-4xl`) quedan alineadas a la IZQUIERDA sin
                  `mx-auto`, que es el criterio de ancho vigente: el título tiene que
                  caer siempre en la misma coordenada al cambiar de sección.
              Si alguna vez se le pone `flex` acá, las páginas con `max-w-*` dejan de
              estirarse (un flex item no se estira si tiene márgenes `auto` en el eje
              transversal) y las de pantalla completa dejan de andar con `h-full`.
            */}
            <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="h-full overflow-y-auto scrollbar-thin p-3 sm:p-4 md:p-6 animate-fade-in">
                {children}
              </div>
            </main>
          </div>
        </div>
      </MensajesProvider>
    </PermisosProvider>
  )
}

