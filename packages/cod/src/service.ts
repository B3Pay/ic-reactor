/**
 * Candid Codec — Service & Method Codecs
 *
 * `query`, `update`, `oneway` method codecs and the top-level `service` codec.
 * The service codec produces an `idlFactory` and a structured `manifest()`.
 */

import { IDL } from "@icp-sdk/core/candid"
import { CandidCodec } from "./codec"
import type { Infer } from "./composites"
import type {
  CandidFieldManifest,
  CandidMetadata,
  CandidMethodManifest,
  CandidServiceManifest,
} from "./types"

// ─────────────────────────────────────────────────────────────────────────────
// Type-Level Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Infer a tuple of TS types from an array of codecs. */
type InferArgs<T extends readonly CandidCodec<unknown>[]> = {
  [K in keyof T]: Infer<T[K]>
}

/**
 * Build the actor method signature for a single method codec.
 * Query/update: `(...args) => Promise<ReturnType>`
 * No-return methods: `(...args) => Promise<void>`
 * Oneway:       `(...args) => Promise<void>`
 */
type MethodSignature<M> =
  M extends CandidMethodCodec<infer A, infer R, infer Mode>
    ? Mode extends "oneway"
      ? (...args: InferArgs<A>) => Promise<void>
      : (...args: InferArgs<A>) => Promise<InferReturn<R>>
    : never

/** Map a record of method codecs to an actor-like interface. */
type ServiceActor<
  M extends Record<string, CandidMethodCodec<readonly CandidCodec<unknown>[]>>,
> = {
  [K in keyof M]: MethodSignature<M[K]>
}

// ─────────────────────────────────────────────────────────────────────────────
// Method Codec
// ─────────────────────────────────────────────────────────────────────────────

type MethodMode = "query" | "update" | "oneway"
type ReturnCodecs = readonly CandidCodec<unknown>[] | undefined

type InferReturn<T extends ReturnCodecs> = T extends readonly [
  infer R extends CandidCodec<unknown>,
]
  ? Infer<R>
  : T extends readonly CandidCodec<unknown>[]
    ? InferArgs<T>
    : void

/**
 * Codec for a single service method.
 *
 * Not a `CandidCodec<T>` subclass because methods are not standalone Candid
 * types — they only exist within a service context.
 */
export class CandidMethodCodec<
  A extends readonly CandidCodec<unknown>[] = CandidCodec<unknown>[],
  R extends ReturnCodecs = ReturnCodecs,
  M extends MethodMode = MethodMode,
> {
  readonly metadata: CandidMetadata

  constructor(
    readonly mode: M,
    readonly argCodecs: A,
    readonly returnCodecs: R,
    metadata: CandidMetadata = {}
  ) {
    this.metadata = Object.freeze({ ...metadata })
  }

  get returnCodec(): CandidCodec<unknown> | undefined {
    return this.returnCodecs?.length === 1 ? this.returnCodecs[0] : undefined
  }

  /** IDL annotations array for `IDL.Func`. */
  get annotations(): string[] {
    if (this.mode === "query") return ["query"]
    if (this.mode === "oneway") return ["oneway"]
    return [] // update has no annotation
  }

  /** Return a new method codec with the given description. */
  describe(text: string): CandidMethodCodec<A, R, M> {
    return new CandidMethodCodec(this.mode, this.argCodecs, this.returnCodecs, {
      ...this.metadata,
      description: text,
    })
  }

  /** Return a new method codec with arbitrary metadata merged in. */
  meta(m: Partial<CandidMetadata>): CandidMethodCodec<A, R, M> {
    return new CandidMethodCodec(this.mode, this.argCodecs, this.returnCodecs, {
      ...this.metadata,
      ...m,
    })
  }
}

// ─── Method Factories ─────────────────────────────────────────────────────

/**
 * Define a query method: `c.query([ArgCodec, ...], ReturnCodec)`.
 */
export function query<
  A extends readonly CandidCodec<unknown>[],
  R extends CandidCodec<unknown>,
>(args: [...A], ret: R): CandidMethodCodec<A, readonly [R], "query">
/**
 * Define a query method with multiple return values:
 * `c.query([ArgCodec, ...], [ReturnCodec, ...])`.
 */
export function query<
  A extends readonly CandidCodec<unknown>[],
  R extends readonly CandidCodec<unknown>[],
>(args: [...A], rets: [...R]): CandidMethodCodec<A, R, "query">
/**
 * Define a query method with no return values: `c.query([ArgCodec, ...])`.
 */
export function query<A extends readonly CandidCodec<unknown>[]>(
  args: [...A]
): CandidMethodCodec<A, undefined, "query">
export function query<
  A extends readonly CandidCodec<unknown>[],
  R extends CandidCodec<unknown> | readonly CandidCodec<unknown>[] | undefined,
>(args: [...A], ret?: R): CandidMethodCodec<A, ReturnCodecs, "query"> {
  return new CandidMethodCodec("query", args, normalizeReturnCodecs(ret))
}

/**
 * Define an update method: `c.update([ArgCodec, ...], ReturnCodec)`.
 */
export function update<
  A extends readonly CandidCodec<unknown>[],
  R extends CandidCodec<unknown>,
>(args: [...A], ret: R): CandidMethodCodec<A, readonly [R], "update">
/**
 * Define an update method with multiple return values:
 * `c.update([ArgCodec, ...], [ReturnCodec, ...])`.
 */
export function update<
  A extends readonly CandidCodec<unknown>[],
  R extends readonly CandidCodec<unknown>[],
>(args: [...A], rets: [...R]): CandidMethodCodec<A, R, "update">
/**
 * Define an update method with no return values: `c.update([ArgCodec, ...])`.
 */
export function update<A extends readonly CandidCodec<unknown>[]>(
  args: [...A]
): CandidMethodCodec<A, undefined, "update">
export function update<
  A extends readonly CandidCodec<unknown>[],
  R extends CandidCodec<unknown> | readonly CandidCodec<unknown>[] | undefined,
>(args: [...A], ret?: R): CandidMethodCodec<A, ReturnCodecs, "update"> {
  return new CandidMethodCodec("update", args, normalizeReturnCodecs(ret))
}

/**
 * Define a oneway method: `c.oneway([ArgCodec, ...])`.
 */
export function oneway<A extends readonly CandidCodec<unknown>[]>(
  args: [...A]
): CandidMethodCodec<A, undefined, "oneway"> {
  return new CandidMethodCodec("oneway", args, undefined)
}

function normalizeReturnCodecs(
  ret?: CandidCodec<unknown> | readonly CandidCodec<unknown>[]
): ReturnCodecs {
  if (!ret) return undefined
  return isReturnCodecArray(ret) ? ret : [ret]
}

function isReturnCodecArray(
  ret: CandidCodec<unknown> | readonly CandidCodec<unknown>[]
): ret is readonly CandidCodec<unknown>[] {
  return Array.isArray(ret)
}

// ─────────────────────────────────────────────────────────────────────────────
// Service Codec
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Top-level service codec.
 *
 * Produces:
 * - `idlFactory` compatible with `@icp-sdk/core` actor creation
 * - `manifest()` for structured method metadata
 */
export class CandidServiceCodec<
  M extends Record<string, CandidMethodCodec<readonly CandidCodec<unknown>[]>>,
> extends CandidCodec<ServiceActor<M>> {
  readonly kind = "service" as const

  constructor(
    readonly methods: M,
    metadata: CandidMetadata = {}
  ) {
    super(metadata)
  }

  // Service codecs do not have a standalone IDL representation in the
  // same way primitives do. `toIDL()` is here to satisfy the base class
  // but callers should use `idlFactory` instead.
  toIDL(): IDL.Type<ServiceActor<M>> {
    const idlMethods: Record<string, IDL.FuncClass> = {}
    for (const [name, method] of Object.entries(this.methods)) {
      const args = method.argCodecs.map((c) => c.toIDL())
      const rets = method.returnCodecs?.map((c) => c.toIDL()) ?? []
      idlMethods[name] = IDL.Func(args as any, rets as any, method.annotations)
    }
    return IDL.Service(idlMethods) as unknown as IDL.Type<ServiceActor<M>>
  }

  /**
   * An `IDL.InterfaceFactory` compatible with `Actor.createActor()`.
   *
   * Usage:
   * ```ts
   * const actor = Actor.createActor(myService.idlFactory, { ... })
   * ```
   */
  get idlFactory(): IDL.InterfaceFactory {
    // Capture `this` for the closure
    const methods = this.methods
    return (({ IDL: _IDL }: any) => {
      const idlMethods: Record<string, IDL.FuncClass> = {}
      for (const [name, method] of Object.entries(methods)) {
        const args = method.argCodecs.map((c) => c.toIDL())
        const rets = method.returnCodecs?.map((c) => c.toIDL()) ?? []
        idlMethods[name] = _IDL.Func(
          args as any,
          rets as any,
          method.annotations
        )
      }
      return _IDL.Service(idlMethods)
    }) as unknown as IDL.InterfaceFactory
  }

  /**
   * Produce a structured manifest of all methods, arguments, and return types.
   * Useful for form rendering, documentation, AI context, and introspection.
   */
  manifest(): CandidServiceManifest {
    const methods: CandidMethodManifest[] = Object.entries(this.methods).map(
      ([name, method]) => {
        const args: CandidFieldManifest[] = method.argCodecs.map(
          (codec, index) => ({
            name: `arg${index}`,
            kind: (codec as CandidCodec<unknown> & { kind: string }).kind,
            metadata: codec.metadata,
          })
        )

        const returns: CandidFieldManifest[] =
          method.returnCodecs?.map((codec) => ({
            kind: (codec as CandidCodec<unknown> & { kind: string }).kind,
            metadata: codec.metadata,
          })) ?? []

        return {
          name,
          mode: method.mode,
          args,
          returns,
          ...(method.metadata.docs ? { docs: method.metadata.docs } : {}),
        }
      }
    )

    return { methods }
  }

  protected _clone(metadata: CandidMetadata): this {
    return new CandidServiceCodec(this.methods, metadata) as this
  }
}

/**
 * Define a service: `c.service({ method: c.query([...], ret), ... })`.
 */
export function service<
  M extends Record<string, CandidMethodCodec<readonly CandidCodec<unknown>[]>>,
>(methods: M): CandidServiceCodec<M> {
  return new CandidServiceCodec(methods)
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-export type helpers for the `c` namespace
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the actor-like interface type from a service codec.
 *
 * Usage: `type _SERVICE = ServiceOf<typeof myService>`
 */
export type ServiceOf<T> =
  T extends CandidServiceCodec<infer M> ? ServiceActor<M> : never

export type { Infer }
