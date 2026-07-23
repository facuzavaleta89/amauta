# RESPUESTA — Documentación de la tanda de persistencia de PDFs

> Solo documentación. **No toqué `src/` ni `supabase/migrations/`.** No ejecuté nada
> contra Supabase. Verifiqué cada afirmación contra el código/migraciones reales.
> Fecha: 2026-07-23 · Rama: `main`.

---

## Qué actualicé en cada documento

### `schema.sql`
- **Encabezado:** rango de migraciones `001→026` → **`001→028`**; agregué el resumen de la
  **027** (bucket `documentos`, 3 políticas, sin DELETE) y la **028** (`emisor_snapshot`).
- **Tabla `pedidos` y `certificados`:** agregué la columna **`emisor_snapshot JSONB`** con el
  shape documentado inline, y aclaré que `pdf_path` apunta al bucket `documentos` (mig. 027).
- **Sección STORAGE:** renombré el bloque a "buckets `estudios` (026) y `documentos` (027)",
  y **agregué el sub-bloque `documentos`**: el `INSERT` del bucket (5 MB, solo `application/pdf`)
  y sus **3 políticas** (`documentos_objects_{select,insert,update}`) con el aislamiento por
  tenant, más el comentario explícito de que **la ausencia de DELETE es deliberada** (regla 5)
  y la nota operativa del trigger `storage.protect_delete`.

### `CLAUDE.md`
- **Modelo de datos:** filas `pedidos`/`certificados` ahora mencionan el PDF congelado en
  `documentos` (`pdf_path`) y `emisor_snapshot`.
- **Regla de negocio 5 (documentos):** el PDF se congela al emitir y es inmutable; el estado
  vive en la base (anular no toca el PDF) y se consulta por el QR; aviso al descargar revocados;
  los datos del médico salen del snapshot.
- **Regla de negocio 11 (nueva) — `emisor_snapshot`:** qué es, por qué existe, que preview y
  PDF leen de ahí, que es obligatorio al emitir (vs. PDF best-effort), qué pasa si falta (bug
  visible, sin caer a `profiles`), sin backfill, y que `recetas` no la tiene.
- **Estado de desarrollo:** nuevo bloque "Tanda de Persistencia de PDFs (migraciones 027–028)"
  y actualicé la línea de **Pendiente** (ya no falta `documentos`; solo `difusion`).
- **Notas técnicas 10 y 11 (nuevas):** migraciones 027–028 + aprendizaje del trigger
  `storage.protect_delete`; y `NEXT_PUBLIC_SITE_URL` como requerida en producción con el porqué.

### `PENDIENTES.md`
- **Bloque A:** cerré el ítem de **persistencia de PDFs** (✅ RESUELTO), incluyendo el problema
  de la **"firma viva"**. Agregué el ✅ RESUELTO del **incumplimiento de la regla 9** en los POST
  (chequeo de `archivado_at` → 409). Reduje el ítem de buckets a que **solo falta `difusion`**.
  Agregué el pendiente de que **`recetas` necesitará su `emisor_snapshot`** cuando se habilite.
- **Bloque B (Storage):** agregué el ✅ RESUELTO para `documentos` (migración 027) con el detalle
  de las 3 políticas y la ausencia deliberada de DELETE; el "pendiente" quedó solo en `difusion`.

### `README.md`
- Rango de migraciones `001 → 026` → **`001 → 028`**.
- Nota de buckets: `estudios` (026) y `documentos` (027) se crean por migración; solo `difusion`
  no existe.
- Tabla de variables de entorno: agregué **`NEXT_PUBLIC_SITE_URL`** como ✅ requerida, con la
  explicación (QR de verificación; con PDFs congelados no puede derivarse del `Host`).

### `DESIGN.md`
- En "Componentes de UI reutilizables", agregué **"Documentos — patrones visuales"**: los
  **banners de estado a lo ancho** del preview (el rojo de "anulado" preexistente y el nuevo
  **ámbar de "sin datos del emisor"** con `AlertCircle`), y el **`alert-dialog` de confirmación**
  al descargar un documento revocado. Marqué que los ámbar/rojo son clases crudas (mismo
  pendiente de tokens `success/warning/info` ya listado en Inconsistencias).

---

## Cómo verifiqué (no documenté nada a ciegas)

- Leí las tablas `pedidos`/`certificados` y la sección STORAGE reales de `schema.sql` antes de
  editar; las 3 políticas de `documentos` las transcribí con el mismo patrón que las de
  `estudios` ya presentes, coherentes con lo ejecutado en la 027.
- Confirmé en `025_seguridad_datos_sensibles.sql` que el DELETE de `pedidos`/`certificados`
  está dropeado (sostiene "los documentos no se borran").
- El banner ámbar (`bg-amber-50 dark:bg-amber-950/20`, `text-amber-800/200`, ícono
  `AlertCircle`) y el diálogo de descarga de revocados los describí a partir del código que
  quedó en `pedido-pdf.tsx`/`certificado-pdf.tsx`.
- La ruta `{medico_id}/{tipo}/{documento_id}.pdf` y el shape del snapshot coinciden con
  `buildDocumentoPath` y `EmisorSnapshot` del código.
- Numeración: reglas de negocio y notas técnicas de `CLAUDE.md` quedaron ambas 1→11 sin
  colisiones (verificado con grep).

---

## Inconsistencias encontradas entre documentación y código

1. **`PENDIENTES.md` — desajuste `Certificado.tipo` (Bloque A, ~línea 61):** el pendiente dice
   que `src/types/pedido.ts` tipa `Certificado.tipo` como no-nullable mientras la base lo hizo
   nullable (mig. 017). Sigue **vigente**: en el código actual `Certificado.tipo` es
   `CertificadoTipo` (no `| null`). No lo toqué (fuera del alcance de esta tanda), lo dejo
   señalado. Nota: mientras trabajaba en `types/pedido.ts` la tanda anterior, no se corrigió
   este punto — sigue como deuda.
2. **`DESIGN.md` — `shared/qr-verificacion.tsx` "deriva la URL base con `headers()`"
   (~línea 127):** sigue siendo cierto para **ese** Server Component (la card de QR de la página
   de detalle no cambió). Pero conviene tener presente que la **generación del PDF/documento**
   ahora usa `getBaseUrl` con prioridad a `NEXT_PUBLIC_SITE_URL` (no `headers()`). No es una
   contradicción —son dos caminos distintos— pero si en el futuro se unifican, el QR de esa card
   debería migrar también a `NEXT_PUBLIC_SITE_URL`. Lo dejo anotado, no lo edité.
3. **Ninguna afirmación obsoleta quedó en pie** sobre "`documentos` no existe" ni sobre el rango
   `001→026`: barrí los cinco documentos con grep y están todos actualizados.

Nada de esto bloquea la tanda; son señalamientos para futuras iteraciones.
