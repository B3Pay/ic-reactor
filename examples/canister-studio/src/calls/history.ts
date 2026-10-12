import type { MethodMode } from "@candid-core/schema"
import { useSyncExternalStore } from "react"
import { fromHex } from "../lib/hex.ts"

/** One call, as the history keeps it (localStorage, shared by the browser's tabs). */
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
  /** "sent": a oneway call went out; it has no reply and no outcome. */
  outcome: "ok" | "sent" | "canister_err" | "error"
  /** The ReactorError kind, for an error. */
  kind?: string
  mayHaveExecuted?: boolean
  summary: string
}

/**
 * Where the history lives. Versioned: a later shape gets a new key rather
 * than misreading this one.
 */
export const HISTORY_STORAGE_KEY = "canister-studio:history:v1"

/** The newest entries kept; older ones are dropped. */
export const HISTORY_LIMIT = 200

// Storage holds text anyone with the browser can edit, so every entry read
// back is checked field by field, and a summary is cut to a bounded length.
const MAX_TEXT = 512

const MODES: ReadonlySet<string> = new Set([
  "query",
  "composite_query",
  "update",
  "oneway",
])
const OUTCOMES: ReadonlySet<string> = new Set([
  "ok",
  "sent",
  "canister_err",
  "error",
])

const isText = (value: unknown, max = MAX_TEXT): value is string =>
  typeof value === "string" && value.length <= max

/** An entry read from storage, or `undefined` when it is not one. */
export function parseHistoryEntry(value: unknown): HistoryEntry | undefined {
  if (typeof value !== "object" || value === null) return undefined
  const e = value as Record<string, unknown>
  if (
    !isText(e.id) ||
    typeof e.at !== "number" ||
    !Number.isFinite(e.at) ||
    !isText(e.canisterId, 63) ||
    !isText(e.canisterName) ||
    !isText(e.method) ||
    typeof e.mode !== "string" ||
    !MODES.has(e.mode) ||
    !isText(e.caller, 63) ||
    typeof e.argsHex !== "string" ||
    fromHex(e.argsHex) === undefined ||
    typeof e.outcome !== "string" ||
    !OUTCOMES.has(e.outcome) ||
    !isText(e.summary) ||
    (e.kind !== undefined && !isText(e.kind, 64)) ||
    (e.mayHaveExecuted !== undefined && typeof e.mayHaveExecuted !== "boolean")
  ) {
    return undefined
  }
  return {
    id: e.id,
    at: e.at,
    canisterId: e.canisterId,
    canisterName: e.canisterName,
    method: e.method,
    mode: e.mode as MethodMode,
    caller: e.caller,
    argsHex: e.argsHex,
    outcome: e.outcome as HistoryEntry["outcome"],
    ...(e.kind === undefined ? {} : { kind: e.kind }),
    ...(e.mayHaveExecuted === undefined
      ? {}
      : { mayHaveExecuted: e.mayHaveExecuted }),
    summary: e.summary,
  }
}

/** Every valid entry of stored text, newest first; anything unreadable is dropped. */
export function parseHistory(raw: string | null): HistoryEntry[] {
  if (raw === null) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const entries: HistoryEntry[] = []
  for (const item of parsed) {
    const entry = parseHistoryEntry(item)
    if (entry !== undefined) entries.push(entry)
    if (entries.length === HISTORY_LIMIT) break
  }
  return entries
}

// --- the store ------------------------------------------------------------
//
// One per tab, over localStorage. Storage can be missing or throw (a private
// window, blocked site data, a full quota): then the history lives in memory
// for the tab, and the app works the same.

const EMPTY: HistoryEntry[] = []
const listeners = new Set<() => void>()
let snapshot: { raw: string | null; entries: HistoryEntry[] } | undefined
let memory: HistoryEntry[] = EMPTY
// Set once a write to storage failed: from then on the tab keeps its history
// in memory, which already holds every stored entry it read.
let storageFailed = false

function storage(): Storage | undefined {
  if (storageFailed) return undefined
  try {
    return typeof window === "undefined" ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

function readRaw(): string | null | undefined {
  try {
    return storage()?.getItem(HISTORY_STORAGE_KEY)
  } catch {
    return undefined
  }
}

/** The current entries: the same array until the stored text changes. */
function getSnapshot(): HistoryEntry[] {
  const raw = readRaw()
  if (raw === undefined) return memory
  if (snapshot === undefined || snapshot.raw !== raw) {
    snapshot = { raw, entries: parseHistory(raw) }
  }
  return snapshot.entries
}

const getServerSnapshot = (): HistoryEntry[] => EMPTY

function notify(): void {
  for (const listener of listeners) listener()
}

function write(entries: HistoryEntry[]): void {
  memory = entries
  const store = storage()
  if (store !== undefined) {
    try {
      const raw = JSON.stringify(entries)
      store.setItem(HISTORY_STORAGE_KEY, raw)
      snapshot = { raw, entries }
    } catch {
      // A full quota or blocked storage.
      storageFailed = true
    }
  }
  notify()
}

// The entries this tab added since it loaded. Tabs do not lock the shared
// store, and a tab may read a stale copy of it, so two tabs settling calls
// at once can each write a history without the other's newest entry. Each
// tab therefore puts its own entries back when another tab's write drops
// them: an unknown-outcome write never vanishes from the history.
const own = new Map<string, HistoryEntry>()

/** Both lists by id, newest first, at most {@link HISTORY_LIMIT}. */
function merged(
  stored: readonly HistoryEntry[],
  added: Iterable<HistoryEntry>
): HistoryEntry[] {
  // Added first, so an entry from the same millisecond sorts above the
  // stored ones (the sort is stable).
  const fresh = [...added]
  const ids = new Set(fresh.map((e) => e.id))
  return [...fresh, ...stored.filter((e) => !ids.has(e.id))]
    .sort((a, b) => b.at - a.at)
    .slice(0, HISTORY_LIMIT)
}

// Listens for as long as the tab lives once it added an entry, whether or
// not a history view is mounted.
let restoring = false

function restoreOwn(event: StorageEvent): void {
  if (event.key !== HISTORY_STORAGE_KEY && event.key !== null) return
  const stored = getSnapshot()
  if (stored.length === 0) {
    // Cleared in another tab: this tab's entries go too.
    own.clear()
    return
  }
  const kept = new Set(stored.map((e) => e.id))
  const oldest = stored.length < HISTORY_LIMIT ? -Infinity : stored.at(-1)!.at
  const dropped = [...own.values()].filter(
    (e) => !kept.has(e.id) && e.at >= oldest
  )
  if (dropped.length > 0) write(merged(stored, dropped))
}

function onStorage(event: StorageEvent): void {
  // Another tab wrote the history (or cleared all site data: key null).
  if (event.key === HISTORY_STORAGE_KEY || event.key === null) notify()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1 && typeof window !== "undefined") {
    window.addEventListener("storage", onStorage)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage)
    }
  }
}

/** Adds an entry (newest first), keeping at most {@link HISTORY_LIMIT}. */
export function addHistoryEntry(entry: HistoryEntry): void {
  own.delete(entry.id)
  own.set(entry.id, entry)
  // At most as many as the store keeps: older ones would be cut anyway.
  if (own.size > HISTORY_LIMIT) own.delete(own.keys().next().value!)
  if (!restoring && typeof window !== "undefined") {
    restoring = true
    window.addEventListener("storage", restoreOwn)
  }
  write(merged(getSnapshot(), [entry]))
}

export function clearHistory(): void {
  own.clear()
  write(EMPTY)
}

const historyApi = { add: addHistoryEntry, clear: clearHistory }

/** The tab's call history. Browser only: empty during SSR and hydration. */
export function useCallHistory(): {
  entries: HistoryEntry[]
  add(e: HistoryEntry): void
  clear(): void
} {
  const entries = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  )
  return { entries, ...historyApi }
}

let sequence = 0

/** A unique id for an entry. Event handlers only (it is random). */
export function newHistoryId(): string {
  sequence += 1
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now().toString(36)}-${sequence}`
  }
}

/** Text cut to `max` characters, with an ellipsis when cut. */
export function clip(text: string, max = 160): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}
