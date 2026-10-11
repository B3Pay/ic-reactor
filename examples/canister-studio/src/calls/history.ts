// STUB (FOUNDATION): the types and signatures are the contract; B3 implements.
import type { MethodMode } from "@candid-core/schema"

/** One call, as the per-tab history keeps it (localStorage). */
export interface HistoryEntry {
  id: string
  /** When the call settled (ms since the epoch). */
  at: number
  canisterId: string
  canisterName: string
  method: string
  mode: MethodMode
  /** The caller's principal text. */
  caller: string
  /** The encoded argument bytes as hex (never JSON). */
  argsHex: string
  outcome: "ok" | "canister_err" | "error"
  /** The ReactorError kind, for an error. */
  kind?: string
  mayHaveExecuted?: boolean
  summary: string
}

/** The tab's call history. Browser only: empty during SSR and hydration. */
export function useCallHistory(): {
  entries: HistoryEntry[]
  add(e: HistoryEntry): void
  clear(): void
} {
  return { entries: [], add: () => {}, clear: () => {} }
}
