/**
 * The builders on a client: `queryKey`, `queryOptions`, `mutationOptions`
 * and `func`, with `canister` from `canister.ts`. Each returns a fresh plain
 * object (DECISIONS Q3): TanStack compares keys by their hash, so nothing is
 * gained by caching one, and a cached read would pin the caller it was built
 * for.
 *
 * The types the `Client` interface gives these functions are generic over the
 * generated `Actor`; the implementations below read plain values and are cast
 * to those types once, in {@link createBuilders}. `decodeArgs` returns
 * `unknown[]`, and the generated `Actor` type is the static description of
 * what the schemas just checked, so that cast is where the one unavoidable
 * `unknown` becomes the `Actor`'s reply type.
 *
 * Internal: not exported from the package entry.
 *
 * @module
 */
import { isPrincipal, resolveSchema } from "@candid-core/schema"
import { encodeArgs, type EncodeResult } from "@candid-core/schema/codec"
import {
  skipToken,
  type QueryFunctionContext,
  type QueryKey,
} from "@tanstack/query-core"
import {
  invoke,
  isWrite,
  prepareMethod,
  valuesOf,
  type ResolvedTarget,
} from "./call.js"
import {
  canisterFactory,
  describe,
  methodOf,
  recordOf,
  type CanisterRecord,
} from "./canister.js"
import type { Client, ClientInternals } from "./client.js"
import { isReactorError, retryQuery } from "./errors.js"
import {
  CERTIFIED,
  INVALID,
  KEY_ROOT,
  SKIP,
  stableText,
  toHex,
} from "./keys.js"
import { MANAGEMENT_CANISTER } from "./management.js"

/** The builders `createClient` puts on a client. */
export type Builders = Pick<
  Client,
  "canister" | "queryKey" | "queryOptions" | "mutationOptions" | "func"
>

/** What an update read with `{ update: "idempotent" }` adds to its options (DECISIONS Q2). */
const IDEMPOTENT = Object.freeze({
  staleTime: Infinity,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
})

const never = (): boolean => false

const slotOf = (target: ResolvedTarget): string =>
  target.ok ? target.id : target.slot

/** The args segments of a key: the hex of the encoding, or the tag and text of arguments that do not encode. */
const argsSegments = (encoded: EncodeResult, vars: unknown): string[] =>
  encoded.ok ? [toHex(encoded.bytes)] : [INVALID, stableText(vars)]

/**
 * Checks the fourth argument of `queryOptions`, and says whether it opts an
 * update in as a read.
 */
function readQueryOptionsArg(options: unknown): boolean {
  if (options === undefined) return false
  if (
    typeof options === "object" &&
    options !== null &&
    Object.keys(options).length === 1 &&
    (options as { update?: unknown }).update === "idempotent"
  ) {
    return true
  }
  throw new TypeError(
    `[ic-reactor] client.queryOptions() takes { update: "idempotent" } as its fourth argument, or nothing; got ${describe(options)}.`
  )
}

/** Whether a settled mutation may have changed what its canister's reads return. */
const mayHaveChanged = (error: unknown): boolean =>
  error === null ||
  error === undefined ||
  // Not ours (a bug, or code the app wrapped around the call): it proves
  // nothing, so the reads are refreshed.
  !isReactorError(error) ||
  error.kind === "canister_err" ||
  error.mayHaveExecuted

/**
 * The builders of one client. `owner` returns the client, which is built
 * after its builders.
 */
export function createBuilders(
  internals: ClientInternals,
  owner: () => Client
): Builders {
  const network = internals.network.keySegment

  /** A read's key, cut short where `method` or `args` are left out. */
  const readKey = (
    record: CanisterRecord,
    caller: string,
    target: ResolvedTarget,
    method?: string,
    args?: readonly string[]
  ): string[] => {
    const key = [KEY_ROOT, network, caller, slotOf(target)]
    if (method === undefined) return key
    key.push(method)
    if (args === undefined) return key
    key.push(...args)
    if (record.certified) key.push(CERTIFIED)
    return key
  }

  const queryKey = (canister: unknown, ...rest: unknown[]): QueryKey => {
    const call = "client.queryKey()"
    const record = recordOf(canister, internals, call)
    const caller = internals.current().principal
    const target = record.resolve()
    const [method, vars] = rest
    if (method === undefined) return readKey(record, caller, target)
    const prepared = methodOf(record, method, call)
    // Two arguments give the method's prefix, and three one read's key. A
    // method without arguments has one read, so two arguments give its key:
    // the one `queryOptions(c, method)` gives, which `getQueryData` and
    // `setQueryData` must be handed whole.
    if (rest.length < 2 && prepared.args.length > 0) {
      return readKey(record, caller, target, prepared.name)
    }
    if (vars === skipToken) {
      return readKey(record, caller, target, prepared.name, [SKIP])
    }
    const encoded = encodeArgs(prepared.args, valuesOf(prepared, vars))
    return readKey(
      record,
      caller,
      target,
      prepared.name,
      argsSegments(encoded, vars)
    )
  }

  const queryOptions = (
    canister: unknown,
    method: unknown,
    vars: unknown,
    options?: unknown
  ) => {
    const call = "client.queryOptions()"
    const record = recordOf(canister, internals, call)
    const prepared = methodOf(record, method, call)
    const idempotent = readQueryOptionsArg(options)
    if (prepared.mode === "oneway") {
      throw new TypeError(
        `[ic-reactor] ${call}: ${prepared.name} is a oneway method; it has no reply to cache. Call it directly, or through mutationOptions().`
      )
    }
    // A call of a method without results resolves `undefined`, and TanStack
    // Query takes a query function that resolves `undefined` for a failed
    // read: it reports an error and caches nothing, although the call
    // succeeded. Refused here, at build time, like a oneway.
    if (prepared.results.length === 0) {
      throw new TypeError(
        `[ic-reactor] ${call}: ${prepared.name} has no results, and a method without results has nothing to cache. ` +
          `Call it directly${isWrite(prepared.mode) ? ", or through mutationOptions()" : ""}.`
      )
    }
    if (isWrite(prepared.mode) && !idempotent) {
      throw new TypeError(
        `[ic-reactor] ${call}: ${prepared.name} is an update method, and a query refetches: every refetch would run the update again. ` +
          `Use client.mutationOptions() for a write. Only for an update that returns the same answer however often it runs ` +
          `(such as ckBTC's get_btc_address), pass { update: "idempotent" } as the fourth argument.`
      )
    }
    if (record.certified && prepared.mode === "composite_query") {
      throw new TypeError(
        `[ic-reactor] ${call}: ${prepared.name} is a composite query, which has no certified path. Read it from the canister made without certified: true.`
      )
    }
    // The read is made as the caller current now, and only ever as them: the
    // key holds their principal, and the query function asks for their agent,
    // which is refused once someone else is signed in.
    const caller = internals.current()
    const target = record.resolve()
    const write = isWrite(prepared.mode)
    const base = {
      // A read of `aaaaa-aa` made from an update is never sent twice, like
      // every other write to it.
      retry:
        write && target.ok && target.id === MANAGEMENT_CANISTER
          ? never
          : retryQuery,
      ...(idempotent ? IDEMPOTENT : {}),
    }
    if (vars === skipToken) {
      return {
        queryKey: readKey(record, caller.principal, target, prepared.name, [
          SKIP,
        ]),
        queryFn: skipToken,
        ...base,
      }
    }
    const values = valuesOf(prepared, vars)
    const encoded = encodeArgs(prepared.args, values)
    return {
      queryKey: readKey(
        record,
        caller.principal,
        target,
        prepared.name,
        argsSegments(encoded, vars)
      ),
      queryFn: ({ signal }: QueryFunctionContext) =>
        invoke(internals, {
          method: prepared,
          target,
          certified: record.certified,
          caller,
          values,
          encoded,
          signal,
          resend: false,
        }),
      ...base,
    }
  }

  /** Checks the third argument of `mutationOptions`, and returns the reads it names. */
  const readInvalidates = (
    canister: unknown,
    options: unknown
  ): { readonly record: CanisterRecord; readonly method?: string }[] => {
    const call = "client.mutationOptions()"
    if (options !== undefined) {
      const keys =
        typeof options === "object" && options !== null
          ? Object.keys(options)
          : undefined
      if (keys === undefined || keys.some((key) => key !== "invalidates")) {
        throw new TypeError(
          `[ic-reactor] ${call} takes { invalidates } as its third argument, or nothing; got ${describe(options)}. ` +
            "A mutation is never retried: an update re-sent after an unknown outcome can run twice."
        )
      }
    }
    const listed = (options as { invalidates?: unknown } | undefined)
      ?.invalidates
    if (listed === undefined) {
      return [{ record: recordOf(canister, internals, call) }]
    }
    if (!Array.isArray(listed)) {
      throw new TypeError(
        `[ic-reactor] ${call}: invalidates is a list of canisters and [canister, method] pairs, got ${describe(listed)}.`
      )
    }
    return listed.map((entry: unknown) => {
      if (Array.isArray(entry)) {
        const [target, method] = entry as unknown[]
        const record = recordOf(target, internals, `${call} invalidates`)
        return {
          record,
          method: methodOf(record, method, `${call} invalidates`).name,
        }
      }
      return { record: recordOf(entry, internals, `${call} invalidates`) }
    })
  }

  const mutationOptions = (
    canister: unknown,
    method: unknown,
    options?: unknown
  ) => {
    const call = "client.mutationOptions()"
    const record = recordOf(canister, internals, call)
    const prepared = methodOf(record, method, call)
    const invalidates = readInvalidates(canister, options)
    return {
      mutationKey: [
        KEY_ROOT,
        network,
        slotOf(record.resolve()),
        prepared.name,
      ] as const,
      // The caller and the target are read when the mutation runs.
      mutationFn: (vars: unknown) =>
        invoke(internals, {
          method: prepared,
          target: record.resolve(),
          certified: record.certified,
          caller: internals.current(),
          values: valuesOf(prepared, vars),
          resend: true,
        }),
      retry: false as const,
      onSettled: async (_data: unknown, error: unknown): Promise<void> => {
        if (invalidates.length === 0 || !mayHaveChanged(error)) return
        // Every caller's reads, certified or not: a write changes what the
        // canister answers to everyone.
        const targets = invalidates.map(({ record: listed, method: only }) => ({
          slots: listed.slots(),
          method: only,
        }))
        await owner().queryClient.invalidateQueries({
          predicate: ({ queryKey: key }) =>
            key[0] === KEY_ROOT &&
            key[1] === network &&
            targets.some(
              ({ slots, method: only }) =>
                slots.includes(key[3] as string) &&
                (only === undefined || key[4] === only)
            ),
        })
      },
    }
  }

  const func = (funcSchema: unknown, ref: unknown) => {
    const call = "client.func()"
    let node: ReturnType<typeof resolveSchema>
    try {
      node = resolveSchema(funcSchema as Parameters<typeof resolveSchema>[0])
    } catch (cause) {
      const error = new TypeError(
        `[ic-reactor] ${call} takes a func schema, such as the generated QueryArchiveFn: ${
          cause instanceof Error ? cause.message : String(cause)
        }.`
      )
      Object.defineProperty(error, "cause", { value: cause })
      throw error
    }
    if (node.kind !== "func") {
      throw new TypeError(
        `[ic-reactor] ${call} takes a func schema, such as the generated QueryArchiveFn; got a ${node.kind} schema.`
      )
    }
    const { principal, method } = (
      typeof ref === "object" && ref !== null ? ref : {}
    ) as { principal?: unknown; method?: unknown }
    if (!isPrincipal(principal)) {
      throw new TypeError(
        `[ic-reactor] ${call}: ${describe(principal)} is not a canister's principal text. Pass the func value the reply carried, { principal, method }.`
      )
    }
    if (typeof method !== "string" || method === "") {
      throw new TypeError(
        `[ic-reactor] ${call}: ${describe(method)} is not a method name. Pass the func value the reply carried, { principal, method }.`
      )
    }
    const prepared = prepareMethod({
      name: method,
      mode: node.mode,
      args: node.args,
      results: node.results,
    })
    const target: ResolvedTarget = { ok: true, id: principal }
    return async (...args: unknown[]): Promise<unknown> =>
      invoke(internals, {
        method: prepared,
        target,
        certified: false,
        caller: internals.current(),
        values: args,
        resend: true,
      })
  }

  return {
    canister: canisterFactory(internals),
    queryKey,
    queryOptions,
    mutationOptions,
    func,
  } as unknown as Builders
}
