import type { ImportGlobFunction } from 'vite/types/importGlob.js'

// The retained source-audit test uses Vitest's glob transform. Do not import the DOM client types.
declare global {
  interface ImportMeta {
    glob: ImportGlobFunction
  }
}
