import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { QueryClient } from "@tanstack/query-core"
import { ClientManager } from "../src/client.js"
import { Reactor } from "../src/reactor.js"
import type { ReactorParameters } from "../src/types/reactor.js"
import { DisplayReactor } from "../src/display-reactor.js"
import { createPollingStrategy } from "../src/utils/polling.js"
import { isValidationError } from "../src/errors/index.js"
import { installFakeReplica, type FakeReplica } from "./fake-replica.js"

/**
 * An app that shows several canisters of one interface (a wallet of ICRC
 * ledgers) had two ways to reach them from one reactor, and both hurt. It
 * could retarget a shared reactor with setCanisterId, which moves every view
 * built on it at once, so two tokens cannot be on screen together, and each
 * switch races the calls still in flight. Or it could construct one reactor
 * per canister by hand, repeating the IDL, the ClientManager, the polling
 * options and the validators each time. `forCanister(id)` gives a memoized
 * sibling instead: the same class and configuration, another canister.
 */

const HOST = "http://127.0.0.1:4943"
const ICP = "ryjl3-tyaaa-aaaaa-aaaba-cai"
const CKBTC = "mxzaz-hqaaa-aaaar-qaada-cai"
const CKETH = "ss2fx-dyaaa-aaaar-qacoq-cai"

interface Ledger {
  icrc1_symbol: () => Promise<string>
  icrc1_balance_of: (owner: Principal) => Promise<bigint>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    icrc1_symbol: IDL.Func([], [IDL.Text], ["query"]),
    icrc1_balance_of: IDL.Func([IDL.Principal], [IDL.Nat], ["query"]),
  })

/** A ledger whose symbol and balances say which canister answered. */
const ledgerCanister = (symbol: string, balance: bigint) => ({
  query: (method: string) =>
    method === "icrc1_symbol"
      ? new Uint8Array(IDL.encode([IDL.Text], [symbol]))
      : new Uint8Array(IDL.encode([IDL.Nat], [balance])),
})

let replica: FakeReplica
let clientManager: ClientManager

beforeEach(() => {
  replica = installFakeReplica({
    host: HOST,
    canisters: {
      [ICP]: ledgerCanister("ICP", 1n),
      [CKBTC]: ledgerCanister("ckBTC", 2n),
      [CKETH]: ledgerCanister("ckETH", 3n),
    },
  })
  clientManager = new ClientManager({
    queryClient: new QueryClient(),
    agentOptions: { host: HOST, retryTimes: 0 },
  })
})

afterEach(() => {
  replica.restore()
})

const ledgerOn = (canisterId = ICP) =>
  new Reactor<Ledger>({ clientManager, name: "ledger", canisterId, idlFactory })

const queriedCanisters = () =>
  replica.requests
    .filter((request) => request.endpoint === "query")
    .map((request) => request.canisterId)

describe("Reactor.forCanister", () => {
  it("calls its own canister and caches under its own key, beside the original's", async () => {
    const icp = ledgerOn()
    const ckbtc = icp.forCanister(CKBTC)

    await expect(
      ckbtc.fetchQuery({ functionName: "icrc1_symbol" })
    ).resolves.toBe("ckBTC")
    await expect(
      icp.fetchQuery({ functionName: "icrc1_symbol" })
    ).resolves.toBe("ICP")

    expect(queriedCanisters()).toEqual([CKBTC, ICP])
    expect(ckbtc.generateQueryKey({ functionName: "icrc1_symbol" })).toEqual([
      CKBTC,
      "icrc1_symbol",
    ])
    expect(ckbtc.getQueryData({ functionName: "icrc1_symbol" })).toBe("ckBTC")
    expect(icp.getQueryData({ functionName: "icrc1_symbol" })).toBe("ICP")
  })

  it("is the same class, on the same ClientManager, name and polling options", () => {
    const pollingOptions = { strategy: createPollingStrategy() }
    const icp = new Reactor<Ledger>({
      clientManager,
      name: "ledger",
      canisterId: ICP,
      idlFactory,
      pollingOptions,
    })
    const ckbtc = icp.forCanister(CKBTC)

    expect(ckbtc).toBeInstanceOf(Reactor)
    expect(ckbtc).not.toBe(icp)
    expect(ckbtc.canisterId.toText()).toBe(CKBTC)
    expect(ckbtc.clientManager).toBe(clientManager)
    expect(ckbtc.queryClient).toBe(icp.queryClient)
    expect(ckbtc.name).toBe("ledger")
    expect(ckbtc.pollingOptions).toBe(pollingOptions)
    expect(ckbtc.transform).toBe("candid")
    expect(ckbtc.getServiceInterface()._fields.map(([name]) => name)).toEqual(
      icp.getServiceInterface()._fields.map(([name]) => name)
    )
  })

  it("registers the canister with the ClientManager, so a sign-in sweeps its queries", () => {
    ledgerOn().forCanister(CKETH)
    expect(clientManager.connectedCanisterIds()).toContain(CKETH)
  })

  it("gives the same reactor for the same canister, in either form", () => {
    const icp = ledgerOn()
    const ckbtc = icp.forCanister(CKBTC)

    expect(icp.forCanister(CKBTC)).toBe(ckbtc)
    expect(icp.forCanister(Principal.fromText(CKBTC))).toBe(ckbtc)
  })

  it("shares the memo across the family", () => {
    const icp = ledgerOn()
    const ckbtc = icp.forCanister(CKBTC)
    const cketh = icp.forCanister(CKETH)

    expect(ckbtc.forCanister(CKETH)).toBe(cketh)
    expect(cketh.forCanister(CKBTC)).toBe(ckbtc)
    expect(ckbtc.forCanister(CKBTC)).toBe(ckbtc)
  })

  it("keeps a sibling of the original's own canister where it is when the original moves", async () => {
    const icp = ledgerOn()
    const sibling = icp.forCanister(ICP)
    expect(sibling).not.toBe(icp)

    icp.setCanisterId(CKBTC)

    expect(sibling.canisterId.toText()).toBe(ICP)
    expect(icp.forCanister(ICP)).toBe(sibling)
    await expect(
      sibling.fetchQuery({ functionName: "icrc1_symbol" })
    ).resolves.toBe("ICP")
  })

  it("gives the sibling its own copy of the interface", () => {
    const icp = ledgerOn()
    const ckbtc = icp.forCanister(CKBTC)

    expect(ckbtc.getServiceInterface()).not.toBe(icp.getServiceInterface())
    // What a candid package reactor's registerMethod does to its service.
    icp.service._fields.push([
      "icrc1_name",
      IDL.Func([], [IDL.Text], ["query"]),
    ])
    expect(ckbtc.getServiceInterface()._fields).toHaveLength(2)
  })
})

describe("forCanister on a subclass", () => {
  it("builds the subclass, whose own members come along", async () => {
    class SymbolReactor extends Reactor<Ledger> {
      symbol() {
        return this.fetchQuery({ functionName: "icrc1_symbol" })
      }
    }
    const icp = new SymbolReactor({
      clientManager,
      name: "ledger",
      canisterId: ICP,
      idlFactory,
    })

    const ckbtc = icp.forCanister(CKBTC)
    expect(ckbtc).toBeInstanceOf(SymbolReactor)
    await expect(ckbtc.symbol()).resolves.toBe("ckBTC")
  })

  it("throws rather than hand out a reactor its constructor put on another canister", () => {
    // A constructor that pins the canister instead of taking the one given.
    class IcpLedger extends Reactor<Ledger> {
      constructor(config: ReactorParameters) {
        super({ ...config, canisterId: ICP })
      }
    }
    const icp = new IcpLedger({ clientManager, name: "ledger", idlFactory })

    expect(() => icp.forCanister(CKBTC)).toThrow(
      `forCanister("${CKBTC}") on "ledger" made a reactor for ${ICP} instead`
    )
    // Not remembered either: asking again fails the same way.
    expect(() => icp.forCanister(CKBTC)).toThrow("IcpLedger constructor")
  })
})

describe("DisplayReactor.forCanister", () => {
  const displayLedgerOn = () =>
    new DisplayReactor<Ledger>({
      clientManager,
      name: "ledger",
      canisterId: ICP,
      idlFactory,
      validators: {
        icrc1_balance_of: ([owner]) =>
          owner === "aaaaa-aa"
            ? {
                success: false,
                issues: [{ path: [0], message: "not the management canister" }],
              }
            : { success: true },
      },
    })

  it("is a DisplayReactor that returns display values", async () => {
    const ckbtc = displayLedgerOn().forCanister(CKBTC)

    expect(ckbtc).toBeInstanceOf(DisplayReactor)
    expect(ckbtc.transform).toBe("display")
    await expect(
      ckbtc.fetchQuery({
        functionName: "icrc1_balance_of",
        args: [Principal.anonymous().toText()],
      })
    ).resolves.toBe("2")
    expect(queriedCanisters()).toEqual([CKBTC])
  })

  it("starts with the original's validators", async () => {
    const ckbtc = displayLedgerOn().forCanister(CKBTC)

    const refused = await ckbtc
      .callMethod({ functionName: "icrc1_balance_of", args: ["aaaaa-aa"] })
      .catch((error: unknown) => error)
    expect(isValidationError(refused)).toBe(true)
    // Refused before it left the client.
    expect(queriedCanisters()).toEqual([])
  })

  it("keeps later validators to the reactor they were registered on", () => {
    const icp = displayLedgerOn()
    const ckbtc = icp.forCanister(CKBTC)

    ckbtc.registerValidator("icrc1_symbol", () => ({ success: true }))
    icp.unregisterValidator("icrc1_balance_of")

    expect(ckbtc.hasValidator("icrc1_symbol")).toBe(true)
    expect(icp.hasValidator("icrc1_symbol")).toBe(false)
    expect(ckbtc.hasValidator("icrc1_balance_of")).toBe(true)
  })
})
