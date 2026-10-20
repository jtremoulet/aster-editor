/** Variables injectées par `vitest.shared.ts` via `define`. Disponibles uniquement dans les tests. */
interface ImportMetaEnv {
  /** Chemin absolu du dossier `fixtures/` racine, avec séparateur final. */
  readonly ASTER_FIXTURES: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
