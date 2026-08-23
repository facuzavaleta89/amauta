# `_historico/` — las 49 migraciones originales del proyecto

Estos 49 archivos son el **registro de las decisiones del proyecto**, desde la creación
del esquema (`001_pacientes.sql`, mayo 2026) hasta el último cambio aplicado
(`047_mensajes_ultima_actividad.sql`, 2026-08-21).

> ⚠ **No los borres, no los edites y no los renombres.** Se siguen consultando: casi todos
> traen en su encabezado el *por qué* de un cambio —qué bug cerraban, qué alternativa se
> descartó y con qué argumento—, y eso no está en ningún otro lado. `CLAUDE.md` y
> `PENDIENTES.md` los referencian por número docenas de veces.

---

## Por qué NO son ejecutables como secuencia

**La secuencia se corta en la migración `013_fortify_security_rls.sql`.** Sobre una base
vacía, esa migración falla en su primer statement sobre `consultas`:

```sql
-- 013_fortify_security_rls.sql
ALTER TABLE public.consultas ENABLE ROW LEVEL SECURITY;
```

…porque **la tabla `consultas` todavía no existe**: recién se crea en
`030_objetos_huerfanos.sql`. Lo mismo pasa con `notificaciones`.

Las dos tablas fueron creadas **a mano en producción**, sin migración, y la `030` las
versionó *a posteriori* — o sea que el archivo que las crea está **17 posiciones después**
del primero que las usa.

**Seis migraciones referencian esas dos tablas antes de la `030`:**

| migración | qué hace con ellas |
|---|---|
| `013_fortify_security_rls.sql` | `ALTER TABLE … ENABLE RLS` + 4 políticas sobre `consultas` ← **acá se corta** |
| `014_security_fixes.sql` | reescribe `consultas_update` y `consultas_delete` |
| `015_permisos_granulares.sql` | reescribe las políticas de `consultas` con los 12 permisos |
| `022_consultas_campos_extra.sql` | agrega la columna `campos_extra` |
| `025_seguridad_datos_sensibles.sql` | dropea dos políticas huérfanas de `consultas` |
| `029_fix_drift_rls.sql` | migra el trigger `consultas_updated_at` y toca `notificaciones` |

### Y hay dos problemas más, independientes del anterior

**`034` y `043` dropean constraints por nombre autogenerado y sin `IF EXISTS`:**

```sql
-- 034_solicitudes_unique_parcial.sql
ALTER TABLE public.solicitudes_asistente
  DROP CONSTRAINT solicitudes_asistente_solicitante_id_medico_id_key;

-- 043_dni_paciente_unico_por_medico.sql
ALTER TABLE public.pacientes
  DROP CONSTRAINT pacientes_dni_key;
```

Esos dos nombres los eligió Postgres al crear las constraints, no el proyecto. Si en un
entorno nuevo Postgres bautizara distinto —o si la constraint ya no estuviera—, el
statement **aborta** en vez de seguir de largo. El baseline cierra esto de raíz: **todas
sus constraints llevan nombre explícito.**

**Y hay cambios hechos a mano sobre la base que ninguna migración registra**, así que
correr la secuencia entera —aun si corriera— **no produciría el esquema de producción**:

1. **Una fila de catálogo borrada.** La `045` eliminó `'Particular / Sin obra social'` de
   `obras_sociales` (decisión de producto: es ausencia de dato, no una cobertura). El id
   13 quedó hueco. *(Ésta sí está versionada; se lista porque es la fila que el baseline
   deliberadamente **no** inserta.)*
2. **Un episodio de RLS editada hacia versiones más permisivas.** Detectado y corregido
   por la `029`: entre otras cosas, un asistente podía **borrar historias clínicas** que
   la Ley 26.529 obliga a conservar.
3. **Cuatro políticas movidas a `authenticated` a mano** — `evoluciones_insert`,
   `difusion_insert`, `difusion_update`, `difusion_delete`. Nacieron sin cláusula `TO`
   (migraciones `004` y `008`), o sea en `{public}`; hoy están en `authenticated` en la
   base viva, y **la `042` las salteó explícitamente porque al escribirla ya estaban
   normalizadas** (su encabezado lo dice: "4 que se normalizaron A MANO, fuera de toda
   migración, y que solo se descubren mirando la base"). **Un entorno construido con estas
   migraciones las dejaría alcanzables por el rol `anon`.**
4. **Un DEFAULT no re-emitible.** `recetas.fecha_vencimiento` tiene en la base un default
   `(fecha_receta + '30 days'::interval)` —una referencia a **otra columna**, que Postgres
   no permite crear por DDL— y la `009` crea esa columna **sin default alguno**. Ver el
   bloque que lo explica en el baseline.

**Además, la base no tiene tabla de historial de migraciones:** el esquema
`supabase_migrations` **no existe** (verificado en `pg_namespace`), y
`supabase migration list` devuelve vacío. No hay estado que reconciliar ni marcas que
respetar — otra razón por la que el corte limpio era posible.

---

## Cuál es el punto de partida ahora

**`supabase/migrations/000_baseline.sql`.**

Es un archivo único, **generado leyendo la base viva** (no transcribiendo estas
migraciones), que sobre un proyecto Supabase nuevo y vacío produce el esquema que hoy
tiene producción: 21 tablas, 4 tipos ENUM, 12 funciones, 15 triggers, 72 políticas RLS,
78 índices, 2 buckets de Storage y el catálogo `obras_sociales`.

- Se llama `000` para que **ordene antes que todo este historial** y no colisione con la `001`.
- **No se aplica a producción**: producción ya tiene ese esquema. Existe para entornos nuevos.
- Fija en `authenticated` las cuatro políticas del punto 3, con el comentario que explica
  por qué ninguna migración las puso ahí.

---

## Cómo numerar de acá en adelante

**Las migraciones nuevas siguen numerando a partir de la última: la próxima es `048`.**
No se reinicia la numeración ni se renumera nada. Van en `supabase/migrations/`, al lado
del baseline — no acá adentro.

El orden efectivo para un entorno nuevo es: `000_baseline.sql`, después `048`, `049`, etc.
