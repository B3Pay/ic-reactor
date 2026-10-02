/**
 * Fixtures for the canister tests: fake canisters written in domain values
 * (encoded and decoded with the service schema, as a real canister's Candid
 * would be), an ICRC-1 ledger that keeps balances, and clients on a fake
 * replica.
 *
 * Every test runs the real client against `createFakeReplica`, which signs
 * and verifies like a replica; nothing global is stubbed but the page a
 * browser test runs in.
 */
import {
  serviceMethods,
  type Principal,
  type Schema,
} from "@candid-core/schema"
import { decodeArgs, encodeArgs } from "@candid-core/schema/codec"
import type { Identity } from "@icp-sdk/core/agent"
import { vi } from "vitest"
import { createClient, type AuthLike, type Client } from "../src/client.js"
import type { ArgsOf, ReplyOf } from "../src/types.js"
import {
  createFakeReplica,
  type FakeCallContext,
  type FakeCanister,
  type FakeReplica,
  type FakeReplicaRequest,
} from "../src/testing/index.js"
import * as icrc1 from "./fixtures/icrc1.js"

export { ANONYMOUS, deferred, networkOf, onPage } from "./client-helpers.js"

/** The canister ids the tests run their fakes at. */
export const LEDGER = "ryjl3-tyaaa-aaaaa-aaaba-cai"
export const SHAPES = "rrkah-fqaaa-aaaaa-aaaaq-cai"
export const ARCHIVE = "qoctq-giaaa-aaaaa-aaaea-cai"
export const MANAGEMENT = "aaaaa-aa"

/** What a fake method is told about its call. */
export interface CallContext {
  /** The caller the replica checked, as text. */
  readonly caller: string
}

/** A fake method: the decoded arguments in, the reply (before any unwrapping) out. */
export type Handlers<A> = {
  readonly [K in keyof A]?: (
    args: ArgsOf<A[K]>,
    context: CallContext
  ) => ReplyOf<A[K]> | Promise<ReplyOf<A[K]>>
}

/**
 * A fake canister for `service` that runs `handlers` with decoded arguments
 * and encodes what they return with the method's result schemas: the value
 * for one result, the tuple for several, nothing for none. It answers both
 * queries and calls, so a test can send a query method as a replicated call.
 */
export function serve<A>(
  service: Schema<Principal>,
  handlers: Handlers<A>
): FakeCanister {
  const methods = serviceMethods(service)
  const run = async (
    name: string,
    arg: Uint8Array,
    { caller }: FakeCallContext
  ): Promise<Uint8Array> => {
    const method = methods.get(name)
    const handler = (
      handlers as Record<
        string,
        ((args: unknown[], context: CallContext) => unknown) | undefined
      >
    )[name]
    if (method === undefined || handler === undefined) {
      throw new Error(`the test canister has no handler for ${name}`)
    }
    const decoded = decodeArgs(method.args, arg)
    if (!decoded.ok) {
      throw new Error(
        `the test canister could not decode the arguments of ${name}: ${JSON.stringify(decoded.issues)}`
      )
    }
    const reply = await handler([...decoded.values], {
      caller: caller.toText(),
    })
    const values =
      method.results.length === 0
        ? []
        : method.results.length === 1
          ? [reply]
          : (reply as unknown[])
    const encoded = encodeArgs(method.results, values)
    if (!encoded.ok) {
      throw new Error(
        `the test canister could not encode the reply of ${name}: ${JSON.stringify(encoded.issues)}`
      )
    }
    return encoded.bytes
  }
  return { query: run, update: run }
}

/** The ledger's transfer fee. */
export const FEE = 10_000n

/** A fake ICRC-1 ledger: balances by owner, transfers debit the caller. */
export function ledgerCanister(balances: Map<string, bigint>) {
  const balanceOf = (owner: string) => balances.get(owner) ?? 0n
  return serve<icrc1.Actor>(icrc1.actor, {
    icrc1_balance_of: ([account]) => balanceOf(account.owner),
    icrc1_fee: () => FEE,
    icrc1_decimals: () => 8,
    icrc1_symbol: () => "ICP",
    icrc1_minting_account: () => null,
    icrc1_transfer: ([arg], { caller }) => {
      const debit = arg.amount + FEE
      const balance = balanceOf(caller)
      if (balance < debit) {
        return {
          tag: "Err",
          value: { tag: "InsufficientFunds", value: { balance } },
        }
      }
      balances.set(caller, balance - debit)
      balances.set(arg.to.owner, balanceOf(arg.to.owner) + arg.amount)
      return { tag: "Ok", value: 7n }
    },
  })
}

/** The canister requests (`query` and `call`) the replica saw, in order. */
export const canisterRequests = (replica: FakeReplica): FakeReplicaRequest[] =>
  replica.requests.filter(
    (request) => request.endpoint === "query" || request.endpoint === "call"
  )

/** The canister requests for `method`. */
export const requestsFor = (replica: FakeReplica, method: string) =>
  canisterRequests(replica).filter((request) => request.methodName === method)

/** A client on `replica` that calls as `identity`. Runs where the test runs (Node: a server). */
export const clientAs = (
  replica: FakeReplica,
  identity: Identity | "anonymous",
  options: { maxDepth?: number } = {}
): Client =>
  createClient({
    network: { host: replica.host, rootKey: replica.rootKey },
    fetch: replica.fetch,
    identity,
    ...options,
  })

/** A client on `replica` in a browser page, signed in through `auth`. */
export const clientWithAuth = (
  replica: FakeReplica,
  auth: AuthLike
): Client => {
  vi.stubGlobal("window", {
    location: {
      origin: "https://app.example.com",
      protocol: "https:",
    },
  })
  return createClient({
    network: { host: replica.host, rootKey: replica.rootKey },
    fetch: replica.fetch,
    auth: () => auth,
  })
}

/** A fake replica running `canisters`. */
export const replicaWith = (canisters: Record<string, FakeCanister>) =>
  createFakeReplica({ canisters })

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))
