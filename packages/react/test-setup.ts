/// <reference types="node" />

import "fake-indexeddb/auto"
import "@testing-library/jest-dom/vitest"
import { TextEncoder, TextDecoder } from "util"

globalThis.TextEncoder = TextEncoder
globalThis.TextDecoder = TextDecoder as any

// The jsdom build used here exposes `localStorage` as a bare object without the
// Storage methods. `@icp-sdk/auth` caches the delegation expiration in
// localStorage (that is what `AuthClient.isAuthenticated()` reads), so the real
// client needs a working implementation to be exercised in tests.
if (typeof globalThis.localStorage?.getItem !== "function") {
  const store = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return store.size
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  }
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  })
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "localStorage", {
      value: storage,
      configurable: true,
      writable: true,
    })
  }
}
