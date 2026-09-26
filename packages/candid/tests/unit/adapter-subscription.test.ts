import { ClientManager } from "@ic-reactor/core"
import { AnonymousIdentity } from "@icp-sdk/core/agent"
import type { Identity } from "@icp-sdk/core/agent"
import { setFlagsFromString } from "node:v8"
import { runInNewContext } from "node:vm"
import { describe, expect, it, vi } from "vitest"
import { CandidAdapter } from "../../src/adapter.js"
import {
  DEFAULT_IC_DIDJS_ID,
  DEFAULT_LOCAL_DIDJS_ID,
} from "../../src/constants.js"
import { CandidDisplayReactor } from "../../src/display-reactor.js"
import { MetadataDisplayReactor } from "../../src/metadata-display-reactor.js"
import { MetadataReactor } from "../../src/metadata-reactor.js"
import { CandidReactor } from "../../src/reactor.js"
import type { CandidClientManager } from "../../src/types.js"

/**
 * Each candid reactor built without an adapter creates one, and the adapter
 * subscribed to its ClientManager's identity changes to recompute its didjs
 * canister ID. Nothing removed the subscription and no reactor can be
 * disposed, so every reactor an app ever built left a callback on the
 * manager that ran on each sign-in and sign-out and kept its adapter alive
 * (#644). The adapter now reads the default ID when it needs it.
 */

/** ES2021's WeakRef, which the package's ES2020 lib does not declare. */
declare class WeakRef<T extends object> {
  constructor(target: T)
  deref(): T | undefined
}

setFlagsFromString("--expose-gc")
const gc = runInNewContext("gc") as () => void

const CANDID = "service : { greet : (text) -> (text) query }"

/** A real ClientManager on mainnet, with a stand-in for its QueryClient. */
function createClientManager(): ClientManager {
  return new ClientManager({
    agentOptions: { host: "https://ic0.app" },
    queryClient: {
      cancelQueries: () => Promise.resolve(),
      removeQueries: () => {},
      invalidateQueries: () => Promise.resolve(),
    } as unknown as ClientManager["queryClient"],
  })
}

/**
 * Counts the identity subscriptions a manager holds: each `subscribe` adds
 * one and the first call of the unsubscribe it returned removes it.
 */
function countSubscriptions(clientManager: ClientManager): () => number {
  let live = 0
  const subscribe = clientManager.subscribe.bind(clientManager)
  vi.spyOn(clientManager, "subscribe").mockImplementation((callback) => {
    live++
    const unsubscribe = subscribe(callback)
    let removed = false
    return () => {
      if (!removed) {
        removed = true
        live--
      }
      unsubscribe()
    }
  })
  return () => live
}

/** A custom client manager whose network can change after construction. */
function createSwitchableClientManager(isLocal: boolean) {
  const callbacks: Array<(identity: Identity) => void> = []
  const clientManager: CandidClientManager = {
    agent: {
      query: vi.fn().mockResolvedValue({ status: "rejected" }),
    } as unknown as CandidClientManager["agent"],
    isLocal,
    subscribe: (callback) => {
      callbacks.push(callback)
      return () => {
        const index = callbacks.indexOf(callback)
        if (index !== -1) callbacks.splice(index, 1)
      }
    },
  }
  const notify = () => {
    for (const callback of [...callbacks]) callback(new AnonymousIdentity())
  }
  return { clientManager, notify, callbacks }
}

/** What each test gives a reactor: no adapter, so the reactor creates one. */
interface ReactorConfig {
  name: string
  canisterId: string
  clientManager: ClientManager
  candid: string
}

describe.each<[string, (config: ReactorConfig) => { adapter: CandidAdapter }]>([
  ["CandidReactor", (config) => new CandidReactor(config)],
  ["CandidDisplayReactor", (config) => new CandidDisplayReactor(config)],
  ["MetadataReactor", (config) => new MetadataReactor(config)],
  ["MetadataDisplayReactor", (config) => new MetadataDisplayReactor(config)],
])("%s", (_name, createReactor) => {
  it("leaves no callback on its ClientManager when dropped", () => {
    const clientManager = createClientManager()
    const subscriptions = countSubscriptions(clientManager)

    for (let i = 0; i < 25; i++) {
      createReactor({
        name: `reactor-${i}`,
        canisterId: "aaaaa-aa",
        clientManager,
        candid: CANDID,
      })
    }

    expect(subscriptions()).toBe(0)
    // A sign-in afterwards has nothing of theirs to run.
    expect(() =>
      clientManager.updateAgent(new AnonymousIdentity())
    ).not.toThrow()
  })

  it("uses the default didjs canister of its ClientManager's network", () => {
    const reactor = createReactor({
      name: "reactor",
      canisterId: "aaaaa-aa",
      clientManager: createClientManager(),
      candid: CANDID,
    })

    expect(reactor.adapter.didjsCanisterId).toBe(DEFAULT_IC_DIDJS_ID)
  })
})

describe("a dropped reactor's adapter", () => {
  async function collectGarbage() {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      gc()
    }
  }

  /** Builds and drops a reactor, and returns a weak reference to its adapter. */
  function dropReactor(clientManager: ClientManager): WeakRef<CandidAdapter> {
    const reactor = new CandidReactor({
      name: "dropped",
      canisterId: "aaaaa-aa",
      clientManager,
      candid: CANDID,
    })
    return new WeakRef(reactor.adapter)
  }

  it("can be collected while its ClientManager lives", async () => {
    const clientManager = createClientManager()

    // V8 can keep what the first run of a code path saw, so that run is not
    // the one measured.
    dropReactor(clientManager)
    await collectGarbage()

    const adapter = dropReactor(clientManager)
    await collectGarbage()

    expect(adapter.deref()).toBeUndefined()
    // The manager is still in use, so it is what would have held the adapter.
    expect(clientManager.isLocal).toBe(false)
  })
})

describe("CandidAdapter's didjs canister", () => {
  it("follows the client manager's network at the time of the read", () => {
    const { clientManager } = createSwitchableClientManager(true)
    const adapter = new CandidAdapter({ clientManager })
    expect(adapter.didjsCanisterId).toBe(DEFAULT_LOCAL_DIDJS_ID)

    // No identity change announces this: the ID is read, not recomputed on a
    // notification.
    clientManager.isLocal = false
    expect(adapter.didjsCanisterId).toBe(DEFAULT_IC_DIDJS_ID)

    clientManager.isLocal = true
    expect(adapter.didjsCanisterId).toBe(DEFAULT_LOCAL_DIDJS_ID)
  })

  it("compiles on the didjs canister of the current network", async () => {
    const { clientManager } = createSwitchableClientManager(true)
    const adapter = new CandidAdapter({ clientManager })

    clientManager.isLocal = false
    await adapter.compileRemote(CANDID).catch(() => undefined)

    expect(clientManager.agent.query).toHaveBeenCalledWith(
      DEFAULT_IC_DIDJS_ID,
      expect.objectContaining({ methodName: "did_to_js" })
    )
  })

  it("keeps an ID given to the constructor whatever the network", () => {
    const { clientManager, notify } = createSwitchableClientManager(true)
    const adapter = new CandidAdapter({
      clientManager,
      didjsCanisterId: "my-custom-didjs",
    })

    clientManager.isLocal = false
    notify()

    expect(adapter.didjsCanisterId).toBe("my-custom-didjs")
  })

  it("keeps an assigned ID across identity changes", () => {
    const { clientManager, notify } = createSwitchableClientManager(false)
    const adapter = new CandidAdapter({ clientManager })

    adapter.didjsCanisterId = "assigned-didjs"
    // The subscription reset an assigned ID to the default on the next
    // sign-in or sign-out.
    notify()
    clientManager.isLocal = true

    expect(adapter.didjsCanisterId).toBe("assigned-didjs")
  })

  it("does not subscribe, and keeps unsubscribe as a no-op", () => {
    const { clientManager, callbacks } = createSwitchableClientManager(false)
    const adapter = new CandidAdapter({ clientManager })

    expect(callbacks).toHaveLength(0)
    expect(() => {
      adapter.unsubscribe()
      adapter.unsubscribe()
    }).not.toThrow()
  })
})
