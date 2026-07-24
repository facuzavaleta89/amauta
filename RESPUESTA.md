# RESPUESTA — Alineación de la migración 030 con los índices reales

> Corrección de archivos de migración + documentación. **No toqué `src/`**, ni ninguna otra
> migración además de la 030 y su copia suelta. No ejecuté nada contra Supabase.
> No cambié nada más del contenido de la 030 (tipos, constraints, columnas y políticas
> quedaron intactos).
> Fecha: 2026-07-24 · Rama: `main`.

---

## Qué corregí exactamente

### `supabase/migrations/030_objetos_huerfanos.sql` (+ su copia `MIGRACION-06-huerfanos.sql`)

**1. Índices de `consultas` — eran 2 con nombres equivocados, ahora son 3 con los reales**

```diff
-CREATE INDEX IF NOT EXISTS idx_consultas_paciente ON public.consultas(paciente_id);
-CREATE INDEX IF NOT EXISTS idx_consultas_medico   ON public.consultas(medico_id);
+-- Índices con los nombres y definiciones REALES de la base (ver nota del encabezado).
+CREATE INDEX IF NOT EXISTS consultas_paciente_id_idx ON public.consultas USING btree (paciente_id);
+CREATE INDEX IF NOT EXISTS consultas_medico_id_idx   ON public.consultas USING btree (medico_id);
+CREATE INDEX IF NOT EXISTS consultas_fecha_hora_idx  ON public.consultas USING btree (fecha_hora DESC);
```

**2. Índices de `notificaciones` — el comentario decía que no tenía; ahora crea los 3**

Quité la afirmación falsa del encabezado del bloque:
```diff
--- enviado). medico_id = tenant. Sin índices (la auditoría no encontró ninguno; ver
---- RESPUESTA.md → sugerencia, NO agregada acá).
+-- enviado). medico_id = tenant. Tiene 3 índices (ver más abajo).
```

Y agregué los índices justo después del `ENABLE ROW LEVEL SECURITY`, como pediste:
```sql
CREATE INDEX IF NOT EXISTS idx_notificaciones_medico  ON public.notificaciones USING btree (medico_id);
CREATE INDEX IF NOT EXISTS idx_notificaciones_leida   ON public.notificaciones USING btree (medico_id, leida);
CREATE INDEX IF NOT EXISTS idx_notificaciones_created ON public.notificaciones USING btree (created_at DESC);
```

**3. Nota nueva en el encabezado** dejando constancia de que los nombres se verificaron contra
`pg_indexes` de la base real, con el listado completo de los 8 índices (los dos `*_pkey` que
crea el `PRIMARY KEY` + los 6 explícitos) y la confirmación de que no hay duplicados.

**Ubicaciones finales de los `CREATE INDEX` en el archivo:** líneas 118-120 (`consultas`) y
190-192 (`notificaciones`).

### `schema.sql`
Ya documentaba los 6 índices explícitos con los nombres correctos (los puse bien en la ronda de
documentación), así que **no había que agregar ninguno**. Pero sí quedaban **dos comentarios
obsoletos** que advertían sobre la desalineación —y que este prompt vuelve falsos—; los reemplacé:

- línea ~247: *"⚠ La migración 030 los crea con otros nombres … y no crea el de fecha_hora"*
- línea ~573: *"⚠ La migración 030 NO los crea"*

Ambos ahora dicen: *"Índices verificados contra pg_indexes de la base real; la migración 030 los
crea con estos mismos nombres y definiciones."*

### `PENDIENTES.md`
El pendiente **"⚠ Desalineación 030 ↔ base en ÍNDICES (verificar)"** pasó a
**✅ RESUELTO (2026-07-24)**, siguiendo el formato del documento (el resto de los ítems cerrados
usan el mismo prefijo `✅ RESUELTO (fecha) — …`). El texto explica qué pasó (el archivo quedó con
una versión previa porque se ejecutó la corregida a mano), qué se alineó, y deja registrado que
**la base no tiene duplicados**: son exactamente 8 índices.

---

## Confirmación: los dos archivos son idénticos

```
$ diff supabase/migrations/030_objetos_huerfanos.sql MIGRACION-06-huerfanos.sql
DIFF OK — idénticos

$ md5sum supabase/migrations/030_objetos_huerfanos.sql MIGRACION-06-huerfanos.sql
876898c6bb38abe1e28764dee9db4531  supabase/migrations/030_objetos_huerfanos.sql
876898c6bb38abe1e28764dee9db4531  MIGRACION-06-huerfanos.sql
```

Verificaciones adicionales que corrí:
- Los 6 `CREATE INDEX` del archivo son los esperados (grep sobre la migración).
- No queda ninguna mención al comentario falso *"Sin índices"* (grep → vacío).
- No queda ninguna referencia a los nombres viejos `idx_consultas_paciente` /
  `idx_consultas_medico` en migraciones ni en docs, salvo **una mención histórica** en
  `PENDIENTES.md` que describe justamente qué se corrigió (correcta, no obsoleta).
- No queda ninguna afirmación del tipo *"NO los crea"* / *"otros nombres"* / *"le faltarían"* en
  ningún documento (grep → vacío).

---

## ¿Otras desalineaciones entre las migraciones del repo y la base?

Revisé lo que se verificó contra la base en esta tanda. **No encontré ninguna otra desalineación
nueva.** Detalle de lo cotejado:

| Objeto verificado contra la base | Estado del archivo 030 |
|---|---|
| Tipos NUMERIC de `consultas` (7 columnas) | ✅ correctos (`talla_cm` 5,1 · `temperatura` 4,1 · los cinco metabólicos 6,2) |
| `created_at`/`updated_at` de `consultas` NULLABLE | ✅ correcto |
| `id` con `gen_random_uuid()` | ✅ correcto |
| Constraints de `consultas` (pkey, 2 fkey, estado_check) con nombres explícitos | ✅ correctos |
| Estructura y políticas de `notificaciones` (incl. la asimetría `get_medico_id()` en el INSERT) | ✅ correctas |
| 3 CHECK de `turnos` (incluido `check_paciente_id_required_for_turno_medico`) | ✅ correctos |
| Columnas de `profiles` (`titulo`, `matriculas`, `logo_url`) | ✅ correctas |
| **Índices** | ❌ era el único desalineado → **corregido en este prompt** |

**Dos cosas que quedan anotadas (ya estaban en `PENDIENTES.md`, no son nuevas):**

1. **La secuencia de migraciones sigue sin correr desde cero.** Las migraciones 013, 014, 015,
   022 y 025 referencian `public.consultas` y la tabla recién se crea en la 030. Corregir los
   índices no cambia eso; sigue requiriendo la consolidación de baseline.
2. **`20260326204733_fix_rls_recursion.sql` sigue con 0 bytes.** No lo toqué (la restricción dice
   no modificar otras migraciones). Su intención ya está cubierta por la 014 + 019/021.

**Nota metodológica, por si sirve para adelante:** este caso muestra el límite de auditar
solo con lo que devuelve una consulta puntual. Los índices de `notificaciones` existían y mi
auditoría inicial no los vio, lo que me llevó a escribir "sin índices" en la migración y hasta a
proponer agregar uno que ya existía. Para objetos huérfanos conviene cotejar siempre contra
`pg_indexes` / `pg_constraint` completos antes de escribir el `CREATE`, que es exactamente lo que
hiciste al revisar el SQL antes de ejecutarlo.
