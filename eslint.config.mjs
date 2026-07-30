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
