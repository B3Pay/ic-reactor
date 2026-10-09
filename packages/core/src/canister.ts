/**
 * `client.canister()`: a frozen object with one plain async method per Candid
 * method of a service, and the record behind it that the builders on the
 * client read (`queryKey`, `queryOptions`, `mutationOptions`).
 *
 * A canister object holds nothing but its methods. What the builders need
 * (the client it belongs to, its target, its prepared methods) is kept in a
 * module-level `WeakMap` keyed by the object, so a canister carries no
 * property a Candid method name could collide with.
 *
 * Internal: not exported from the package entry.
 *
 * @module
 */
import { serviceMethods, type AnyFieldSchema } from "@candid-core/schema"
import type { ClientInternals } from "./client.js"
import {
  invoke,
  prepareMethod,
  type PreparedMethod,
  type ResolvedTarget,
} from "./call.js"
import { unresolvedSlot } from "./keys.js"
import { resolveCanisterId, type CanisterIdTarget } from "./network.js"

/** What the builders know about a canister object. */
export interface CanisterRecord {
  /** The internals of the client that made it. */
  readonly internals: ClientInternals
  readonly target: CanisterIdTarget
  readonly certified: boolean
  readonly methods: ReadonlyMap<string, PreparedMethod>
  /**
   * The canister id now, or the key segment of a `{ name }` the cookie does
   * not resolve and why. Read again for each call and each key: the cookie is
   * the source, and it is cheap to read.
   */
  resolve(): ResolvedTarget
  /** Every canisterId segment this canister's keys can carry: its id, or for a `{ name }` both the unresolved tag and the id it resolves to now. */
  slots(): readonly string[]
}

const RECORDS = new WeakMap<object, CanisterRecord>()

/** A value for an error message, without throwing on one `JSON.stringify` rejects. */
export const describe = (value: unknown): string => {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

/**
 * The record of a canister object made by `internals`' client.
 *
 * @throws TypeError for anything else: an object that is not a canister, or
 * a canister of another client, whose network and cache are not this one's.
 */
export function recordOf(
  canister: unknown,
  internals: ClientInternals,
  call: string
): CanisterRecord {
  const record =
    typeof canister === "object" && canister !== null
      ? RECORDS.get(canister)
      : undefined
  if (record === undefined) {
    throw new TypeError(
      `[ic-reactor] ${call} takes a canister made by client.canister(), got ${describe(canister)}.`
    )
  }
  if (record.internals !== internals) {
    throw new TypeError(
      `[ic-reactor] ${call} was given a canister made by another client. Keys and caches belong to one client: make the canister with this client's canister().`
    )
  }
  return record
}

/**
 * The prepared method `method` of `record`.
 *
 * @throws TypeError naming the method when the service has none by that name.
 */
export function methodOf(
  record: CanisterRecord,
  method: unknown,
  call: string
): PreparedMethod {
  const prepared =
    typeof method === "string" ? record.methods.get(method) : undefined
  if (prepared === undefined) {
    throw new TypeError(
      `[ic-reactor] ${call}: the service has no method ${describe(method)}. Its methods: ${[
        ...record.methods.keys(),
      ].join(", ")}.`
    )
  }
  return prepared
}

const TARGET_KEYS = new Set(["id", "name", "certified"])

/**
 * Checks a {@link CanisterTarget} that a JavaScript caller, or a cast, can get
 * past the types, and returns its parts and the text it is memoized under.
 */
function readTarget(target: unknown): {
  readonly target: CanisterIdTarget
  readonly certified: boolean
  readonly memoKey: string
} {
  const bad = (why: string) =>
    new TypeError(
      `[ic-reactor] client.canister() takes { id } or { name }, with an optional certified: boolean; ${why}, got ${describe(target)}.`
    )
  if (typeof target !== "object" || target === null) {
    throw bad("the target is not an object")
  }
  const record = target as Record<string, unknown>
  const unknown = Object.keys(record).filter((key) => !TARGET_KEYS.has(key))
  if (unknown.length > 0) throw bad(`it has no option ${unknown.join(", ")}`)
  const { id, name, certified } = record
  if (certified !== undefined && typeof certified !== "boolean") {
    throw bad("certified is a boolean")
  }
  const hasId = id !== undefined
  const hasName = name !== undefined
  if (hasId === hasName) throw bad("give exactly one of id and name")
  if (hasId && typeof id !== "string") throw bad("id is principal text")
  if (hasName && typeof name !== "string") throw bad("name is text")
  const flag = certified === true
  return hasId
    ? {
        target: { id: id as string },
        certified: flag,
        memoKey: `id\u0000${id as string}\u0000${flag}`,
      }
    : {
        target: { name: name as string },
        certified: flag,
        memoKey: `name\u0000${name as string}\u0000${flag}`,
      }
}

/**
 * Builds the `client.canister()` of one client. Canister objects are memoized
 * per (service schema object, target, certified), so the same call returns the
 * same object and can be made during render.
 */
export function canisterFactory(
  internals: ClientInternals
): (service: unknown, target: unknown) => object {
  const memo = new WeakMap<object, Map<string, object>>()

  return (service, rawTarget) => {
    const { target, certified, memoKey } = readTarget(rawTarget)
    if (typeof service !== "object" || service === null) {
      throw new TypeError(
        `[ic-reactor] client.canister() takes the service schema of a generated module (its \`actor\` export), got ${describe(service)}.`
      )
    }
    let byTarget = memo.get(service)
    const hit = byTarget?.get(memoKey)
    if (hit !== undefined) return hit

    // An `{ id }` that is not principal text is a programmer error: a
    // TypeError that names it, now, rather than a failure of some later call.
    let fixed: ResolvedTarget | undefined
    if ("id" in target) {
      resolveCanisterId(target, internals.network)
      fixed = { ok: true, id: target.id }
    }

    let methods: ReadonlyMap<string, PreparedMethod>
    try {
      methods = new Map(
        [...serviceMethods(service as AnyFieldSchema).values()].map(
          (method) => [method.name, prepareMethod(method)]
        )
      )
    } catch (cause) {
      const error = new TypeError(
        `[ic-reactor] client.canister() takes the service schema of a generated module (its \`actor\` export), or the actor of schemaFromContract(): ${
          cause instanceof Error ? cause.message : String(cause)
        }.`
      )
      Object.defineProperty(error, "cause", { value: cause })
      throw error
    }

    const resolve = (): ResolvedTarget => {
      if (fixed !== undefined) return fixed
      const name = (target as { name: string }).name
      const resolution = resolveCanisterId(target, internals.network)
      return resolution.ok
        ? { ok: true, id: resolution.id }
        : { ok: false, slot: unresolvedSlot(name), message: resolution.message }
    }
    const record: CanisterRecord = Object.freeze({
      internals,
      target,
      certified,
      methods,
      resolve,
      slots(): readonly string[] {
        if (fixed?.ok === true) return [fixed.id]
        const now = resolve()
        const name = (target as { name: string }).name
        return now.ok ? [unresolvedSlot(name), now.id] : [now.slot]
      },
    })

    const canister: Record<string, unknown> = {}
    for (const method of methods.values()) {
      // Defined, not assigned: a method named `__proto__` must stay a method.
      Object.defineProperty(canister, method.name, {
        enumerable: true,
        // Async, so that everything read when it is called, the caller
        // included, fails as a rejection and never as a synchronous throw.
        value: async (...args: unknown[]): Promise<unknown> =>
          invoke(internals, {
            method,
            target: resolve(),
            certified,
            caller: internals.current(),
            values: args,
            resend: true,
            canister,
          }),
      })
    }
    Object.freeze(canister)
    RECORDS.set(canister, record)
    if (byTarget === undefined) {
      byTarget = new Map()
      memo.set(service, byTarget)
    }
    byTarget.set(memoKey, canister)
    return canister
  }
}
