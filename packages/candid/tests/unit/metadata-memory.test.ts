import { ClientManager } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { setFlagsFromString } from "node:v8"
import { runInNewContext } from "node:vm"
import { describe, expect, it } from "vitest"
import { MetadataDisplayReactor } from "../../src/metadata-display-reactor.js"
import { MetadataReactor } from "../../src/metadata-reactor.js"

/**
 * Both metadata reactors described every service with visitors shared by all
 * their instances, and the argument visitor caches a validation schema per
 * recursive type, keyed by a name unique to the type, forever. Each entry's
 * lazy schema holds the type, and through it the service's type graph, so a
 * reactor that was dropped stayed in memory: 800 MetadataDisplayReactors for
 * the NNS governance interface kept about 33 MB after all of them were gone,
 * where the reactors they extend keep nothing.
 */

/** ES2021's WeakRef, which the package's ES2020 lib does not declare. */
declare class WeakRef<T extends object> {
  constructor(target: T)
  deref(): T | undefined
}

setFlagsFromString("--expose-gc")
const gc = runInNewContext("gc") as () => void

function createMockClientManager(): ClientManager {
  const agent = HttpAgent.createSync({ host: "https://ic0.app" })
  return {
    agent,
    registerCanisterId: () => {},
    subscribe: () => () => {},
    queryClient: {
      invalidateQueries: () => Promise.resolve(),
      ensureQueryData: () => Promise.resolve(undefined),
      getQueryData: () => undefined,
    },
  } as unknown as ClientManager
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe.each([
  ["MetadataDisplayReactor", MetadataDisplayReactor],
  ["MetadataReactor", MetadataReactor],
] as const)("%s memory", (_name, Reactor) => {
  /** Builds and drops a reactor, and returns a weak reference to its type. */
  function dropReactor(): WeakRef<IDL.Type> {
    const List = IDL.Rec()
    List.fill(IDL.Opt(IDL.Record({ head: IDL.Nat, tail: List })))

    const reactor = new Reactor({
      name: "lists",
      canisterId: "aaaaa-aa",
      clientManager: createMockClientManager(),
      idlFactory: ({ IDL: I }: { IDL: typeof IDL }) =>
        I.Service({ push: I.Func([List], [List], []) }),
    })
    // The metadata was built and describes the type.
    expect(reactor.getInputMeta("push")?.args[0].type).toBe("recursive")

    return new WeakRef(List)
  }

  async function collectGarbage() {
    for (let i = 0; i < 3; i++) {
      await settle()
      gc()
    }
  }

  it("lets a dropped reactor's recursive types be collected", async () => {
    // V8 can keep what the first run of a code path saw, so that run is
    // not the one measured.
    dropReactor()
    await collectGarbage()

    const list = dropReactor()
    await collectGarbage()

    expect(list.deref()).toBeUndefined()
  })
})
