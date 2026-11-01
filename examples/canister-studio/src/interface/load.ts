// Isomorphic: what route loaders call to get a canister's interface, and how
// a page rebuilds schemas from the payload on either side.
import { serviceMethods, type AnySchema } from "@meantjs/schema"
import { schemaFromContract } from "@meantjs/schema/contract"
import { useMemo } from "react"
import { checkCanisterId } from "../lib/ids.ts"
import { CURATED, registryEntry, type RegistryEntry } from "../lib/registry.ts"
import { Lru } from "./cache.ts"
import { docFor } from "./docs.ts"
import { fetchInterface } from "./functions.ts"
import { serverResult } from "./server-result.ts"
import { typedPayload } from "./typed.ts"
import type {
  CanisterInterface,
  InterfacePayload,
  MethodInfo,
} from "./types.ts"

export { typedModuleText } from "./typed.ts"

type OkPayload = Extract<InterfacePayload, { ok: true }>

/**
 * The interface payload of a canister, on either side: a registry canister
 * gives its typed payload (no network), any other canister its live one
 * (`loadLivePayload`). Never throws: failures are `{ ok: false }` payloads.
 */
export async function loadInterfacePayload(
  canisterId: string
): Promise<InterfacePayload> {
  const id = checkCanisterId(canisterId)
  if (!id.ok) {
    return { ok: false, canisterId, code: id.code, message: id.message }
  }
  const entry = registryEntry(id.id)
  if (entry === undefined) return loadLivePayload(id.id)
  try {
    return await typedPayload(entry)
  } catch (error) {
    return { ok: false, canisterId, code: "network", message: messageOf(error) }
  }
}

// Canisters whose next live load is an explicit retry: set by "Try again"
// just before it re-runs the route loader, taken by that load.
const retryNext = new Set<string>()

/** Makes the next live load of this canister skip a remembered transient failure. */
export function retryInterface(canisterId: string): void {
  retryNext.add(canisterId)
}

/**
 * The live interface payload of any canister, registry canisters included:
 * through the `fetchInterface` server function. In the browser, when that
 * call fails or gives no result (StackBlitz, where server functions cannot
 * run), the browser reads the canister's certified metadata and compiles it
 * with a lazily loaded compiler instead (`compiledIn: "browser"`). Never
 * throws.
 */
export async function loadLivePayload(
  canisterId: string
): Promise<InterfacePayload> {
  const id = checkCanisterId(canisterId)
  if (!id.ok) {
    return { ok: false, canisterId, code: id.code, message: id.message }
  }
  const retry = retryNext.delete(id.id)
  try {
    return await serverResult(
      fetchInterface({ data: { canisterId: id.id, retry } })
    )
  } catch (error) {
    if (import.meta.env.SSR) {
      return {
        ok: false,
        canisterId,
        code: "network",
        message: messageOf(error),
      }
    }
  }
  try {
    const { readInterfaceInBrowser } = await import("./browser.ts")
    return await readInterfaceInBrowser(id.id, { retry })
  } catch (error) {
    return { ok: false, canisterId, code: "network", message: messageOf(error) }
  }
}

/** The schemas and methods of one .did, shared by the canisters that have it. */
type Built = {
  actor: AnySchema
  methods: readonly MethodInfo[]
  byName: ReadonlyMap<string, MethodInfo>
  omitted: CanisterInterface["omitted"]
}

// Module-level memos, so the same payload gives the same objects (and
// `client.canister()` the same canister) on every render. Runtime interfaces
// are keyed by did hash: the server holds one map for all requests, which
// is safe because an interface is public data, and bounded.
const builtByDid = new Lru<string, Built>({ maxEntries: 64 })
const builtByRegistryId = new Map<string, Built>()
const interfaces = new Lru<string, CanisterInterface>({ maxEntries: 128 })

const CURATED_NAMES: ReadonlyMap<string, string> = new Map(
  CURATED.map((c) => [c.id, c.name])
)

/**
 * Rebuilds the interface from a payload: a registry canister's generated
 * actor for a typed payload, `schemaFromContract` of the envelope for any
 * other. Memoized (by registry id, or by `didSha256`), so the same payload
 * gives the same object. Throws for a runtime payload whose envelope the
 * schema loader refuses, which the server already ruled out.
 */
export function interfaceFromPayload(p: OkPayload): CanisterInterface {
  const key = interfaceKey(p)
  const known = interfaces.get(key)
  if (known !== undefined) return known

  const registry =
    p.source.kind === "typed" ? registryEntry(p.canisterId) : undefined
  if (p.source.kind === "typed" && registry === undefined) {
    throw new Error(
      `${p.canisterId} is not a registry canister, so it has no typed interface.`
    )
  }
  const built =
    registry === undefined
      ? builtFromEnvelope(p)
      : builtFromRegistry(registry, p)
  const iface: CanisterInterface = {
    canisterId: p.canisterId,
    name: nameOf(p, registry),
    actor: built.actor,
    methods: built.methods,
    method: (name) => built.byName.get(name),
    source: p.source,
    did: p.did,
    didSha256: p.didSha256,
    omitted: built.omitted,
    ...(registry === undefined ? {} : { registry }),
  }
  interfaces.set(key, iface)
  return iface
}

/** `interfaceFromPayload` for components; `undefined` for a failed payload. */
export function useCanisterInterface(
  p: InterfacePayload
): CanisterInterface | undefined {
  return useMemo(() => (p.ok ? interfaceFromPayload(p) : undefined), [p])
}

function interfaceKey(p: OkPayload): string {
  const hash = "moduleHash" in p.source ? (p.source.moduleHash ?? "") : ""
  return [p.source.kind, p.canisterId, p.didSha256, hash].join("\u0000")
}

function builtFromRegistry(entry: RegistryEntry, p: OkPayload): Built {
  let built = builtByRegistryId.get(entry.id)
  if (built === undefined) {
    built = build(entry.actor, [], p.docs)
    builtByRegistryId.set(entry.id, built)
  }
  return built
}

function builtFromEnvelope(p: OkPayload): Built {
  const known = builtByDid.get(p.didSha256)
  if (known !== undefined) return known
  if (p.envelopeJson === undefined) {
    throw new Error(
      `The interface payload of ${p.canisterId} carries no envelope.`
    )
  }
  // The envelope is JSON the server (or this browser) wrote with
  // `JSON.stringify`; `schemaFromContract` takes `unknown` and validates all of it.
  const result = schemaFromContract(JSON.parse(p.envelopeJson) as unknown)
  if (!result.ok) {
    const issues = result.issues
      .slice(0, 3)
      .map((i) => `${i.code} at ${i.path}`)
    throw new Error(
      `The interface of ${p.canisterId} did not load: ${issues.join("; ")}`
    )
  }
  if (result.actor === undefined) {
    throw new Error(`The interface of ${p.canisterId} declares no service.`)
  }
  const built = build(result.actor, result.omitted, p.docs)
  builtByDid.set(p.didSha256, built)
  return built
}

/**
 * The methods of a service schema, sorted by name, each with its doc from
 * `docs` when there is one.
 */
export function methodsOf(
  actor: AnySchema,
  docs: Readonly<Record<string, string>> = {}
): MethodInfo[] {
  const methods: MethodInfo[] = []
  for (const m of serviceMethods(actor).values()) {
    const doc = docFor(docs, m.name)
    methods.push({
      name: m.name,
      mode: m.mode,
      args: m.args,
      results: m.results,
      ...(doc === undefined ? {} : { doc }),
    })
  }
  // Code-point order, not localeCompare: the server and the browser must
  // agree whatever their locales.
  return methods.sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  )
}

function build(
  actor: AnySchema,
  omitted: CanisterInterface["omitted"],
  docs: Readonly<Record<string, string>>
): Built {
  const methods = methodsOf(actor, docs)
  return {
    actor,
    methods,
    byName: new Map(methods.map((m) => [m.name, m])),
    omitted: omitted.map((o) => ({ ...o })),
  }
}

function nameOf(p: OkPayload, registry: RegistryEntry | undefined): string {
  if (registry !== undefined) return registry.name
  const curated = CURATED_NAMES.get(p.canisterId)
  if (curated !== undefined) return curated
  if (p.source.kind === "pasted") return "Pasted interface"
  return p.canisterId
}

function messageOf(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return `The interface could not be loaded: ${text.slice(0, 300)}`
}
