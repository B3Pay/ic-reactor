import { describe, it, expect } from "vitest"
import { QueryClient } from "@tanstack/query-core"
import { Actor, ActorMethod, ActorSubclass } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager } from "../src/client"
import { Reactor } from "../src/reactor"

describe("ICP Integration Test", () => {
  it.skip("should fetch ICP token symbol from mainnet", async () => {
    // 1. Initialize ClientManager connected to Mainnet
    const clientManager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: {
        host: "https://icp-api.io",
      },
    })

    // 2. Define minimal IDL for Ledger Canister
    const idlFactory = () =>
      IDL.Service({
        symbol: IDL.Func([], [IDL.Record({ symbol: IDL.Text })], ["query"]),
      })

    type LedgerActor = ActorSubclass<{
      symbol: ActorMethod<[], { symbol: string }>
    }>

    // 3. Initialize Reactor for ICP Ledger
    const ledgerReactor = new Reactor<LedgerActor>({
      name: "ledger-reactor",
      clientManager,
      canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
      idlFactory,
    })

    // 4. Call the 'symbol' method
    const result = await ledgerReactor.callMethod({
      functionName: "symbol",
    })

    // 5. Assert the result
    expect(result).toEqual({ symbol: "ICP" })
  })

  it.skip("should fetch ICP token symbol from mainnet using actor directly", async () => {
    // 1. Initialize ClientManager connected to Mainnet
    const clientManager = new ClientManager({
      queryClient: new QueryClient(),
      agentOptions: {
        host: "https://icp-api.io",
      },
    })

    // 2. Define minimal IDL for Ledger Canister
    const idlFactory = ({ IDL }: { IDL: any }) => {
      return IDL.Service({
        symbol: IDL.Func([], [IDL.Record({ symbol: IDL.Text })], ["query"]),
      })
    }

    type LedgerActor = ActorSubclass<{
      symbol: ActorMethod<[], { symbol: string }>
    }>

    // 3. Initialize Reactor for ICP Ledger
    const ledgerReactor = new Reactor({
      name: "ledger-reactor",
      clientManager,
      idlFactory,
    })

    // 4. Call the 'symbol' method
    const result = await ledgerReactor.callMethod({
      functionName: "symbol",
    })

    // 5. Assert the result
    expect(result).toEqual({ symbol: "ICP" })
  })
})
