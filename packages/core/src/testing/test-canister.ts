import { ReplicaRejectCode } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import type {
  ActorMethodParameters,
  ActorMethodReturnType,
  BaseActor,
  FunctionName,
  ReactorParameters,
} from "../types/reactor.js"
import {
  FakeReplicaReject,
  type FakeCallContext,
  type FakeCanister,
} from "./fake-replica.js"

/**
 * Answers one method of a test canister: it receives the method's decoded
 * Candid arguments as a tuple, as `callMethod` takes them, and returns the
 * method's Candid result, or a promise of it. A handler that throws rejects
 * the call as a canister trap does.
 *
 * The arguments and the result are the raw Candid values the canister sees
 * (`bigint`, `Principal`, `[] | [T]` for an `opt`), whichever reactor the
 * test calls through.
 */
export type TestCanisterHandler<A, M extends FunctionName<A>> = (
  args: ActorMethodParameters<A[M]>,
  context: FakeCallContext
) => ActorMethodReturnType<A[M]> | Promise<ActorMethodReturnType<A[M]>>

/**
 * The handlers of a test canister, by method name. A method left out rejects
 * every call to it.
 */
export type TestCanisterHandlers<A> = {
  [M in FunctionName<A>]?: TestCanisterHandler<A, M>
}

/**
 * The function type of a service field, seen through the `IDL.Rec` a
 * recursive func alias (`type f = func (f) -> (f)`) wraps it in.
 */
function funcOf(type: IDL.Type): IDL.FuncClass | undefined {
  let unwrapped: IDL.Type | undefined = type
  while (unwrapped instanceof IDL.RecClass) unwrapped = unwrapped.getType()
  return unwrapped instanceof IDL.FuncClass ? unwrapped : undefined
}

const isQuery = (func: IDL.FuncClass) =>
  func.annotations.includes("query") ||
  func.annotations.includes("composite_query")

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

/**
 * Builds a canister for {@link installFakeReplica} from the service's Candid
 * interface and a handler per method, typed from the service. The fake
 * replica decodes each call's arguments with the interface, runs the
 * method's handler and encodes its result, so the reactor under test encodes,
 * decodes, caches and unwraps exactly as it does against a replica.
 *
 * A query call to a method the interface does not mark `query` or
 * `composite_query` is rejected, as a replica rejects it. A method with no
 * handler rejects every call to it, and a handler for a method the service
 * does not have throws here.
 *
 * Return `{ Err: ... }` from a method that returns a `Result` to test the
 * `CanisterError` a reactor throws for it, and throw from a handler to test
 * the `CallError` a trap produces.
 *
 * @typeParam A - The service type, such as the `_SERVICE` generated with the
 * `idlFactory`. It types each handler's arguments and result.
 * @param idlFactory - The service's Candid interface, as a reactor takes it.
 * @param handlers - The methods the test canister answers.
 * @returns A canister to install under its ID in `installFakeReplica`.
 *
 * @example
 * ```typescript
 * import { createTestCanister, installFakeReplica } from "@ic-reactor/core/testing"
 * import { idlFactory, type _SERVICE } from "./declarations/backend"
 *
 * const balances = new Map<string, bigint>()
 *
 * const replica = installFakeReplica({
 *   canisters: {
 *     "bkyz2-fmaaa-aaaaa-qaaaq-cai": createTestCanister<_SERVICE>(idlFactory, {
 *       // The caller is the principal the agent signed the call as.
 *       balance: (_args, { caller }) => balances.get(caller.toText()) ?? 0n,
 *       deposit: ([amount], { caller }) => {
 *         if (amount === 0n) return { Err: { InvalidAmount: null } }
 *         const next = (balances.get(caller.toText()) ?? 0n) + amount
 *         balances.set(caller.toText(), next)
 *         return { Ok: next }
 *       },
 *     }),
 *   },
 * })
 * ```
 */
export function createTestCanister<A = BaseActor>(
  idlFactory: ReactorParameters["idlFactory"],
  handlers: TestCanisterHandlers<A>
): FakeCanister {
  const service = idlFactory({ IDL }) as IDL.ServiceClass
  const methods = new Map<string, IDL.FuncClass>()
  for (const [name, type] of service._fields) {
    const func = funcOf(type)
    if (func) methods.set(name, func)
  }

  const handlerOf = new Map<
    string,
    (args: unknown[], context: FakeCallContext) => unknown
  >()
  for (const [name, handler] of Object.entries(handlers)) {
    if (!methods.has(name)) {
      throw new Error(
        `createTestCanister: the service has no method "${name}" to handle`
      )
    }
    if (typeof handler === "function") {
      handlerOf.set(
        name,
        handler as (args: unknown[], context: FakeCallContext) => unknown
      )
    }
  }

  const run = async (
    kind: "query" | "update",
    method: string,
    arg: Uint8Array,
    context: FakeCallContext
  ): Promise<Uint8Array> => {
    const func = methods.get(method)
    if (!func || (kind === "query" && !isQuery(func))) {
      throw new FakeReplicaReject(
        ReplicaRejectCode.DestinationInvalid,
        "IC0536",
        `Canister has no ${kind} method '${method}'`
      )
    }
    const handler = handlerOf.get(method)
    if (!handler) {
      throw new FakeReplicaReject(
        ReplicaRejectCode.DestinationInvalid,
        "IC0536",
        `createTestCanister: no handler answers '${method}'`
      )
    }

    const result = await handler(IDL.decode(func.argTypes, arg), context)
    const values =
      func.retTypes.length === 0
        ? []
        : func.retTypes.length === 1
          ? [result]
          : (result as unknown[])
    try {
      return new Uint8Array(IDL.encode(func.retTypes, values))
    } catch (error) {
      throw new Error(
        `the '${method}' handler returned a value its Candid result type ` +
          `does not accept: ${messageOf(error)}`
      )
    }
  }

  return {
    query: (method, arg, context) => run("query", method, arg, context),
    update: (method, arg, context) => run("update", method, arg, context),
  }
}
