/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONTACTS_CANISTER_ID?: string
  readonly VITE_ICP_LOCAL_PORT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
