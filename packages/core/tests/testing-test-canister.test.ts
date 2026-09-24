/**
 * `createTestCanister` from `@ic-reactor/core/testing`: a canister for the
 * fake replica, written as typed handlers over Candid values rather than
 * bytes, so a test runs the real `Reactor` and `DisplayReactor` end to end —
 * Candid encoding, query keys and the cache, `Result` unwrapping into
 * `CanisterError`, a trap into `CallError`, and the caller the agent signs as —
 * instead of a stub cast to `Reactor` that re-implements some of that.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { Actor, HttpAgent, type ActorMethod } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { Principal } from "@icp-sdk/core/principal"
import { ClientManager } from "../src/client.js"
import { Reactor } from "../src/reactor.js"
import { DisplayReactor } from "../src/display-reactor.js"
import { isCallError, isCanisterError } from "../src/errors/index.js"
import {
  createTestCanister,
  installFakeReplica,
  type FakeReplica,
  type TestCanisterHandlers,
} from "../src/testing/index.js"

const BACKEND = "bkyz2-fmaaa-aaaaa-qaaaq-cai"

type DepositError = { InvalidAmount: null } | { Paused: { until: bigint } }

interface Backend {
  greet: ActorMethod<[string], string>
  whoami: ActorMethod<[], Principal>
  balance_of: ActorMethod<[Principal], bigint>
  deposit: ActorMethod<[bigint], { Ok: bigint } | { Err: DepositError }>
  stats: ActorMethod<[], [string, bigint]>
  reset: ActorMethod<[], undefined>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) => {
  const DepositError = IDL.Variant({
    InvalidAmount: IDL.Null,
    Paused: IDL.Record({ until: IDL.Nat64 }),
  })
  return IDL.Service({
    greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]),
    whoami: IDL.Func([], [IDL.Principal], ["query"]),
    balance_of: IDL.Func([IDL.Principal], [IDL.Nat], ["query"]),
    deposit: IDL.Func(
      [IDL.Nat],
      [IDL.Variant({ Ok: IDL.Nat, Err: DepositError })],
      []
    ),
    stats: IDL.Func([], [IDL.Text, IDL.Nat], ["composite_query"]),
    reset: IDL.Func([], [], []),
  })
}

let balances: Map<string, bigint>

/** A bank: each caller deposits into, and reads, a balance of its own. */
const bank: TestCanisterHandlers<Backend> = {
  greet: ([name]) => `Hello, ${name}!`,
  whoami: (_args, { caller }) => caller,
  balance_of: ([owner]) => balances.get(owner.toText()) ?? 0n,
  deposit: async ([amount], { caller }) => {
    await Promise.resolve()
    if (amount === 0n) return { Err: { InvalidAmount: null } }
    const next = (balances.get(caller.toText()) ?? 0n) + amount
    balances.set(caller.toText(), next)
    return { Ok: next }
  },
  stats: () => ["bank", BigInt(balances.size)],
  reset: () => {
    balances.clear()
  },
}

let replica: FakeReplica

const install = (handlers: TestCanisterHandlers<Backend> = bank) => {
  replica?.restore()
  replica = installFakeReplica({
    canisters: { [BACKEND]: createTestCanister<Backend>(idlFactory, handlers) },
  })
}

beforeEach(() => {
  balances = new Map()
  install()
})

afterEach(() => {
  replica.restore()
})

const manager = () =>
  new ClientManager({
    queryClient: new QueryClient(),
    agentOptions: { host: replica.host },
  })

const reactorOn = (clientManager = manager()) =>
  new Reactor<Backend>({
    clientManager,
    name: "backend",
    canisterId: BACKEND,
    idlFactory,
  })

const callsTo = (methodName: string) =>
  replica.requests.filter((request) => request.methodName === methodName)

describe("createTestCanister through a Reactor", () => {
  it("decodes the arguments a query sends and encodes what its handler returns", async () => {
    await expect(
      reactorOn().callMethod({ functionName: "greet", args: ["Ada"] })
    ).resolves.toBe("Hello, Ada!")
  })

  it("encodes several results as the tuple the reactor returns", async () => {
    await reactorOn().callMethod({ functionName: "deposit", args: [5n] })

    await expect(
      reactorOn().callMethod({ functionName: "stats" })
    ).resolves.toEqual(["bank", 1n])
  })

  it("runs a handler that returns nothing", async () => {
    const reactor = reactorOn()
    await reactor.callMethod({ functionName: "deposit", args: [5n] })

    await expect(
      reactor.callMethod({ functionName: "reset" })
    ).resolves.toBeUndefined()
    expect(balances.size).toBe(0)
  })

  it("tells a handler the principal the agent signs as", async () => {
    const clientManager = manager()
    const reactor = reactorOn(clientManager)

    await expect(
      reactor.callMethod({ functionName: "whoami" })
    ).resolves.toEqual(Principal.anonymous())

    const user = Ed25519KeyIdentity.generate()
    clientManager.updateAgent(user)
    await reactor.callMethod({ functionName: "deposit", args: [7n] })

    await expect(
      reactor.callMethod({ functionName: "whoami" })
    ).resolves.toEqual(user.getPrincipal())
    expect(balances.get(user.getPrincipal().toText())).toBe(7n)
  })

  it("unwraps an Ok, and throws a CanisterError for an Err", async () => {
    const reactor = reactorOn()

    await expect(
      reactor.callMethod({ functionName: "deposit", args: [3n] })
    ).resolves.toBe(3n)

    const error = await reactor
      .callMethod({ functionName: "deposit", args: [0n] })
      .catch((error: unknown) => error)
    expect(isCanisterError(error)).toBe(true)
    expect(isCanisterError(error) && error.code).toBe("InvalidAmount")
  })

  it("rejects a call whose handler throws as a trap, with a CallError", async () => {
    install({
      greet: () => {
        throw new Error("out of cycles")
      },
    })

    const error = await reactorOn()
      .callMethod({ functionName: "greet", args: ["Ada"] })
      .catch((error: unknown) => error)

    expect(isCallError(error)).toBe(true)
    expect(String(error)).toContain(
      `Canister ${BACKEND} trapped: out of cycles`
    )
  })

  it("caches a query under the reactor's own key", async () => {
    const reactor = reactorOn()
    const params = { functionName: "greet" as const, args: ["Ada"] as [string] }

    await reactor.fetchQuery(params)
    await reactor.fetchQuery(params)

    expect(callsTo("greet")).toHaveLength(1)
    expect(reactor.getQueryData(params)).toBe("Hello, Ada!")
    expect(
      reactor.queryClient.getQueryData(reactor.generateQueryKey(params))
    ).toBe("Hello, Ada!")
  })
})

describe("createTestCanister through a DisplayReactor", () => {
  it("takes and returns the display forms of the Candid values", async () => {
    const clientManager = manager()
    const user = Ed25519KeyIdentity.generate()
    clientManager.updateAgent(user)
    const display = new DisplayReactor<Backend>({
      clientManager,
      name: "backend",
      canisterId: BACKEND,
      idlFactory,
    })

    await expect(
      display.callMethod({ functionName: "deposit", args: ["12"] })
    ).resolves.toBe("12")
    await expect(
      display.callMethod({
        functionName: "balance_of",
        args: [user.getPrincipal().toText()],
      })
    ).resolves.toBe("12")
    await expect(display.callMethod({ functionName: "whoami" })).resolves.toBe(
      user.getPrincipal().toText()
    )
  })
})

describe("what createTestCanister rejects", () => {
  it("rejects a method with no handler, naming it", async () => {
    install({ greet: bank.greet })

    await expect(
      reactorOn().callMethod({ functionName: "whoami" })
    ).rejects.toThrow("createTestCanister: no handler answers 'whoami'")
  })

  it("rejects a query call to a method the interface does not mark query", async () => {
    // A client whose declarations call `deposit` as a query, as one built
    // from an outdated .did would.
    const staleIdl: IDL.InterfaceFactory = ({ IDL }) =>
      IDL.Service({ deposit: IDL.Func([IDL.Nat], [IDL.Nat], ["query"]) })
    const actor = Actor.createActor<{ deposit: ActorMethod<[bigint], bigint> }>(
      staleIdl,
      {
        agent: await HttpAgent.create({
          host: replica.host,
          shouldFetchRootKey: true,
        }),
        canisterId: BACKEND,
      }
    )

    await expect(actor.deposit(1n)).rejects.toThrow(
      "Canister has no query method 'deposit'"
    )
    expect(balances.size).toBe(0)
  })

  it("rejects a handler's result its Candid type does not accept, naming the handler", async () => {
    install({ greet: () => 42 as unknown as string })

    await expect(
      reactorOn().callMethod({ functionName: "greet", args: ["Ada"] })
    ).rejects.toThrow(
      "the 'greet' handler returned a value its Candid result type does not accept"
    )
  })

  it("refuses a handler for a method the service does not have", () => {
    expect(() =>
      createTestCanister<Backend>(idlFactory, {
        // @ts-expect-error not a method of the service
        grete: () => "typo",
      })
    ).toThrow('createTestCanister: the service has no method "grete"')
  })
})

describe("a recursive func alias", () => {
  it("is answered like any other method", async () => {
    // `type f = func (text) -> (text) query` referenced by itself, which the
    // IDL wraps in an `IDL.Rec`.
    const recursiveIdl: IDL.InterfaceFactory = ({ IDL }) => {
      const f = IDL.Rec()
      f.fill(IDL.Func([IDL.Text], [IDL.Text], ["query"]))
      return IDL.Service({ echo: f as unknown as IDL.FuncClass })
    }
    replica.restore()
    replica = installFakeReplica({
      canisters: {
        [BACKEND]: createTestCanister<{ echo: ActorMethod<[string], string> }>(
          recursiveIdl,
          { echo: ([text]) => text }
        ),
      },
    })
    const reactor = new Reactor<{ echo: ActorMethod<[string], string> }>({
      clientManager: manager(),
      name: "echo",
      canisterId: BACKEND,
      idlFactory: recursiveIdl,
    })

    await expect(
      reactor.callMethod({ functionName: "echo", args: ["hi"] })
    ).resolves.toBe("hi")
  })
})
