import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { QueryClient, dehydrate, hydrate } from "@tanstack/query-core"
import { HttpAgent, type Agent } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { ClientManager } from "../src/client.js"
import { Reactor } from "../src/reactor.js"
import { DisplayReactor } from "../src/display-reactor.js"
import { installFakeReplica, type FakeReplica } from "./fake-replica.js"

/**
 * `callConfig.agent` sends one call through another agent: another identity,
 * the anonymous one, another network. The query key named the canister, the
 * method, the transform, the effective target and the args, but not the
 * agent, so `fetchQuery`, `getQueryData` and the query hooks kept the answer
 * from `callConfig.agent` and the answer from the manager's agent in one cache
 * entry. Whichever ran first answered both: a `whoami` sent through an admin's
 * agent was then served, from the cache, as the signed-in user's `whoami`
 * (#642).
 *
 * A key for an agent other than the manager's now carries `{ agent: n }`, the
 * agent's number in this process, after the transform segment and before the
 * args. Every other key is unchanged.
 */

const HOST = "http://127.0.0.1:4943"
const CANISTER = "ryjl3-tyaaa-aaaaa-aaaba-cai"

interface Service {
  whoami: () => Promise<string>
  echo: (text: string) => Promise<string>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    whoami: IDL.Func([], [IDL.Text], ["query"]),
    echo: IDL.Func([IDL.Text], [IDL.Text], ["query"]),
  })

const user = Ed25519KeyIdentity.generate()
const admin = Ed25519KeyIdentity.generate()
const userText = user.getPrincipal().toText()
const adminText = admin.getPrincipal().toText()

let replica: FakeReplica

beforeEach(() => {
  replica = installFakeReplica({
    host: HOST,
    canisters: {
      [CANISTER]: {
        // The canister answers with whoever sent the query.
        query: (method, arg, { caller }) =>
          new Uint8Array(
            IDL.encode(
              [IDL.Text],
              [
                method === "echo"
                  ? `${IDL.decode([IDL.Text], arg)[0] as string}:${caller.toText()}`
                  : caller.toText(),
              ]
            )
          ),
      },
    },
  })
})

afterEach(() => {
  replica.restore()
})

const signedInManager = () => {
  const clientManager = new ClientManager({
    queryClient: new QueryClient(),
    agentOptions: { host: HOST, retryTimes: 0 },
  })
  clientManager.updateAgent(user)
  return clientManager
}

const reactorOn = (clientManager: ClientManager) =>
  new Reactor<Service>({
    clientManager,
    name: "backend",
    canisterId: CANISTER,
    idlFactory,
  })

const adminAgent = () =>
  HttpAgent.create({
    host: HOST,
    identity: admin,
    shouldFetchRootKey: true,
    retryTimes: 0,
  })

const whoamiQueries = () =>
  replica.requests.filter(
    (request) => request.endpoint === "query" && request.methodName === "whoami"
  )

describe("a query sent through callConfig.agent", () => {
  it("is not answered from the manager's agent's cache entry", async () => {
    const reactor = reactorOn(signedInManager())
    const agent = await adminAgent()

    await expect(reactor.fetchQuery({ functionName: "whoami" })).resolves.toBe(
      userText
    )
    await expect(
      reactor.fetchQuery({ functionName: "whoami", callConfig: { agent } })
    ).resolves.toBe(adminText)

    expect(whoamiQueries()).toHaveLength(2)
  })

  it("does not answer the manager's agent's query from its own entry", async () => {
    const reactor = reactorOn(signedInManager())
    const agent = await adminAgent()

    await expect(
      reactor.fetchQuery({ functionName: "whoami", callConfig: { agent } })
    ).resolves.toBe(adminText)
    await expect(reactor.fetchQuery({ functionName: "whoami" })).resolves.toBe(
      userText
    )

    expect(whoamiQueries()).toHaveLength(2)
  })

  it("is read back from the cache only with the same agent", async () => {
    const reactor = reactorOn(signedInManager())
    const agent = await adminAgent()

    await reactor.fetchQuery({ functionName: "whoami", callConfig: { agent } })

    expect(reactor.getQueryData({ functionName: "whoami" }, { agent })).toBe(
      adminText
    )
    expect(reactor.getQueryData({ functionName: "whoami" })).toBeUndefined()

    // Served from its own entry the second time.
    await reactor.fetchQuery({ functionName: "whoami", callConfig: { agent } })
    expect(whoamiQueries()).toHaveLength(1)
  })

  it("keeps two override agents apart", async () => {
    const reactor = reactorOn(signedInManager())
    const agent = await adminAgent()
    const anonymous = await HttpAgent.create({
      host: HOST,
      shouldFetchRootKey: true,
      retryTimes: 0,
    })

    await reactor.fetchQuery({ functionName: "whoami", callConfig: { agent } })
    await expect(
      reactor.fetchQuery({
        functionName: "whoami",
        callConfig: { agent: anonymous },
      })
    ).resolves.toBe("2vxsx-fae")
  })

  it("has its entries invalidated by invalidateQueries({ functionName })", async () => {
    const clientManager = signedInManager()
    const reactor = reactorOn(clientManager)
    const agent = await adminAgent()

    await reactor.fetchQuery({ functionName: "echo", args: ["hi"] })
    await reactor.fetchQuery({
      functionName: "echo",
      args: ["hi"],
      callConfig: { agent },
    })

    reactor.invalidateQueries({ functionName: "echo" })

    const state = (key: readonly unknown[]) =>
      clientManager.queryClient.getQueryState(key)
    const defaultKey = reactor.generateQueryKey({
      functionName: "echo",
      args: ["hi"],
    })
    const overrideKey = reactor.generateQueryKey(
      { functionName: "echo", args: ["hi"] },
      { agent }
    )
    expect(defaultKey).not.toEqual(overrideKey)
    expect(state(defaultKey)?.isInvalidated).toBe(true)
    expect(state(overrideKey)?.isInvalidated).toBe(true)
  })

  it("has its entries swept by updateAgent like any other of the canister", async () => {
    // Guard: the identity-switch sweep matches keys by their canister, which
    // an agent segment does not move.
    const clientManager = signedInManager()
    const reactor = reactorOn(clientManager)
    const agent = await adminAgent()

    await reactor.fetchQuery({ functionName: "whoami", callConfig: { agent } })
    expect(
      reactor.getQueryData({ functionName: "whoami" }, { agent })
    ).toBeDefined()

    clientManager.updateAgent(Ed25519KeyIdentity.generate())

    expect(
      reactor.getQueryData({ functionName: "whoami" }, { agent })
    ).toBeUndefined()
  })
})

describe("the agent segment of a query key", () => {
  const managerWithoutNetwork = () =>
    new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: { host: HOST },
    })

  it("sits after the transform segment and before the args", async () => {
    const clientManager = managerWithoutNetwork()
    const agent = await adminAgent()
    const reactor = reactorOn(clientManager)
    const display = new DisplayReactor<Service>({
      clientManager,
      name: "backend",
      canisterId: CANISTER,
      idlFactory,
    })

    const candidKey = reactor.generateQueryKey(
      { functionName: "echo", args: ["hi"] },
      { agent }
    )
    const ordinal = (candidKey[2] as { agent: number }).agent

    expect(candidKey).toEqual([
      CANISTER,
      "echo",
      { agent: expect.any(Number) },
      '["hi"]',
    ])
    expect(
      display.generateQueryKey(
        { functionName: "echo", args: ["hi"] },
        { agent, effectiveCanisterId: admin.getPrincipal() }
      )
    ).toEqual([
      CANISTER,
      "echo",
      { transform: "display" },
      { agent: ordinal },
      { effectiveTarget: { canisterId: adminText } },
      '["hi"]',
    ])
  })

  it("names the same agent by the same number, and two agents apart", async () => {
    const reactor = reactorOn(managerWithoutNetwork())
    const first = await adminAgent()
    const second = await adminAgent()
    const keyOf = (agent: HttpAgent) =>
      reactor.generateQueryKey({ functionName: "whoami" }, { agent })

    expect(keyOf(first)).toEqual(keyOf(first))
    expect(keyOf(first)).not.toEqual(keyOf(second))
  })

  it("leaves every key without an override byte for byte as it was", () => {
    // Guard: a key built without `callConfig.agent`, or with the manager's
    // own agent, is exactly what it was before the segment existed, so no
    // existing cache entry, hard-coded key or dehydrated cache moves.
    const clientManager = managerWithoutNetwork()
    const reactor = reactorOn(clientManager)
    const display = new DisplayReactor<Service>({
      clientManager,
      name: "backend",
      canisterId: CANISTER,
      idlFactory,
    })
    const own = { agent: clientManager.agent }

    for (const callConfig of [undefined, {}, own]) {
      expect(
        JSON.stringify(
          reactor.generateQueryKey({ functionName: "whoami" }, callConfig)
        )
      ).toBe(`["${CANISTER}","whoami"]`)
      expect(
        JSON.stringify(
          reactor.generateQueryKey(
            { functionName: "echo", args: ["hi"], queryKey: ["page", 1] },
            callConfig
          )
        )
      ).toBe(`["${CANISTER}","echo","[\\"hi\\"]","page",1]`)
      expect(
        JSON.stringify(
          display.generateQueryKey(
            { functionName: "echo", args: ["hi"] },
            callConfig
          )
        )
      ).toBe(`["${CANISTER}","echo",{"transform":"display"},"[\\"hi\\"]"]`)
    }
  })
})

describe("the agent numbers", () => {
  const REGISTRY = Symbol.for("@ic-reactor/core/agentOrdinals")
  const global = globalThis as Record<symbol, unknown>
  let saved: PropertyDescriptor | undefined

  beforeEach(() => {
    saved = Object.getOwnPropertyDescriptor(global, REGISTRY)
    delete global[REGISTRY]
  })

  afterEach(() => {
    delete global[REGISTRY]
    if (saved) Object.defineProperty(global, REGISTRY, saved)
  })

  /** A freshly evaluated copy of the reactor module, as a second install. */
  const reactorCopy = async () => {
    vi.resetModules()
    const { Reactor: CopiedReactor } = await import("../src/reactor.js")
    const clientManager = {
      agent: {},
      registerCanisterId: () => {},
      queryClient: new QueryClient(),
    } as unknown as ClientManager
    const reactor = new CopiedReactor<Service>({
      clientManager,
      name: "backend",
      canisterId: CANISTER,
      idlFactory,
    })
    return (agent: Agent) =>
      reactor.generateQueryKey({ functionName: "whoami" }, { agent })[2]
  }
  const someAgent = () => ({}) as unknown as Agent

  it("come from one sequence shared by every copy of the package", async () => {
    const [keyInFirstCopy, keyInSecondCopy] = [
      await reactorCopy(),
      await reactorCopy(),
    ]
    const shared = someAgent()
    const onlyInSecond = someAgent()

    // Each copy's first agent: two copies counting alone would both say 1.
    const first = keyInFirstCopy(shared)
    const second = keyInSecondCopy(onlyInSecond)

    expect(second).not.toEqual(first)
    expect(keyInSecondCopy(shared)).toEqual(first)
  })

  it("still tell agents apart where the global object refuses the registry", async () => {
    Object.defineProperty(global, REGISTRY, {
      configurable: true,
      get: () => undefined,
      set: () => {
        throw new TypeError("Cannot add property, object is not extensible")
      },
    })
    const keyOf = await reactorCopy()
    const a = someAgent()
    const b = someAgent()

    const keyOfA = keyOf(a)

    expect(keyOf(b)).not.toEqual(keyOfA)
    expect(keyOf(a)).toEqual(keyOfA)
  })

  /**
   * The classes of a copy of the package loaded as another process loads it:
   * with no registry on its global object yet.
   */
  const anotherProcess = async () => {
    delete global[REGISTRY]
    vi.resetModules()
    const [{ Reactor: ProcessReactor }, { ClientManager: ProcessManager }] =
      await Promise.all([
        import("../src/reactor.js"),
        import("../src/client.js"),
      ])
    const clientManager = new ProcessManager({
      queryClient: new QueryClient(),
      agentOptions: { host: HOST, retryTimes: 0 },
    })
    const reactor = new ProcessReactor<Service>({
      clientManager,
      name: "backend",
      canisterId: CANISTER,
      idlFactory,
    })
    return { clientManager, reactor }
  }

  it("differ between two processes", async () => {
    // Two registries counting from 1 both gave their first agent 1.
    const firstKeyIn = async () =>
      (await anotherProcess()).reactor.generateQueryKey(
        { functionName: "whoami" },
        { agent: someAgent() }
      )[2]

    const inServer = await firstKeyIn()
    const inBrowser = await firstKeyIn()

    expect(inBrowser).not.toEqual(inServer)
  })

  it("keep a dehydrated override entry from answering another process's agent", async () => {
    // The server fetches `whoami` through an admin's agent and dehydrates
    // its cache into the page.
    const server = await anotherProcess()
    await expect(
      server.reactor.fetchQuery({
        functionName: "whoami",
        callConfig: { agent: await adminAgent() },
      })
    ).resolves.toBe(adminText)
    const page = JSON.parse(
      JSON.stringify(dehydrate(server.clientManager.queryClient))
    ) as ReturnType<typeof dehydrate>

    // The browser hydrates it, then asks through the user's own agent: its
    // first override agent, as the admin's was the server's.
    const browser = await anotherProcess()
    hydrate(browser.clientManager.queryClient, page)
    const userAgent = await HttpAgent.create({
      host: HOST,
      identity: user,
      shouldFetchRootKey: true,
      retryTimes: 0,
    })

    await expect(
      browser.reactor.fetchQuery({
        functionName: "whoami",
        callConfig: { agent: userAgent },
      })
    ).resolves.toBe(userText)
    expect(whoamiQueries()).toHaveLength(2)
  })
})
