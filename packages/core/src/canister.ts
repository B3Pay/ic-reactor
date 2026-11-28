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
import { serviceMethods, type AnyFieldSchema } from "@meantjs/schema"
import type { ClientInternals } from "./client.js"
import { Principal } from "@icp-sdk/core/principal"
import {
  invoke,
  isWrite,
  prepareMethod,
  type PreparedMethod,
  type ResolvedTarget,
  type SenderInfo,
} from "./call.js"
import { NOBODY_TAG, attributesTag, unresolvedSlot } from "./keys.js"
import {
  principalProblem,
  resolveCanisterId,
  type CanisterIdTarget,
} from "./network.js"

/**
 * What one run of a mutation resolved, in one synchronous step when it
 * started: the canister it writes to, and the canisterId segments (and
 * method) of every read it invalidates. A `{ name }` is resolved from the
 * `ic_env` cookie, which a local redeploy can rewrite while an update is in
 * flight; resolving once keeps the write and its invalidation on the same
 * canister. (Who started the run is read in the same step, and kept by the
 * run's context: `ClientInternals.mutationCallers`.)
 */
export interface MutationRun {
  readonly target: ResolvedTarget
  readonly invalidates: readonly {
    readonly slots: readonly string[]
    readonly method?: string
  }[]
}

/** A method of a canister object: what a call needs of it, and what the runs of the mutations that write through it resolved. */
export interface CanisterMethod extends PreparedMethod {
  /**
   * What was resolved for each run of a mutation that writes through this
   * method of this canister, by the function context TanStack Query creates
   * for the run and passes to `onMutate`, `mutationFn` and `onSettled`
   * alike: how `mutationFn` finds what `onMutate` resolved, and
   * `onSettled` what `mutationFn` wrote to, even when an `onMutate` of the
   * app's replaced the client's, and whichever render built the options
   * TanStack calls, when it built them from this canister object. (TanStack
   * hands a pending run later options only when their mutationKey, so their
   * canister id, method and `signing`, is the same. Those built from another
   * canister object of that id, one with another `timeoutMs` or `certified`,
   * find nothing here: their `mutationFn` resolves the run again.) Kept by the
   * method of the canister and not by the client: a `mutationFn` of the app's
   * own may hand one run's context to the `mutationFn` of other options,
   * whose write goes to their canister, and whose `onSettled` refreshes the
   * reads they name. Options built for this method share an entry, whatever
   * `invalidates` each of them names.
   */
  readonly runs: WeakMap<object, MutationRun>
  /**
   * How a write through it is signed when not as the caller, as the segment
   * its mutationKey ends with after the method (`keys.ts`): set with
   * `nobody`, and with `attributes`.
   */
  readonly signing?: string
}

/** How many canister objects have been made with `attributes`: each one's number in its mutation keys. */
let attributed = 0

/** What the builders know about a canister object. */
export interface CanisterRecord {
  /** The internals of the client that made it. */
  readonly internals: ClientInternals
  readonly target: CanisterIdTarget
  readonly certified: boolean
  /** How long each call through the canister waits for its answer (`CanisterTarget.timeoutMs`). */
  readonly timeoutMs?: number
  readonly methods: ReadonlyMap<string, CanisterMethod>
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
): CanisterMethod {
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

const TARGET_KEYS = new Set([
  "id",
  "name",
  "certified",
  "timeoutMs",
  "anonymous",
  "attributes",
])

/** The `attributes` of a canister target, as the app gave them. */
interface GivenAttributes {
  readonly data: Uint8Array
  readonly signature: Uint8Array
  readonly signer?: string
}

/**
 * Whether `value` is not a `timeoutMs`: a number of milliseconds from 1 to
 * 2147483647, the most a timer takes (a larger one fires at once).
 */
export const badTimeout = (value: unknown): boolean =>
  value !== undefined &&
  !(typeof value === "number" && value >= 1 && value <= 2147483647)

/**
 * Checks a {@link CanisterTarget} that a JavaScript caller, or a cast, can get
 * past the types, and returns its parts and the text it is memoized under.
 */
export function readTarget(
  target: unknown,
  what = "client.canister()"
): {
  readonly target: CanisterIdTarget
  readonly certified: boolean
  readonly timeoutMs?: number
  /** The methods named `anonymous`, each once, in order. */
  readonly anonymous: readonly string[]
  /** The `attributes` object itself: the same one gives the same canister object. */
  readonly attributes?: GivenAttributes
  readonly memoKey: string
} {
  const bad = (why: string) =>
    new TypeError(
      `[ic-reactor] ${what} takes { id } or { name }, with an optional certified: boolean, timeoutMs, and anonymous or attributes; ${why}, got ${describe(target)}.`
    )
  if (typeof target !== "object" || target === null) {
    throw bad("the target is not an object")
  }
  const record = target as Record<string, unknown>
  const unknown = Object.keys(record).filter((key) => !TARGET_KEYS.has(key))
  if (unknown.length > 0) throw bad(`it has no option ${unknown.join(", ")}`)
  const { id, name, certified, timeoutMs, anonymous, attributes } = record
  if (certified !== undefined && typeof certified !== "boolean") {
    throw bad("certified is a boolean")
  }
  if (badTimeout(timeoutMs)) throw bad("timeoutMs is 1 to 2147483647 ms")
  if (
    anonymous !== undefined &&
    !(
      Array.isArray(anonymous) &&
      anonymous.every((method) => typeof method === "string")
    )
  ) {
    throw bad("anonymous is a list of method names")
  }
  if (attributes !== undefined) {
    const { data, signature, signer } = (
      typeof attributes === "object" && attributes !== null ? attributes : {}
    ) as Record<string, unknown>
    if (!(data instanceof Uint8Array) || !(signature instanceof Uint8Array)) {
      throw bad("attributes is { data, signature } as bytes")
    }
    if (
      signer !== undefined &&
      (typeof signer !== "string" || principalProblem(signer) !== undefined)
    ) {
      throw bad("attributes.signer is principal text")
    }
    if (anonymous !== undefined && anonymous.length > 0) {
      throw bad("give one of anonymous and attributes")
    }
  }
  const named = [...new Set((anonymous ?? []) as string[])].sort()
  const hasId = id !== undefined
  const hasName = name !== undefined
  if (hasId === hasName) throw bad("give exactly one of id and name")
  if (hasId && typeof id !== "string") throw bad("id is principal text")
  if (hasName && typeof name !== "string") throw bad("name is text")
  const flag = certified === true
  const rest = {
    certified: flag,
    timeoutMs: timeoutMs as number | undefined,
    anonymous: named,
    attributes: attributes as GivenAttributes | undefined,
    memoKey:
      `${hasId ? "id" : "name"}\u0000${(id ?? name) as string}\u0000${flag}\u0000${timeoutMs as number}` +
      (named.length > 0 ? `\u0000${JSON.stringify(named)}` : ""),
  }
  return {
    target: hasId ? { id: id as string } : { name: name as string },
    ...rest,
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
  /** The memo of the canister objects made with each `attributes` object. */
  const withAttributes = new WeakMap<
    object,
    WeakMap<object, Map<string, object>>
  >()

  return (service, rawTarget) => {
    const {
      target,
      certified,
      timeoutMs,
      memoKey,
      anonymous,
      attributes: given,
    } = readTarget(rawTarget)
    if (typeof service !== "object" || service === null) {
      throw new TypeError(
        `[ic-reactor] client.canister() takes the service schema of a generated module (its \`actor\` export), got ${describe(service)}.`
      )
    }
    let services = memo
    if (given !== undefined) {
      let made = withAttributes.get(given)
      if (made === undefined) withAttributes.set(given, (made = new WeakMap()))
      services = made
    }
    let byTarget = services.get(service)
    const hit = byTarget?.get(memoKey)
    if (hit !== undefined) return hit

    // What every call through this canister object carries as its
    // `sender_info`: a copy, so that nothing done to the object the app holds
    // changes what is sent. `new Uint8Array(bytes)` copies where `slice()`
    // does not for every Uint8Array: a Node Buffer's is a view of its memory.
    let attributes: SenderInfo | undefined
    if (given !== undefined) {
      const signer = given.signer ?? internals.attributesSigner()
      if (signer === undefined) {
        throw new TypeError(
          "[ic-reactor] client.canister(): this network names no identity provider; pass attributes.signer, the canister that signed them."
        )
      }
      attributes = Object.freeze({
        data: new Uint8Array(given.data),
        signature: new Uint8Array(given.signature),
        signer: Principal.fromText(signer),
      })
    }

    // An `{ id }` that is not principal text is a programmer error: a
    // TypeError that names it, now, rather than a failure of some later call.
    let fixed: ResolvedTarget | undefined
    if ("id" in target) {
      resolveCanisterId(target, internals.network)
      fixed = { ok: true, id: target.id }
    }

    const nobody = new Set(anonymous)
    let methods: ReadonlyMap<string, CanisterMethod>
    try {
      methods = new Map(
        [...serviceMethods(service as AnyFieldSchema).values()].map(
          (method) => [
            method.name,
            { ...prepareMethod(method), runs: new WeakMap() },
          ]
        )
      )
      // How each method is signed, when not simply as the caller, and the
      // segment that says so in its mutation keys.
      if (nobody.size > 0 || attributes !== undefined) {
        const signed = attributes && {
          attributes,
          signing: attributesTag(++attributed),
        }
        methods = new Map(
          [...methods].map(([name, method]) => [
            name,
            {
              ...method,
              ...(nobody.has(name)
                ? { nobody: true as const, signing: NOBODY_TAG }
                : {}),
              ...signed,
            },
          ])
        )
      }
    } catch (cause) {
      const error = new TypeError(
        `[ic-reactor] client.canister() takes the service schema of a generated module (its \`actor\` export), or the actor of schemaFromContract(): ${
          cause instanceof Error ? cause.message : String(cause)
        }.`
      )
      Object.defineProperty(error, "cause", { value: cause })
      throw error
    }

    // Only an update anyone may send is named: a name that is no method, or
    // that of a read, is a mistake to say now.
    for (const name of anonymous) {
      const method = methods.get(name)
      if (method === undefined) {
        throw new TypeError(
          `[ic-reactor] client.canister(): anonymous names ${describe(name)}, which is no method of the service.`
        )
      }
      if (!isWrite(method.mode)) {
        throw new TypeError(
          `[ic-reactor] client.canister(): anonymous names ${name}, a ${method.mode}; it is for the updates anyone may send.`
        )
      }
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
      timeoutMs,
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
            timeoutMs,
            resend: true,
            canister,
            via: "direct",
          }),
      })
    }
    Object.freeze(canister)
    RECORDS.set(canister, record)
    if (byTarget === undefined) {
      byTarget = new Map()
      services.set(service, byTarget)
    }
    byTarget.set(memoKey, canister)
    return canister
  }
}
