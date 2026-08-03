# Pendiente — Realtime de mensajes no emite eventos (al 2026-08-02)

## Síntoma
El badge de la campanita/sidebar no sube en vivo cuando llega un mensaje. Supabase NO emite el evento del INSERT al suscriptor. Tras F5 el mensaje aparece (se lee de la base).

## Descartado POR EXPERIMENTO (no por deducción):
- Canal conecta: subscribe status SUBSCRIBED ✓
- Socket autenticado: el phx_join lleva access_token con role=authenticated y sub correcto ✓
- Suscripción aceptada: phx_reply status ok, con id asignado a mensajes_internos ✓
- Publicación: mensajes_internos en supabase_realtime, pubinsert=true, toggle activo ✓
- REPLICA IDENTITY: migración 032 aplicada, relreplident='f' ✓
- RLS: probada con policy permisiva USING(true) → el evento IGUAL no llega → NO es la policy
- GRANTs: idénticos a la tabla pacientes (referencia sana) ✓
- Toggle de replicación: desactivar/reactivar en dashboard, sin efecto
- Frontend: descartado — el log [RT avisos] evento mensajes_internos recibido está en la primera línea del handler y NO aparece; en el WS crudo solo hay heartbeats, ningún frame del mensaje. El evento no llega al cliente en absoluto.

## Próximos pasos a investigar (con cabeza fresca):
1. Cómo se INSERTA el mensaje (src/app/(app)/mensajes/actions.ts, enviarMensaje): confirmar que el INSERT pega en public.mensajes_internos por la vía normal y commitea. PRIMER SOSPECHOSO.
2. Logs del servicio Realtime en el dashboard: Logs → Realtime, ver si registra el cambio.
3. Estado del replication slot / salud del servicio Realtime del proyecto.
4. Si todo lo anterior está bien: consulta a soporte de Supabase.

## Estado del código:
- Fix del badge que SÍ baja al leer (síntoma 2) aplicado y commiteado (a286ab9).
- Instrumentación [RT avisos] REMOVIDA de notificaciones-bell.tsx al diferir la tanda (el canal quedó como antes de instrumentar: `channel.subscribe()` sin callback). Al retomar el diagnóstico hay que REINSTRUMENTAR: volver a poner los logs de estado del subscribe (callback en `channel.subscribe((status, err) => …)`) y los de evento recibido en los handlers de mensajes_internos y solicitudes_asistente.
- Migración 032 (REPLICA IDENTITY FULL) aplicada a la base y versionada, pendiente de merge.
