import { ActorMethod } from "@dfinity/agent"
import { createActorManager, createAgentManager } from "../src"
import { IC_HOST_NETWORK_URI } from "../src/utils"
import { PollStrategyFactory } from "@dfinity/agent/lib/cjs/polling"

export const ICRC1_CANISTERS = [
  { canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai", symbol: "ICP" },
  { canisterId: "ss2fx-dyaaa-aaaar-qacoq-cai", symbol: "ckETH" },
  { canisterId: "mxzaz-hqaaa-aaaar-qaada-cai", symbol: "ckBTC" },
  { canisterId: "apia6-jaaaa-aaaar-qabma-cai", symbol: "ckSepoliaETH" },
  { canisterId: "yfumr-cyaaa-aaaar-qaela-cai", symbol: "ckSepoliaUSDC" },
]

export const idlFactory = ({ IDL }) => {
  return IDL.Service({
    icrc1_symbol: IDL.Func([], [IDL.Text], ["query"]),
  })
}

export interface Backend {
  icrc1_symbol: ActorMethod<[], string>
}

describe("My IC Store and Actions", () => {
  const agentManager = createAgentManager({
    host: IC_HOST_NETWORK_URI,
  })

  const { callMethod, callMethodWithOptions } = createActorManager<Backend>({
    agentManager,
    idlFactory,
    canisterId: ICRC1_CANISTERS[0].canisterId,
  })

  it("should return the ICP", async () => {
    const symbol = await callMethod("icrc1_symbol")

    expect(symbol).toEqual(ICRC1_CANISTERS[0].symbol)
  })

  it("should return the ICP withOptions", async () => {
    const symbol = await callMethodWithOptions({})("icrc1_symbol")

    expect(symbol).toEqual(ICRC1_CANISTERS[0].symbol)
  })

  it("should return the ICRC1_CANISTERS", async () => {
    const pollingStrategyFactory: PollStrategyFactory = () => {
      return async (canisterId, requestId, status) => {
        console.log({ canisterId, requestId, status })
      }
    }

    for (const canister of ICRC1_CANISTERS) {
      const symbol = await callMethodWithOptions({
        pollingStrategyFactory,
        canisterId: canister.canisterId,
      })("icrc1_symbol")

      expect(symbol).toEqual(canister.symbol)
    }
  })
})
