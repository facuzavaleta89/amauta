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
  // Descartar una propiedad al desestructurar —`const { paciente_id: _pid, ...updates } = data`—
  // es un patrón legítimo: la variable existe solo para EXCLUIR ese campo del rest, no para usarse.
  // `ignoreRestSiblings` está pensado exactamente para eso.
  // Alcance acotado a propósito: eslint-config-next declara la regla como 'warn' SIN opciones
  // (dist/typescript.js), así que replicamos ese nivel y solo agregamos esta opción; el resto
  // (`args: 'after-used'`, `caughtErrors: 'all'`, `vars: 'all'`) queda en los defaults de la regla.
  // NO se agregan varsIgnorePattern/argsIgnorePattern: adoptar la convención de prefijo `_` es una
  // decisión de política de nombres y se trata aparte.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { ignoreRestSiblings: true }],
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
