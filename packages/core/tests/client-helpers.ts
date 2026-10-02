/**
 * Fixtures for the client tests: a fake replica whose canister answers with
 * the caller it was told about, a browser page, and auths that a test can
 * slow down or renew behind the client's back.
 */
import { QueryResponseStatus, type Identity } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import {
  DelegationChain,
  DelegationIdentity,
  Ed25519KeyIdentity,
} from "@icp-sdk/core/identity"
import { Principal } from "@icp-sdk/core/principal"
import { vi } from "vitest"
import type { AuthLike, Client } from "../src/client.js"
import { internalsOf } from "../src/client.js"
import {
  createFakeReplica,
  type FakeCanister,
  type FakeReplica,
} from "../src/testing/index.js"

/** The anonymous principal, as text. */
export const ANONYMOUS = "2vxsx-fae"

/** The canister every test calls. */
export const CANISTER = "rdmx6-jaaaa-aaaaa-aaadq-cai"

/** What a test names in the context of a call it asks an agent for. */
export const CALL = { method: "whoami", canisterId: CANISTER } as const

const answerWithCaller = (
  _method: string,
  _arg: Uint8Array,
  { caller }: { caller: Principal }
): Uint8Array => new Uint8Array(IDL.encode([IDL.Principal], [caller]))

/** A canister that answers every query and update with the caller it sees. */
export const whoami: FakeCanister = {
  query: answerWithCaller,
  update: answerWithCaller,
}

/** A fake replica running {@link whoami} at {@link CANISTER}. */
export const replicaWithWhoami = (host?: string): FakeReplica =>
  createFakeReplica({
    ...(host && { host }),
    canisters: { [CANISTER]: whoami },
  })

/** The network of `replica`, with its root key given so none is fetched. */
export const networkOf = (replica: FakeReplica) => ({
  host: replica.host,
  rootKey: replica.rootKey,
})

/**
 * Makes the code run in a browser page on an ordinary web host, which is not
 * local, so the `ic_env` cookie is never trusted. Undo with
 * `vi.unstubAllGlobals()`.
 */
export const onPage = (origin = "https://app.example.com"): void => {
  vi.stubGlobal("window", {
    location: { origin, protocol: new URL(origin).protocol },
  })
}

/**
 * Asks `client` for the agent of `principal`, as a read's query function
 * would with the principal captured in its key, and sends a query through
 * it. Resolves with the caller the canister saw.
 */
export async function readAs(
  client: Client,
  principal: string
): Promise<string> {
  const agent = await internalsOf(client).agentFor(principal, CALL)
  const response = await agent.query(CANISTER, {
    methodName: "whoami",
    arg: new Uint8Array(IDL.encode([], [])),
  })
  if (response.status !== QueryResponseStatus.Replied) {
    throw new Error(`the query was rejected with code ${response.reject_code}`)
  }
  return (
    IDL.decode([IDL.Principal], response.reply.arg)[0] as unknown as Principal
  ).toText()
}

/** The callers of the canister requests (`query` and `call`) the replica saw. */
export const callersSeen = (replica: FakeReplica): string[] =>
  replica.requests.flatMap((request) =>
    (request.endpoint === "query" || request.endpoint === "call") &&
    request.caller !== undefined
      ? [request.caller]
      : []
  )

/** A promise and the function that resolves it. */
export function deferred<T = void>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

/** A delegation from `root` to a fresh session key, as a sign-in hands out. */
export async function delegate(
  root: Ed25519KeyIdentity
): Promise<DelegationIdentity> {
  const sessionKey = Ed25519KeyIdentity.generate()
  const chain = await DelegationChain.create(
    root,
    sessionKey.getPublicKey(),
    new Date(Date.now() + 60 * 60_000)
  )
  return DelegationIdentity.fromDelegation(sessionKey, chain)
}

/**
 * `auth`, with its `getIdentity()` replaced by `identity`: a test decides
 * which identity object it hands out, and when.
 */
export const withIdentity = (
  auth: AuthLike,
  identity: () => Promise<Identity>
): AuthLike => ({
  getPrincipal: () => auth.getPrincipal(),
  getStatus: () => auth.getStatus(),
  getIdentity: identity,
  subscribe: (listener) => auth.subscribe(listener),
  signIn: (options) => auth.signIn(options),
  signOut: (options) => auth.signOut(options),
  dispose: () => auth.dispose?.(),
})
