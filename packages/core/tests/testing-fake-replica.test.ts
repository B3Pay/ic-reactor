/**
 * `installFakeReplica` from `@ic-reactor/core/testing`, the fake replica the
 * repository's own tests ran on, published for apps to test against.
 *
 * It refuses what a replica refuses, so a test that passes through it cannot
 * be hiding a client that signs with the wrong key; it rejects a call whose
 * handler throws as a replica rejects a trap, once, rather than failing the
 * HTTP request the agent then retries; and it answers only its own host, so a
 * test pointed elsewhere fails at once instead of reaching a real network.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import {
  Actor,
  HttpAgent,
  SignIdentity,
  type Identity,
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
import { ClientManager } from "../src/client.js"
import { Reactor } from "../src/reactor.js"
import { isCallError } from "../src/errors/index.js"
import {
  installFakeReplica,
  type FakeCanister,
  type FakeReplica,
} from "../src/testing/index.js"

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

const answerWithCaller: FakeCanister["update"] = (_method, _arg, { caller }) =>
  new Uint8Array(IDL.encode([IDL.Principal], [caller]))

async function actorAs(identity: Identity | undefined, host = HOST) {
  const agent = await HttpAgent.create({
    host,
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

describe("the fake replica's request checks", () => {
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

  /** Why the most recent request was refused, if it was. */
  const lastRefusal = () =>
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
    const actor = await actorAs(identity)

    expect((await actor.whoami()).toText()).toBe(
      identity.getPrincipal().toText()
    )
  })

  it("answers an anonymous call as the anonymous principal", async () => {
    const actor = await actorAs(undefined)

    expect((await actor.whoami_query()).isAnonymous()).toBe(true)
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

  it("refuses a request signed by a kind of key it cannot check, and says so", async () => {
    // A key under an algorithm identifier none of the three it checks use.
    const der = new Uint8Array([0x30, 0x0a, 0x30, 0x03, 0x06, 0x01, 0x2a, 1])
    class UnknownKeyIdentity extends SignIdentity {
      getPublicKey(): PublicKey {
        return { toDer: () => der, rawKey: der, derKey: der } as PublicKey
      }
      async sign(): Promise<Signature> {
        return new Uint8Array(64) as Signature
      }
    }
    const actor = await actorAs(new UnknownKeyIdentity())

    await expect(actor.whoami()).rejects.toThrow()
    expect(lastRefusal()).toBe(
      "the request is signed by a kind of key the fake replica cannot check"
    )
  })
})

describe("a canister call the fake replica rejects", () => {
  let replica: FakeReplica
  let runs: number

  const backendOn = (host = HOST) =>
    new Reactor<Whoami>({
      clientManager: new ClientManager({
        queryClient: new QueryClient(),
        agentOptions: { host },
      }),
      name: "backend",
      canisterId: CANISTER,
      idlFactory: whoamiInterface,
    })

  beforeEach(() => {
    runs = 0
    const trap = () => {
      runs += 1
      throw new Error("the canister is broken")
    }
    replica = installFakeReplica({
      host: HOST,
      canisters: { [CANISTER]: { query: trap, update: trap } },
    })
  })

  afterEach(() => {
    replica.restore()
  })

  it.each(["whoami_query", "whoami"] as const)(
    "rejects %s as a trap, once, when its handler throws",
    async (functionName) => {
      // The agent retries an HTTP failure three times by default, so a
      // handler failure answered as one ran the canister four times.
      const error = await backendOn()
        .callMethod({ functionName })
        .catch((error: unknown) => error)

      expect(isCallError(error)).toBe(true)
      expect(String(error)).toContain(
        `Canister ${CANISTER} trapped: the canister is broken`
      )
      expect(String(error)).toContain("IC0503")
      expect(runs).toBe(1)
    }
  )

  it("rejects a call to a canister it does not run", async () => {
    const reactor = backendOn()
    reactor.setCanisterId(OTHER_CANISTER)

    await expect(
      reactor.callMethod({ functionName: "whoami_query" })
    ).rejects.toThrow(`no canister is installed at ${OTHER_CANISTER}`)
    await expect(
      reactor.callMethod({ functionName: "whoami" })
    ).rejects.toThrow(`no canister is installed at ${OTHER_CANISTER}`)
  })

  it("routes a call to the canister it names, not the effective canister", async () => {
    // `effectiveCanisterId` only picks the subnet a request goes through, as
    // for a management canister call. The canister named in the request
    // answers it.
    const answerWith = (id: string) => () =>
      new Uint8Array(IDL.encode([IDL.Principal], [Principal.fromText(id)]))
    replica.restore()
    replica = installFakeReplica({
      host: HOST,
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
    const callConfig = {
      effectiveCanisterId: Principal.fromText(OTHER_CANISTER),
    }

    for (const functionName of ["whoami_query", "whoami"] as const) {
      const answer = await backendOn().callMethod({ functionName, callConfig })
      expect(answer.toText()).toBe(CANISTER)
    }
    expect(
      replica.requests
        .filter((request) => request.methodName)
        .map((request) => request.canisterId)
    ).toEqual([CANISTER, CANISTER])
  })

  it("rejects the calls a canister without a handler for them receives", async () => {
    replica.restore()
    replica = installFakeReplica({ host: HOST, canisters: { [CANISTER]: {} } })

    await expect(
      backendOn().callMethod({ functionName: "whoami_query" })
    ).rejects.toThrow(`canister ${CANISTER} answers no queries`)
    await expect(
      backendOn().callMethod({ functionName: "whoami" })
    ).rejects.toThrow(`canister ${CANISTER} answers no update calls`)
  })
})

describe("the fake replica's routing", () => {
  it("answers http://127.0.0.1:4943 when no host is given", async () => {
    const replica = installFakeReplica({
      canisters: { [CANISTER]: { query: answerWithCaller } },
    })
    try {
      expect(replica.host).toBe("http://127.0.0.1:4943")
      const actor = await actorAs(undefined, replica.host)

      expect((await actor.whoami_query()).isAnonymous()).toBe(true)
    } finally {
      replica.restore()
    }
  })

  it("fails a canister call sent to another host at once, naming its own", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const replica = installFakeReplica({ host: HOST })
    try {
      await expect(
        globalThis.fetch("https://icp-api.io/api/v2/status")
      ).rejects.toThrow(
        `fake replica: no route to https://icp-api.io. The fake answers ${HOST}`
      )
    } finally {
      replica.restore()
      logged.mockRestore()
    }
  })

  it("logs a misrouted origin once, as the agent and the query retry it", async () => {
    // Retries can hold the thrown error back until after the test timed
    // out, so the log is what names the cause.
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const replica = installFakeReplica({ host: HOST })
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await expect(
          globalThis.fetch(
            `http://localhost:3000/api/v3/canister/${CANISTER}/query`
          )
        ).rejects.toThrow("fake replica: no route to http://localhost:3000")
      }
      await expect(
        globalThis.fetch("https://icp-api.io/api/v2/status")
      ).rejects.toThrow("fake replica: no route to https://icp-api.io")

      expect(logged.mock.calls.map(([message]) => message)).toEqual([
        expect.stringContaining("no route to http://localhost:3000"),
        expect.stringContaining("no route to https://icp-api.io"),
      ])
    } finally {
      replica.restore()
      logged.mockRestore()
    }
  })

  it("hands any other request to the fetch it replaced", async () => {
    const previous = globalThis.fetch
    const seen: string[] = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      seen.push(String(input))
      return new Response("ok")
    }) as typeof fetch
    const replica = installFakeReplica({ host: HOST })
    try {
      const response = await globalThis.fetch("https://example.com/data.json")

      expect(await response.text()).toBe("ok")
      expect(seen).toEqual(["https://example.com/data.json"])
    } finally {
      replica.restore()
      globalThis.fetch = previous
    }
  })

  describe("hands on what is not the IC API, on any origin", () => {
    const previous = globalThis.fetch
    let seen: string[]
    let replica: FakeReplica

    beforeEach(() => {
      seen = []
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        seen.push(String(input))
        return new Response("ok")
      }) as typeof fetch
      replica = installFakeReplica({ host: HOST })
    })

    afterEach(() => {
      replica.restore()
      globalThis.fetch = previous
      vi.unstubAllGlobals()
    })

    it("such as an app's own versioned REST API on another origin", async () => {
      // An /api/v1/ path is not the IC API, and a mock such as MSW may be
      // the fetch underneath answering it.
      const response = await globalThis.fetch(
        "https://api.example.com/api/v1/users"
      )

      expect(await response.text()).toBe("ok")
      expect(seen).toEqual(["https://api.example.com/api/v1/users"])
    })

    it("such as a page's own files on the fake's host", async () => {
      // A fake answering a page's origin shares it with the app.
      const response = await globalThis.fetch(`${HOST}/config.json`)

      expect(await response.text()).toBe("ok")
      expect(seen).toEqual([`${HOST}/config.json`])
    })

    it("such as a path an app asks for, read against the page", async () => {
      vi.stubGlobal("location", new URL("http://localhost:3000/app"))

      const response = await globalThis.fetch("/config.json")

      expect(await response.text()).toBe("ok")
      expect(seen).toEqual(["/config.json"])
    })
  })

  describe("with no host given", () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it("answers the page's origin when it is local, as a ClientManager with no host calls it", async () => {
      // As in Vitest's jsdom and happy-dom environments.
      vi.stubGlobal("location", new URL("http://localhost:3000/"))
      const replica = installFakeReplica({
        canisters: { [CANISTER]: { query: answerWithCaller } },
      })
      try {
        expect(replica.host).toBe("http://localhost:3000")
        const reactor = new Reactor<Whoami>({
          clientManager: new ClientManager({ queryClient: new QueryClient() }),
          name: "backend",
          canisterId: CANISTER,
          idlFactory: whoamiInterface,
        })

        await expect(
          reactor.callMethod({ functionName: "whoami_query" })
        ).resolves.toEqual(Principal.anonymous())
      } finally {
        replica.restore()
      }
    })

    it.each([
      ["a mainnet page", "https://abcde-aaaaa-aaaaa-aaaaa-cai.icp0.io/"],
      ["an opaque origin", "file:///tmp/index.html"],
    ])("answers http://127.0.0.1:4943 on %s", (_, href) => {
      vi.stubGlobal("location", new URL(href))
      const replica = installFakeReplica()
      try {
        expect(replica.host).toBe("http://127.0.0.1:4943")
      } finally {
        replica.restore()
      }
    })
  })

  it("lets two fakes on two hosts answer side by side", async () => {
    const OTHER_HOST = "http://127.0.0.1:8080"
    const first = installFakeReplica({
      host: HOST,
      canisters: { [CANISTER]: { query: answerWithCaller } },
    })
    const second = installFakeReplica({
      host: OTHER_HOST,
      canisters: { [CANISTER]: { query: answerWithCaller } },
    })
    try {
      await (await actorAs(undefined, HOST)).whoami_query()
      await (await actorAs(undefined, OTHER_HOST)).whoami_query()

      const queries = (replica: FakeReplica) =>
        replica.requests.filter((request) => request.endpoint === "query")
      expect(queries(first)).toHaveLength(1)
      expect(queries(second)).toHaveLength(1)
    } finally {
      second.restore()
      first.restore()
    }
  })

  it("puts back the fetch it replaced", () => {
    const previous = globalThis.fetch
    const replica = installFakeReplica()

    expect(globalThis.fetch).not.toBe(previous)
    replica.restore()
    expect(globalThis.fetch).toBe(previous)
  })

  it("puts back the fetch it replaced when fakes are restored out of order", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const previous = globalThis.fetch
    const OTHER_HOST = "http://127.0.0.1:8080"
    const first = installFakeReplica({ host: OTHER_HOST })
    const second = installFakeReplica({ host: HOST })
    try {
      first.restore()
      // The second fake stays in place, and no longer hands the first
      // one's host on to it.
      expect(globalThis.fetch).not.toBe(previous)
      await expect(
        globalThis.fetch(`${OTHER_HOST}/api/v2/status`)
      ).rejects.toThrow(`no route to ${OTHER_HOST}`)

      second.restore()
      // It used to put the first fake back, which then answered every
      // later test in the file.
      expect(globalThis.fetch).toBe(previous)
    } finally {
      globalThis.fetch = previous
      logged.mockRestore()
    }
  })

  it("answers where no fetch was installed before it", async () => {
    // As in a test environment with no fetch of its own.
    const previous = globalThis.fetch
    Reflect.deleteProperty(globalThis, "fetch")
    const replica = installFakeReplica({
      host: HOST,
      canisters: { [CANISTER]: { query: answerWithCaller } },
    })
    try {
      const actor = await actorAs(undefined)

      expect((await actor.whoami_query()).isAnonymous()).toBe(true)
    } finally {
      replica.restore()
      globalThis.fetch = previous
    }
  })

  it("leaves a fetch installed over it in place when restored again", () => {
    const previous = globalThis.fetch
    const replica = installFakeReplica()
    replica.restore()
    const stub = (async () => new Response("stub")) as typeof fetch
    globalThis.fetch = stub
    try {
      replica.restore()

      expect(globalThis.fetch).toBe(stub)
    } finally {
      globalThis.fetch = previous
    }
  })

  it("refuses a canister key that is not a canister ID", () => {
    expect(() =>
      installFakeReplica({ canisters: { "test-canister": {} } })
    ).toThrow('"test-canister" in `canisters` is not a canister ID')
  })
})
