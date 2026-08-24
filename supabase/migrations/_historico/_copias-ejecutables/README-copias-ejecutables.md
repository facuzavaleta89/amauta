# `_copias-ejecutables/` — las copias que se pegaban en el SQL Editor

Estos 26 archivos vivían **en la raíz del repositorio** como `MIGRACION-*.sql`. Se movieron
acá el 2026-08-23.

## Qué son

**Copias de una migración, preparadas para pegar en el SQL Editor de Supabase.** Nueve de
ellos lo dicen en su primera línea:

```sql
-- Copia ejecutable de supabase/migrations/0NN_….sql — pegar en el SQL Editor de Supabase
-- y correr UNA sola vez.
```

Eran una pieza del flujo de trabajo del proyecto, que `PENDIENTES.md` describía así:
*"versionada en `supabase/migrations/` + suelta `MIGRACION-NN-…` en la raíz, **ejecución
manual** en el SQL Editor y verificación contra la base real"*. Cada migración se escribía
versionada, se copiaba a la raíz, se pegaba a mano en el dashboard y se verificaba.

Cada uno mapea **1:1** con una migración del directorio de arriba:

| copia | migración |
|---|---|
| `MIGRACION-P2.sql` · `P4` · `P5` | `022` · `023` · `024` |
| `MIGRACION-01` … `MIGRACION-23` | `025` … `047` (correlativas) |

## Por qué ya no se usan

**El flujo cambió.** Desde que existe `supabase/migrations/000_baseline.sql`, un entorno
nuevo se levanta con el baseline, y una migración nueva (`048` en adelante) se aplica desde
`supabase/migrations/`. La copia intermedia en la raíz **ya no cumple ninguna función**.

## Por qué se conservan y NO se borran

**No son duplicados exactos.** Comparadas contra su migración:

- **14** son **byte-idénticas**.
- **11** difieren **solo en comentarios** — el SQL ejecutable es idéntico. Traen redacción
  *operativa* que la versionada no tiene: qué mirar antes de correr, qué esperar después.
- **1 difiere en el SQL**: `MIGRACION-08-replica-identity-mensajes.sql` trae **tres líneas de
  más** que la `032`, una consulta de verificación de solo lectura
  (`SELECT relname, relreplident FROM pg_class WHERE relname = 'mensajes_internos'`).

O sea que son **contexto de cómo se aplicó cada migración**, no de qué se aplicó. Eso no está
en ningún otro lado.

> ⚠ **No los edites, no los borres y no los renombres.** Vale lo mismo que para las
> migraciones del directorio de arriba.

## Lo que NO está acá

`LIMPIEZA-documentos-prueba.sql` **se queda en la raíz del repo**, a propósito. No es copia de
ninguna migración: es un script destructivo de un solo uso (borró los 19 documentos de prueba
al introducir `emisor_snapshot`), ya ejecutado, y `CLAUDE.md` documenta su ubicación fuera de
`supabase/migrations/` como deliberada.
