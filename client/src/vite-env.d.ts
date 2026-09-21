/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set for static builds; points at exported JSON instead of the live server */
  readonly VITE_DATA_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
