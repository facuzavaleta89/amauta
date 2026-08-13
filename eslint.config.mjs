import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Plantillas de PDF (@react-pdf/renderer): su <Image> NO es next/image ni un
  // <img> del DOM — renderiza a un PDF, que no tiene árbol de accesibilidad HTML,
  // y sus props (ImageProps) NO incluyen `alt` (agregarla rompe el chequeo de
  // tipos). jsx-a11y/alt-text matchea por nombre de componente, así que acá es un
  // falso positivo. Se apaga SOLO en esta carpeta.
  {
    files: ["src/lib/pdf/**"],
    rules: {
      "jsx-a11y/alt-text": "off",
    },
  },
  // Variables/argumentos intencionalmente no usados. Tres opciones, tres motivos:
  //
  // · `ignoreRestSiblings` — descartar una propiedad al desestructurar
  //   (`const { paciente_id: _pid, ...updates } = data`) es un patrón legítimo: la
  //   variable existe solo para EXCLUIR ese campo del rest, no para usarse.
  //
  // · `argsIgnorePattern` / `varsIgnorePattern` (`^_`) — convención de prefijo `_`,
  //   adoptada formalmente. Marca "esto no se usa, y es a propósito": firmas impuestas
  //   desde afuera (el `request` de un Route Handler que no se lee, el `_prevState` que
  //   exige `useActionState`) y placeholders posicionales en callbacks (`.map((_, i) =>`).
  //   ⚠ Es PREVENTIVA, no correctiva: al adoptarla no silenció ni un solo warning —el
  //   default `args: 'after-used'` ya no reportaba ninguno de esos casos, porque todos
  //   preceden a un parámetro que sí se usa. Sirve para que el prefijo signifique algo
  //   cuando aparezca en posición final.
  //   ⚠ El costo, asumido: de acá en más CUALQUIER identificador que empiece con `_`
  //   deja de reportarse. Renombrar un unused legítimo a `_algo` en vez de borrarlo
  //   ahora deja al linter mudo.
  //
  // Alcance acotado a propósito: eslint-config-next declara la regla como 'warn' SIN
  // opciones (dist/typescript.js), así que replicamos ese nivel y solo agregamos estas
  // tres; el resto (`args: 'after-used'`, `caughtErrors: 'all'`, `vars: 'all'`) queda en
  // los defaults de la regla, que mergea opciones parciales sobre ellos.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", {
        ignoreRestSiblings: true,
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
