/**
 * `createFakeReplica`, the fake replica behind `createTestClient` (internal:
 * the testing entry exports only `createTestClient`): a fake replica an
 * `HttpAgent` is given as its `fetch`, so nothing global is stubbed.
 *
 * It refuses what a replica refuses, so a test that passes through it cannot
 * be hiding a client that signs with the wrong key; it rejects a call whose
 * handler throws as a replica rejects a trap, once, rather than failing the
 * HTTP request the agent then retries; it answers only its own host, so an
 * agent built for another fails at once; and it can fail a call the way a
 * network does: with a reject code, a lost reply or an HTTP refusal.
 *
 * The agents here are raw `HttpAgent`s, and the canisters speak bytes, so the
 * tests read the errors as `@icp-sdk/core` raises them, by `kind`, code name
 * and reject code or HTTP status, which is how a classifier has to read them.
 */
import { describe, it, expect, afterEach, vi } from "vitest"
import {
  Actor,
  ErrorKindEnum,
  HttpAgent,
  QueryResponseStatus,
  SignIdentity,
  type HttpAgentOptions,
  type PublicKey,
  type Signature,
} from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import {
  DelegationChain,
  DelegationIdentity,
  ECDSAKeyIdentity,
  Ed25519KeyIdentity,
} from "@icp-sdk/core/identity"
import { Secp256k1KeyIdentity } from "@icp-sdk/core/identity/secp256k1"
import { Principal } from "@icp-sdk/core/principal"
import {
  createFakeReplica,
  type FakeCanister,
  type FakeReplica,
} from "../src/testing/fake-replica.js"

const CANISTER = "rdmx6-jaaaa-aaaaa-aaadq-cai"
const OTHER_CANISTER = "rrkah-fqaaa-aaaaa-aaaaq-cai"
const DEFAULT_HOST = "http://127.0.0.1:4943"

// A fake replica is handed to agents, never installed: whatever a test does,
// the global `fetch` is the one the file started with.
const originalFetch = globalThis.fetch
afterEach(() => {
  expect(globalThis.fetch).toBe(originalFetch)
})

const EMPTY_ARG = new Uint8Array(IDL.encode([], []))
const encodeCaller = (caller: Principal) =>
  new Uint8Array(IDL.encode([IDL.Principal], [caller]))
const decodeCaller = (reply: Uint8Array) =>
  IDL.decode([IDL.Principal], reply)[0] as unknown as Principal

const answerWithCaller: NonNullable<FakeCanister["update"]> = (
  _method,
  _arg,
  { caller }
) => encodeCaller(caller)

/** The reply, as text, of a canister that answers with a fixed string. */
const answerWithText = (text: string) => () =>
  new Uint8Array(IDL.encode([IDL.Text], [text]))
const decodeText = (reply: Uint8Array) =>
  IDL.decode([IDL.Text], reply)[0] as string

const whoamiInterface: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({ whoami_query: IDL.Func([], [IDL.Principal], ["query"]) })

type NodeKeyStore = NonNullable<HttpAgentOptions["subnetNodeKeyExpirableStore"]>

/**
 * A store of node keys for one agent. By default an agent shares one per host
 * through IndexedDB, which the test setup installs.
 */
function nodeKeysOfOneAgent(): NodeKeyStore {
  const entries = new Map<string, Parameters<NodeKeyStore["set"]>[1]>()
  return {
    expirationTime: 60_000,
    get: (key) => Promise.resolve(entries.get(key)),
    set: (key, value) => {
      entries.set(key, value)
      return Promise.resolve()
    },
    delete: (key) => {
      entries.delete(key)
      return Promise.resolve()
    },
  }
}

/** An agent that talks to `replica`, and only to it. */
function agentOn(
  replica: FakeReplica,
  options: Partial<HttpAgentOptions> = {}
): HttpAgent {
  return HttpAgent.createSync({
    host: replica.host,
    fetch: replica.fetch,
    rootKey: replica.rootKey,
    // A refusal is final; retrying it only slows the test down.
    retryTimes: 0,
    subnetNodeKeyExpirableStore: nodeKeysOfOneAgent(),
    ...options,
  })
}

/** Retries at once, so a test can count what an agent re-sends. */
const retriesAtOnce = (retryTimes: number): Partial<HttpAgentOptions> => ({
  retryTimes,
  backoffStrategy: () => ({ next: () => 0 }),
})

const update = (
  agent: HttpAgent,
  methodName = "whoami",
  canisterId = CANISTER
) => agent.update(canisterId, { methodName, arg: EMPTY_ARG })

/** The reply of a query that is answered, as the agent hands it over. */
async function queryReply(
  agent: HttpAgent,
  methodName = "whoami_query",
  canisterId = CANISTER
) {
  const response = await agent.query(canisterId, {
    methodName,
    arg: EMPTY_ARG,
  })
  if (response.status !== QueryResponseStatus.Replied) {
    throw new Error(`the query was rejected with code ${response.reject_code}`)
  }
  return response.reply.arg
}

/** What an agent call rejects with. */
const rejection = (call: Promise<unknown>): Promise<unknown> =>
  call.then(
    () => {
      throw new Error("expected the call to reject")
    },
    (error: unknown) => error
  )

/**
 * What a classifier reads off an `@icp-sdk/core` error: structurally, by
 * `kind` and the code's `name`, never by `instanceof`, so that an error from
 * another copy of the SDK reads the same.
 */
function shapeOf(error: unknown) {
  const { kind, code } = error as {
    kind?: unknown
    code?: {
      name?: unknown
      rejectCode?: unknown
      rejectMessage?: unknown
      rejectErrorCode?: unknown
      status?: unknown
    }
  }
  return {
    kind,
    code: code?.name,
    rejectCode: code?.rejectCode,
    rejectMessage: code?.rejectMessage,
    rejectErrorCode: code?.rejectErrorCode,
    status: code?.status,
  }
}

describe("a fake replica an agent is given as its fetch", () => {
  it("answers update calls and queries through agent.update and agent.query", async () => {
    const identity = Ed25519KeyIdentity.generate()
    const replica = createFakeReplica({
      canisters: {
        [CANISTER]: { update: answerWithCaller, query: answerWithCaller },
      },
    })
    const agent = agentOn(replica, { identity })

    const updated = await update(agent)
    const queried = await queryReply(agent)

    expect(decodeCaller(updated.reply).toText()).toBe(
      identity.getPrincipal().toText()
    )
    expect(decodeCaller(queried).toText()).toBe(
      identity.getPrincipal().toText()
    )
    expect(
      replica.requests.filter((request) => request.methodName)
    ).toMatchObject([
      { endpoint: "call", canisterId: CANISTER, methodName: "whoami" },
      { endpoint: "query", canisterId: CANISTER, methodName: "whoami_query" },
    ])
  })

  it("serves an agent that fetches its root key, as it does from a local replica", async () => {
    const replica = createFakeReplica({
      canisters: { [CANISTER]: { query: answerWithCaller } },
    })
    const agent = HttpAgent.createSync({
      host: replica.host,
      fetch: replica.fetch,
      shouldFetchRootKey: true,
      retryTimes: 0,
      subnetNodeKeyExpirableStore: nodeKeysOfOneAgent(),
    })

    expect(await agent.fetchRootKey()).toEqual(replica.rootKey)
    expect(decodeCaller(await queryReply(agent)).isAnonymous()).toBe(true)
    expect(replica.requests[0]).toEqual({ endpoint: "status" })
  })

  it("never reaches the global fetch", async () => {
    const spy = vi.spyOn(globalThis, "fetch")
    try {
      const replica = createFakeReplica({
        canisters: { [CANISTER]: { update: answerWithCaller } },
      })
      await update(agentOn(replica))

      expect(spy).not.toHaveBeenCalled()
      expect(replica.requests.length).toBeGreaterThan(0)
    } finally {
      spy.mockRestore()
    }
  })

  it("has no state of a fake created before it", async () => {
    // A fake made earlier, and left running, does not see this one's calls.
    const earlier = createFakeReplica({
      canisters: { [CANISTER]: { query: answerWithCaller } },
    })
    const replica = createFakeReplica({
      canisters: { [CANISTER]: { query: answerWithCaller } },
    })

    await queryReply(agentOn(replica))

    expect(earlier.requests).toEqual([])
    expect(replica.requests.length).toBeGreaterThan(0)
  })
})

describe("two fake replicas in one process", () => {
  /** A canister that counts its calls and answers with its fake's name. */
  function namedCanister(name: string) {
    const state = { updates: 0 }
    const canister: FakeCanister = {
      query: answerWithText(name),
      update() {
        state.updates += 1
        return new Uint8Array(
          IDL.encode([IDL.Text], [`${name} #${state.updates}`])
        )
      },
    }
    return { state, canister }
  }

  it("each sign with a root key of their own", () => {
    const first = createFakeReplica()
    const second = createFakeReplica()

    expect(first.rootKey).not.toEqual(second.rootKey)
  })

  it("serve two agents on one host with no crosstalk", async () => {
    // The same host on purpose: an injected fetch does not depend on it.
    const a = namedCanister("alpha")
    const b = namedCanister("beta")
    const alpha = createFakeReplica({ canisters: { [CANISTER]: a.canister } })
    const beta = createFakeReplica({ canisters: { [CANISTER]: b.canister } })
    expect(alpha.host).toBe(beta.host)
    const agentA = agentOn(alpha)
    const agentB = agentOn(beta)

    const [queryA, queryB, updateA, updateB] = await Promise.all([
      queryReply(agentA, "greet"),
      queryReply(agentB, "greet"),
      update(agentA, "bump"),
      update(agentB, "bump"),
    ])

    expect(decodeText(queryA)).toBe("alpha")
    expect(decodeText(queryB)).toBe("beta")
    expect(decodeText(updateA.reply)).toBe("alpha #1")
    expect(decodeText(updateB.reply)).toBe("beta #1")
    // Each fake ran its own canister once and logged only its own requests.
    expect([a.state.updates, b.state.updates]).toEqual([1, 1])
    const calls = (replica: FakeReplica) =>
      replica.requests.filter((request) => request.methodName)
    expect(calls(alpha)).toHaveLength(2)
    expect(calls(beta)).toHaveLength(2)
  })

  it("serve agents that share the default node-key store, which refresh what the other fake cached", async () => {
    // The agent caches a subnet's node keys under a name that holds only the
    // host, so two fakes on one host share the cache. Their node keys differ,
    // so the agent finds the cached ones do not verify and reads fresh ones.
    const alpha = createFakeReplica({
      canisters: { [CANISTER]: { query: answerWithText("alpha") } },
    })
    const beta = createFakeReplica({
      canisters: { [CANISTER]: { query: answerWithText("beta") } },
    })
    const shared = (replica: FakeReplica) =>
      HttpAgent.createSync({
        host: replica.host,
        fetch: replica.fetch,
        rootKey: replica.rootKey,
        retryTimes: 0,
      })

    expect(decodeText(await queryReply(shared(alpha), "greet"))).toBe("alpha")
    expect(decodeText(await queryReply(shared(beta), "greet"))).toBe("beta")
    expect(decodeText(await queryReply(shared(alpha), "greet"))).toBe("alpha")
  })

  it("answer an agent that holds the other's root key with a certificate it rejects", async () => {
    const alpha = createFakeReplica({
      canisters: { [CANISTER]: { update: answerWithCaller } },
    })
    const beta = createFakeReplica()
    // Alpha's answers, checked against beta's root key.
    const agent = agentOn(alpha, { rootKey: beta.rootKey })

    const error = await rejection(update(agent))

    expect(shapeOf(error).kind).toBe(ErrorKindEnum.Trust)
    // Control: the right root key accepts the same fake.
    await expect(update(agentOn(alpha))).resolves.toBeDefined()
  })

  it("keep their own canisters: one does not run what only the other has", async () => {
    const alpha = createFakeReplica({
      canisters: { [CANISTER]: { query: answerWithText("alpha") } },
    })
    const beta = createFakeReplica({
      canisters: { [OTHER_CANISTER]: { query: answerWithText("beta") } },
    })

    const response = await agentOn(beta).query(CANISTER, {
      methodName: "greet",
      arg: EMPTY_ARG,
    })

    expect(response).toMatchObject({
      status: QueryResponseStatus.Rejected,
      reject_code: 3,
    })
    expect(decodeText(await queryReply(agentOn(alpha), "greet"))).toBe("alpha")
  })
})

describe("the fake replica's request checks", () => {
  const trace = { runs: 0 }
  const countingCaller: FakeCanister["update"] = (method, arg, context) => {
    trace.runs += 1
    return answerWithCaller(method, arg, context)
  }

  function replicaForChecks() {
    trace.runs = 0
    return createFakeReplica({
      canisters: {
        [CANISTER]: { update: countingCaller, query: countingCaller },
      },
    })
  }

  /** Why the most recent request was refused, if it was. */
  const lastRefusal = (replica: FakeReplica) =>
    replica.requests[replica.requests.length - 1]?.refused

  /** A session key and a chain from a fresh root to it, as sign-in makes. */
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

  /** Signs with its own key, and claims another principal as the sender. */
  class ForgedSender extends SignIdentity {
    private readonly key = Ed25519KeyIdentity.generate()
    constructor(private readonly claimed: Principal) {
      super()
    }
    getPublicKey(): PublicKey {
      return this.key.getPublicKey()
    }
    sign(blob: Uint8Array): Promise<Signature> {
      return this.key.sign(blob)
    }
    override getPrincipal(): Principal {
      return this.claimed
    }
  }

  it("refuses a forged sender before any canister sees it", async () => {
    // The request is signed, and its signature verifies against the key it
    // carries, but the principal it claims is not that key's.
    const replica = replicaForChecks()
    const victim = Ed25519KeyIdentity.generate().getPrincipal()
    const agent = agentOn(replica, { identity: new ForgedSender(victim) })

    const updated = await rejection(update(agent))
    expect(shapeOf(updated)).toMatchObject({
      kind: ErrorKindEnum.Protocol,
      code: "HttpErrorCode",
      status: 400,
    })
    expect(lastRefusal(replica)).toBe(
      "the sender is not the principal of sender_pubkey"
    )

    const queried = await rejection(queryReply(agent))
    expect(shapeOf(queried)).toMatchObject({
      kind: ErrorKindEnum.Protocol,
      status: 400,
    })
    expect(lastRefusal(replica)).toBe(
      "the sender is not the principal of sender_pubkey"
    )
    expect(trace.runs).toBe(0)
  })

  it("answers an honest sender to the same canister as that sender", async () => {
    const replica = replicaForChecks()
    const identity = Ed25519KeyIdentity.generate()

    const answer = await update(agentOn(replica, { identity }))

    expect(decodeCaller(answer.reply).toText()).toBe(
      identity.getPrincipal().toText()
    )
    expect(trace.runs).toBe(1)
  })

  it("accepts calls and queries signed through a delegation, as its root", async () => {
    const replica = replicaForChecks()
    const { root, session, chain } = await delegatedSession([CANISTER])
    const agent = agentOn(replica, {
      identity: DelegationIdentity.fromDelegation(session, chain),
    })

    expect(decodeCaller((await update(agent)).reply).toText()).toBe(
      root.getPrincipal().toText()
    )
    expect(decodeCaller(await queryReply(agent)).toText()).toBe(
      root.getPrincipal().toText()
    )
    expect(replica.requests.filter((request) => request.refused)).toEqual([])
    expect(
      replica.requests
        .filter((request) => request.methodName)
        .map((request) => request.caller)
    ).toEqual([root.getPrincipal().toText(), root.getPrincipal().toText()])
  })

  it.each([
    ["Ed25519", () => Ed25519KeyIdentity.generate()],
    ["ECDSA P-256", () => ECDSAKeyIdentity.generate()],
    ["secp256k1", () => Secp256k1KeyIdentity.generate()],
  ])("accepts calls signed by an %s key", async (_, generate) => {
    const identity = await generate()
    const agent = agentOn(replicaForChecks(), { identity })

    expect(decodeCaller((await update(agent)).reply).toText()).toBe(
      identity.getPrincipal().toText()
    )
  })

  it("answers an anonymous call as the anonymous principal", async () => {
    const agent = agentOn(replicaForChecks())

    expect(decodeCaller(await queryReply(agent)).isAnonymous()).toBe(true)
  })

  it("refuses a request signed by a key the delegation does not name", async () => {
    const replica = replicaForChecks()
    const { chain } = await delegatedSession([CANISTER])
    const impostor = await ECDSAKeyIdentity.generate()
    const agent = agentOn(replica, {
      identity: DelegationIdentity.fromDelegation(impostor, chain),
    })

    await expect(update(agent)).rejects.toThrow()
    expect(lastRefusal(replica)).toBe(
      "sender_sig is not the signing key's signature over the request"
    )
    expect(trace.runs).toBe(0)
  })

  it("refuses a delegation that does not allow calls to the canister", async () => {
    const replica = replicaForChecks()
    const { session, chain } = await delegatedSession([OTHER_CANISTER])
    const agent = agentOn(replica, {
      identity: DelegationIdentity.fromDelegation(session, chain),
    })

    await expect(update(agent)).rejects.toThrow()
    expect(lastRefusal(replica)).toBe(
      `a delegation does not allow calls to ${CANISTER}`
    )
  })

  it("refuses a delegation signed by a key other than the one before it", async () => {
    const replica = replicaForChecks()
    const { session, chain } = await delegatedSession([CANISTER])
    const forged = DelegationChain.fromDelegations(
      chain.delegations,
      // Claims another root for the same signed delegation.
      Ed25519KeyIdentity.generate().getPublicKey().toDer()
    )
    const agent = agentOn(replica, {
      identity: DelegationIdentity.fromDelegation(session, forged),
    })

    await expect(update(agent)).rejects.toThrow()
    expect(lastRefusal(replica)).toBe(
      "a delegation is not signed by the key before it"
    )
  })

  it("refuses a request signed by a kind of key it cannot check, and says so", async () => {
    const replica = replicaForChecks()
    // A key under an algorithm identifier none of the three it checks use.
    const der = new Uint8Array([0x30, 0x0a, 0x30, 0x03, 0x06, 0x01, 0x2a, 1])
    class UnknownKeyIdentity extends SignIdentity {
      getPublicKey(): PublicKey {
        return { toDer: () => der, rawKey: der, derKey: der } as PublicKey
      }
      sign(): Promise<Signature> {
        return Promise.resolve(new Uint8Array(64) as Signature)
      }
    }
    const agent = agentOn(replica, { identity: new UnknownKeyIdentity() })

    await expect(update(agent)).rejects.toThrow()
    expect(lastRefusal(replica)).toBe(
      "the request is signed by a kind of key the fake replica cannot check"
    )
  })
})

describe("a canister call the fake replica rejects", () => {
  function trappingReplica() {
    const trace = { runs: 0 }
    const trap = () => {
      trace.runs += 1
      throw new Error("the canister is broken")
    }
    const replica = createFakeReplica({
      canisters: { [CANISTER]: { query: trap, update: trap } },
    })
    return { replica, trace }
  }

  it("rejects an update as a trap, once, when its handler throws", async () => {
    // The agent retries an HTTP failure three times by default, so a handler
    // failure answered as one ran the canister four times.
    const { replica, trace } = trappingReplica()
    const agent = agentOn(replica, retriesAtOnce(3))

    const error = await rejection(update(agent))

    expect(shapeOf(error)).toMatchObject({
      kind: ErrorKindEnum.Reject,
      code: "CertifiedRejectErrorCode",
      rejectCode: 5,
      rejectErrorCode: "IC0503",
      rejectMessage: `Canister ${CANISTER} trapped: the canister is broken`,
    })
    expect(trace.runs).toBe(1)
  })

  it("rejects a query as a trap, once, when its handler throws", async () => {
    const { replica, trace } = trappingReplica()
    const agent = agentOn(replica, retriesAtOnce(3))

    const response = await agent.query(CANISTER, {
      methodName: "whoami_query",
      arg: EMPTY_ARG,
    })

    expect(response).toMatchObject({
      status: QueryResponseStatus.Rejected,
      reject_code: 5,
      error_code: "IC0503",
      reject_message: `Canister ${CANISTER} trapped: the canister is broken`,
    })
    expect(trace.runs).toBe(1)
  })

  it("rejects a call to a canister it does not run", async () => {
    const replica = createFakeReplica({
      canisters: { [CANISTER]: { query: answerWithCaller } },
    })
    const agent = agentOn(replica)

    const error = await rejection(update(agent, "whoami", OTHER_CANISTER))
    expect(shapeOf(error)).toMatchObject({
      kind: ErrorKindEnum.Reject,
      rejectCode: 3,
      rejectErrorCode: "IC0301",
    })
    expect(shapeOf(error).rejectMessage).toContain(
      `no canister is installed at ${OTHER_CANISTER}`
    )
    expect(
      await agent.query(OTHER_CANISTER, {
        methodName: "whoami_query",
        arg: EMPTY_ARG,
      })
    ).toMatchObject({ status: QueryResponseStatus.Rejected, reject_code: 3 })
  })

  it("routes a call to the canister it names, not the effective canister", async () => {
    // `effectiveCanisterId` only picks the subnet a request goes through, as
    // for a management canister call. The canister named in the request
    // answers it.
    const answerWith = (id: string) => () =>
      encodeCaller(Principal.fromText(id))
    const replica = createFakeReplica({
      canisters: {
        [CANISTER]: {
          query: answerWith(CANISTER),
          update: answerWith(CANISTER),
        },
        [OTHER_CANISTER]: {
          query: answerWith(OTHER_CANISTER),
          update: answerWith(OTHER_CANISTER),
        },
      },
    })
    const agent = agentOn(replica)
    const effectiveCanisterId = Principal.fromText(OTHER_CANISTER)

    const updated = await agent.update(CANISTER, {
      methodName: "whoami",
      arg: EMPTY_ARG,
      effectiveCanisterId,
    })
    const queried = await agent.query(CANISTER, {
      methodName: "whoami_query",
      arg: EMPTY_ARG,
      effectiveCanisterId,
    })

    expect(decodeCaller(updated.reply).toText()).toBe(CANISTER)
    expect(queried).toMatchObject({ status: QueryResponseStatus.Replied })
    expect(
      replica.requests
        .filter((request) => request.methodName)
        .map((request) => request.canisterId)
    ).toEqual([CANISTER, CANISTER])
    // The log keeps the effective canister id too, so a test can tell which
    // one a client chose.
    expect(
      replica.requests
        .filter((request) => request.methodName)
        .map((request) => request.effectiveCanisterId)
    ).toEqual([OTHER_CANISTER, OTHER_CANISTER])
  })

  it("logs the canister a request is addressed to as its effective canister id by default", async () => {
    const replica = createFakeReplica({
      canisters: { [CANISTER]: { update: answerWithCaller } },
    })
    const agent = agentOn(replica)

    await update(agent)
    await agent.readState(
      { canisterId: Principal.fromText(CANISTER) },
      { paths: [[new TextEncoder().encode("time")]] }
    )

    const requests = replica.requests.filter(
      (request) => request.endpoint !== "status"
    )
    expect(requests.map((request) => request.endpoint)).toContain("call")
    expect(requests.map((request) => request.endpoint)).toContain("read_state")
    for (const request of requests) {
      expect(request).toMatchObject({
        canisterId: CANISTER,
        effectiveCanisterId: CANISTER,
      })
    }
  })

  it("tells a management canister call from the canister it is routed by", async () => {
    // A call to `aaaaa-aa` is routed by a canister its arguments name, which
    // the client picks: the log has to show that choice, or a test cannot
    // tell a right pick from a wrong one.
    const management = "aaaaa-aa"
    const replica = createFakeReplica({
      canisters: { [management]: { update: answerWithText("managed") } },
    })
    const agent = agentOn(replica)

    const reply = await agent.update(management, {
      methodName: "canister_status",
      arg: EMPTY_ARG,
      effectiveCanisterId: Principal.fromText(CANISTER),
    })

    expect(decodeText(reply.reply)).toBe("managed")
    const call = replica.requests.find((request) => request.endpoint === "call")
    expect(call).toMatchObject({
      canisterId: management,
      effectiveCanisterId: CANISTER,
      methodName: "canister_status",
    })
  })

  it("rejects the calls a canister without a handler for them receives", async () => {
    const replica = createFakeReplica({ canisters: { [CANISTER]: {} } })
    const agent = agentOn(replica)

    const queried = await agent.query(CANISTER, {
      methodName: "whoami_query",
      arg: EMPTY_ARG,
    })
    expect(queried).toMatchObject({ status: QueryResponseStatus.Rejected })
    expect((queried as { reject_message: string }).reject_message).toContain(
      `canister ${CANISTER} answers no queries`
    )
    await expect(update(agent)).rejects.toThrow(
      `canister ${CANISTER} answers no update calls`
    )
  })

  it("runs a canister added after it was created", async () => {
    const replica = createFakeReplica()
    const agent = agentOn(replica)
    const before = await agent.query(CANISTER, {
      methodName: "greet",
      arg: EMPTY_ARG,
    })
    expect(before).toMatchObject({ status: QueryResponseStatus.Rejected })

    replica.addCanister(CANISTER, { query: answerWithText("first") })
    expect(decodeText(await queryReply(agent, "greet"))).toBe("first")
    replica.addCanister(CANISTER, { query: answerWithText("second") })
    expect(decodeText(await queryReply(agent, "greet"))).toBe("second")
  })
})

describe("the fault hooks", () => {
  /** A canister whose update and query handlers count their runs. */
  function countingReplica(handlers: Partial<FakeCanister> = {}): {
    replica: FakeReplica
    runs: { update: number; query: number }
  } {
    const runs = { update: 0, query: 0 }
    const replica: FakeReplica = createFakeReplica({
      canisters: {
        [CANISTER]: {
          update: (...args) => {
            runs.update += 1
            return (handlers.update ?? answerWithCaller)(...args)
          },
          query: (...args) => {
            runs.query += 1
            return (handlers.query ?? answerWithCaller)(...args)
          },
        },
      },
    })
    return { replica, runs }
  }

  describe("reject", () => {
    const CODES = [1, 2, 3, 4, 5, 6] as const

    it.each(CODES)(
      "reject(%i) from an update reaches the agent as a certified reject with that code",
      async (code) => {
        const { replica, runs } = countingReplica({
          update: () => replica.reject(code, `no: ${code}`),
        })
        const agent = agentOn(replica, retriesAtOnce(3))

        const error = await rejection(update(agent))

        expect(shapeOf(error)).toMatchObject({
          kind: ErrorKindEnum.Reject,
          code: "CertifiedRejectErrorCode",
          rejectCode: code,
          rejectMessage: `no: ${code}`,
        })
        // A reject is an answer, not a failed request: no retry re-ran it.
        expect(runs.update).toBe(1)
      }
    )

    it.each(CODES)(
      "reject(%i) from a query reaches the agent as a rejected query with that code",
      async (code) => {
        const { replica, runs } = countingReplica({
          query: () => replica.reject(code, `no: ${code}`),
        })
        const agent = agentOn(replica, retriesAtOnce(3))

        // The agent hands a rejected query back, signed, rather than throwing.
        const response = await agent.query(CANISTER, {
          methodName: "whoami_query",
          arg: EMPTY_ARG,
        })
        expect(response).toMatchObject({
          status: QueryResponseStatus.Rejected,
          reject_code: code,
          reject_message: `no: ${code}`,
        })

        // An actor raises it as the error a classifier reads.
        const actor = Actor.createActor<{ whoami_query(): Promise<Principal> }>(
          whoamiInterface,
          { agent, canisterId: CANISTER }
        )
        const error = await rejection(actor.whoami_query())
        expect(shapeOf(error)).toMatchObject({
          kind: ErrorKindEnum.Reject,
          code: "UncertifiedRejectErrorCode",
          rejectCode: code,
          rejectMessage: `no: ${code}`,
        })
        expect(runs.query).toBe(2)
      }
    )

    it("names the reject code when no message is given", async () => {
      const { replica } = countingReplica({
        update: () => replica.reject(2),
      })

      const error = await rejection(update(agentOn(replica)))

      expect(shapeOf(error).rejectMessage).toBe(
        "fake replica: the canister rejected the call with reject code 2 (SYS_TRANSIENT)"
      )
    })

    it("sends no error code, as a reject that is not a trap has none", async () => {
      const { replica } = countingReplica({
        update: () => replica.reject(4, "declined"),
      })

      const error = await rejection(update(agentOn(replica)))

      expect(shapeOf(error).rejectErrorCode).toBeUndefined()
    })

    it("leaves the next call to the canister's own handler", async () => {
      let reject = true
      const { replica } = countingReplica({
        update: (method, arg, context) => {
          if (reject) replica.reject(4)
          return answerWithCaller(method, arg, context)
        },
      })
      const agent = agentOn(replica)

      await expect(update(agent)).rejects.toThrow()
      reject = false
      await expect(update(agent)).resolves.toBeDefined()
    })
  })

  describe("dropNextReply", () => {
    it("runs the update and then fails the agent with a network error", async () => {
      const { replica, runs } = countingReplica()
      const agent = agentOn(replica)
      replica.dropNextReply()

      const error = await rejection(update(agent))

      expect(shapeOf(error)).toMatchObject({
        kind: ErrorKindEnum.Transport,
        code: "HttpFetchErrorCode",
      })
      // The canister ran, so the call may have had its effect.
      expect(runs.update).toBe(1)
      expect(replica.requests.filter((r) => r.endpoint === "call")).toEqual([
        expect.objectContaining({ methodName: "whoami", dropped: true }),
      ])
    })

    it("runs the update once however often the agent re-sends it", async () => {
      // The re-sends carry the same request id, which the fake remembers as
      // lost: they fail the same way and run nothing.
      const { replica, runs } = countingReplica()
      const agent = agentOn(replica, retriesAtOnce(3))
      replica.dropNextReply()

      const error = await rejection(update(agent))

      expect(shapeOf(error).kind).toBe(ErrorKindEnum.Transport)
      expect(runs.update).toBe(1)
      const calls = replica.requests.filter((r) => r.endpoint === "call")
      expect(calls).toHaveLength(4)
      expect(calls.every((call) => call.dropped)).toBe(true)
    })

    it("fails a read of the lost call's status the same way", async () => {
      // A real replica would still answer it; the fake keeps the call
      // outcome-unknown, as a partition for that request id does.
      const { replica } = countingReplica()
      const agent = agentOn(replica)
      replica.dropNextReply()
      const error = await rejection(update(agent))
      const { requestId } = (
        error as { code: { requestContext: { requestId: Uint8Array } } }
      ).code.requestContext

      const read = await rejection(
        agent.readState(
          { canisterId: Principal.fromText(CANISTER) },
          {
            paths: [[new TextEncoder().encode("request_status"), requestId]],
          }
        )
      )

      expect(shapeOf(read)).toMatchObject({
        kind: ErrorKindEnum.Transport,
        code: "HttpFetchErrorCode",
      })
      expect(replica.requests[replica.requests.length - 1]).toMatchObject({
        endpoint: "read_state",
        dropped: true,
      })
    })

    it("loses only the next update, and leaves queries alone", async () => {
      const { replica, runs } = countingReplica()
      const agent = agentOn(replica)
      replica.dropNextReply()

      // A query is not an update: it is answered, and the drop stays armed.
      expect(decodeCaller(await queryReply(agent)).isAnonymous()).toBe(true)
      await expect(update(agent)).rejects.toThrow()
      // The one after that is answered.
      expect(decodeCaller((await update(agent)).reply).isAnonymous()).toBe(true)

      expect(runs).toEqual({ update: 2, query: 1 })
    })

    it("a canister's changed state is the only trace of the lost call", async () => {
      let balance = 0
      const { replica } = countingReplica({
        update: () => {
          balance += 10
          return new Uint8Array(IDL.encode([IDL.Nat], [balance]))
        },
      })
      const agent = agentOn(replica)
      replica.dropNextReply()

      await expect(update(agent, "deposit")).rejects.toThrow()

      expect(balance).toBe(10)
    })
  })

  describe("refuseNext", () => {
    it.each([429, 503])(
      "answers the next update with HTTP %i before the canister sees it",
      async (status) => {
        const { replica, runs } = countingReplica()
        const agent = agentOn(replica)
        replica.refuseNext(status)

        const error = await rejection(update(agent))

        expect(shapeOf(error)).toMatchObject({
          kind: ErrorKindEnum.Protocol,
          code: "HttpErrorCode",
          status,
        })
        expect(runs.update).toBe(0)
        expect(replica.requests.filter((r) => r.endpoint === "call")).toEqual([
          {
            endpoint: "call",
            canisterId: CANISTER,
            effectiveCanisterId: CANISTER,
            methodName: "whoami",
            refused: `refuseNext(${status}) answered the request with HTTP ${status}`,
          },
        ])
      }
    )

    it("answers the next query the same way, and the one after normally", async () => {
      const { replica, runs } = countingReplica()
      const agent = agentOn(replica)
      replica.refuseNext(429)

      const error = await rejection(queryReply(agent))

      expect(shapeOf(error)).toMatchObject({
        kind: ErrorKindEnum.Protocol,
        code: "HttpErrorCode",
        status: 429,
      })
      expect(runs.query).toBe(0)
      expect(decodeCaller(await queryReply(agent)).isAnonymous()).toBe(true)
      expect(runs.query).toBe(1)
    })

    it("does not count the requests an agent makes on its own", async () => {
      // The status request and the read_state an agent makes to trust a query
      // are the agent's housekeeping, not a call a test is counting: they are
      // answered while the refusal waits for the next call.
      const { replica, runs } = countingReplica()
      const agent = HttpAgent.createSync({
        host: replica.host,
        fetch: replica.fetch,
        shouldFetchRootKey: true,
        retryTimes: 0,
        subnetNodeKeyExpirableStore: nodeKeysOfOneAgent(),
      })
      replica.refuseNext(429)

      await agent.fetchRootKey()
      await agent.fetchSubnetKeys({ canisterId: Principal.fromText(CANISTER) })
      expect(
        replica.requests.map((r) => [r.endpoint, Boolean(r.refused)])
      ).toEqual([
        ["status", false],
        ["read_state", false],
      ])

      const error = await rejection(queryReply(agent))
      expect(shapeOf(error).status).toBe(429)
      expect(runs.query).toBe(0)
    })

    it("refuses as many sends as it is told to, so a retry can get through", async () => {
      const { replica, runs } = countingReplica()
      const agent = agentOn(replica, retriesAtOnce(2))
      replica.refuseNext(429, 2)

      const answer = await update(agent)

      expect(decodeCaller(answer.reply).isAnonymous()).toBe(true)
      expect(runs.update).toBe(1)
      expect(
        replica.requests
          .filter((r) => r.endpoint === "call")
          .map((r) => Boolean(r.refused))
      ).toEqual([true, true, false])
    })

    it("refuses what is not an HTTP error status", () => {
      const { replica } = countingReplica()

      expect(() => replica.refuseNext(200)).toThrow(RangeError)
      expect(() => replica.refuseNext(429.5)).toThrow(RangeError)
      expect(() => replica.refuseNext(429, 0)).toThrow(RangeError)
    })

    it("comes before the signature check, as a gateway refuses first", async () => {
      const { replica, runs } = countingReplica()
      const impostor = new (class extends SignIdentity {
        private readonly key = Ed25519KeyIdentity.generate()
        getPublicKey() {
          return this.key.getPublicKey()
        }
        sign(blob: Uint8Array) {
          return this.key.sign(blob)
        }
        override getPrincipal() {
          return Ed25519KeyIdentity.generate().getPrincipal()
        }
      })()
      replica.refuseNext(429)

      const error = await rejection(
        update(agentOn(replica, { identity: impostor }))
      )

      expect(shapeOf(error).status).toBe(429)
      expect(runs.update).toBe(0)
    })
  })
})

describe("the fake replica's routing", () => {
  it("answers http://127.0.0.1:4943 when no host is given", async () => {
    const replica = createFakeReplica({
      canisters: { [CANISTER]: { query: answerWithCaller } },
    })

    expect(replica.host).toBe(DEFAULT_HOST)
    expect(decodeCaller(await queryReply(agentOn(replica))).isAnonymous()).toBe(
      true
    )
  })

  it("answers the host it is given, whatever its path", () => {
    const replica = createFakeReplica({
      host: "http://localhost:8080/some/path",
    })

    expect(replica.host).toBe("http://localhost:8080")
  })

  it("fails a canister call sent to another host at once, naming its own", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const replica = createFakeReplica({ host: DEFAULT_HOST })
      // An agent built for mainnet, handed the fake's fetch by mistake.
      const agent = agentOn(replica, { host: "https://icp-api.io" })

      const error = await rejection(queryReply(agent))

      expect(shapeOf(error)).toMatchObject({
        kind: ErrorKindEnum.Transport,
        code: "HttpFetchErrorCode",
      })
      expect(String(error)).toContain(
        `fake replica: no route to https://icp-api.io. The fake answers ${DEFAULT_HOST}`
      )
    } finally {
      logged.mockRestore()
    }
  })

  it("logs a misrouted origin once, as the agent and the query retry it", async () => {
    // Retries can hold the thrown error back until after the test timed
    // out, so the log is what names the cause.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const replica = createFakeReplica({ host: DEFAULT_HOST })
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await expect(
          replica.fetch(
            `http://localhost:3000/api/v3/canister/${CANISTER}/query`
          )
        ).rejects.toThrow("fake replica: no route to http://localhost:3000")
      }
      await expect(
        replica.fetch("https://icp-api.io/api/v2/status")
      ).rejects.toThrow("fake replica: no route to https://icp-api.io")

      expect(logged.mock.calls.map(([message]) => message)).toEqual([
        expect.stringContaining("no route to http://localhost:3000"),
        expect.stringContaining("no route to https://icp-api.io"),
      ])
    } finally {
      logged.mockRestore()
    }
  })

  it("refuses what is not the IC API, which has no fetch of its own to go to", async () => {
    const replica = createFakeReplica({ host: DEFAULT_HOST })

    await expect(replica.fetch(`${DEFAULT_HOST}/config.json`)).rejects.toThrow(
      "is not an IC API request"
    )
    await expect(
      replica.fetch("https://api.example.com/api/v1/users")
    ).rejects.toThrow("is not an IC API request")
  })

  describe("with no host given", () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it("answers the page's origin when it is local, as an agent built with no host calls it", () => {
      // As in Vitest's jsdom and happy-dom environments.
      vi.stubGlobal("location", new URL("http://localhost:3000/"))

      expect(createFakeReplica().host).toBe("http://localhost:3000")
    })

    it.each([
      ["a mainnet page", "https://abcde-aaaaa-aaaaa-aaaaa-cai.icp0.io/"],
      ["an opaque origin", "file:///tmp/index.html"],
    ])("answers http://127.0.0.1:4943 on %s", (_, href) => {
      vi.stubGlobal("location", new URL(href))

      expect(createFakeReplica().host).toBe(DEFAULT_HOST)
    })
  })

  it("refuses a canister key that is not a canister ID", () => {
    expect(() =>
      createFakeReplica({ canisters: { "test-canister": {} } })
    ).toThrow('"test-canister" in `canisters` is not a canister ID')
    expect(() => createFakeReplica().addCanister("test-canister", {})).toThrow(
      '"test-canister" in `canisters` is not a canister ID'
    )
  })
})
