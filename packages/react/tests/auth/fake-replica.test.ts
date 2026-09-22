/**
 * The fake replica refuses what a replica refuses, so a sign-in test that passes
 * through it cannot be hiding a client that signs with the wrong key.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { Actor, HttpAgent, type Identity } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import {
  DelegationChain,
  DelegationIdentity,
  ECDSAKeyIdentity,
  Ed25519KeyIdentity,
} from "@icp-sdk/core/identity"
import { Principal } from "@icp-sdk/core/principal"
import { installFakeReplica, type FakeReplica } from "./fake-replica.js"

const HOST = "http://localhost:4943"
const CANISTER = "rdmx6-jaaaa-aaaaa-aaadq-cai"
const OTHER_CANISTER = "rrkah-fqaaa-aaaaa-aaaaq-cai"

const whoamiInterface: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    whoami: IDL.Func([], [IDL.Principal], []),
    whoami_query: IDL.Func([], [IDL.Principal], ["query"]),
  })

interface Whoami {
  whoami(): Promise<Principal>
  whoami_query(): Promise<Principal>
}

const answerWithCaller = (
  _method: string,
  _arg: Uint8Array,
  { caller }: { caller: Principal }
) => new Uint8Array(IDL.encode([IDL.Principal], [caller]))

let replica: FakeReplica

beforeEach(() => {
  replica = installFakeReplica({
    host: HOST,
    canisters: {
      [CANISTER]: { update: answerWithCaller, query: answerWithCaller },
    },
  })
})

afterEach(() => {
  replica.restore()
})

async function actorAs(identity: Identity) {
  const agent = await HttpAgent.create({
    host: HOST,
    identity,
    shouldFetchRootKey: true,
    // A refusal is final; retrying it only slows the test down.
    retryTimes: 0,
  })
  return Actor.createActor<Whoami>(whoamiInterface, {
    agent,
    canisterId: CANISTER,
  })
}

/** Why the most recent request was refused, if it was. */
const lastRefusal = () => replica.requests[replica.requests.length - 1]?.refused

/** A session key and a chain from a fresh root to it, as sign-in produces. */
async function delegatedSession(targets?: string[]) {
  const root = Ed25519KeyIdentity.generate()
  const session = await ECDSAKeyIdentity.generate()
  const chain = await DelegationChain.create(
    root,
    session.getPublicKey(),
    new Date(Date.now() + 60_000),
    targets
      ? { targets: targets.map((id) => Principal.fromText(id)) }
      : undefined
  )
  return { root, session, chain }
}

describe("fake replica request checks", () => {
  it("accepts calls and queries signed through a delegation, as its root", async () => {
    const { root, session, chain } = await delegatedSession([CANISTER])
    const actor = await actorAs(
      DelegationIdentity.fromDelegation(session, chain)
    )

    expect((await actor.whoami()).toText()).toBe(root.getPrincipal().toText())
    expect((await actor.whoami_query()).toText()).toBe(
      root.getPrincipal().toText()
    )
    expect(replica.requests.filter((request) => request.refused)).toEqual([])
  })

  it("refuses a request signed by a key the delegation does not name", async () => {
    const { chain } = await delegatedSession([CANISTER])
    const impostor = await ECDSAKeyIdentity.generate()
    const actor = await actorAs(
      DelegationIdentity.fromDelegation(impostor, chain)
    )

    await expect(actor.whoami()).rejects.toThrow()
    expect(lastRefusal()).toBe(
      "sender_sig is not the signing key's signature over the request"
    )
  })

  it("refuses a delegation that does not allow calls to the canister", async () => {
    const { session, chain } = await delegatedSession([OTHER_CANISTER])
    const actor = await actorAs(
      DelegationIdentity.fromDelegation(session, chain)
    )

    await expect(actor.whoami()).rejects.toThrow()
    expect(lastRefusal()).toBe(
      `a delegation does not allow calls to ${CANISTER}`
    )
  })

  it("refuses a delegation signed by a key other than the one before it", async () => {
    const { session, chain } = await delegatedSession([CANISTER])
    const forged = DelegationChain.fromDelegations(
      chain.delegations,
      // Claims another root for the same signed delegation.
      Ed25519KeyIdentity.generate().getPublicKey().toDer()
    )
    const actor = await actorAs(
      DelegationIdentity.fromDelegation(session, forged)
    )

    await expect(actor.whoami()).rejects.toThrow()
    expect(lastRefusal()).toBe(
      "a delegation is not signed by the key before it"
    )
  })
})
