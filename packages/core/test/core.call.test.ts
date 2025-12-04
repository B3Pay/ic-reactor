import { describe, it, expect } from "bun:test"
import { ActorMethod } from "@icp-sdk/core/agent"
import { createReactorCore } from "../src"

const ICRC1_CANISTERS = [
  { canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai", symbol: "ICP" },
  { canisterId: "ss2fx-dyaaa-aaaar-qacoq-cai", symbol: "ckETH" },
  { canisterId: "mxzaz-hqaaa-aaaar-qaada-cai", symbol: "ckBTC" },
  { canisterId: "apia6-jaaaa-aaaar-qabma-cai", symbol: "ckSepoliaETH" },
  { canisterId: "yfumr-cyaaa-aaaar-qaela-cai", symbol: "ckSepoliaUSDC" },
]

export const idlFactory = ({ IDL }: any) => {
  return IDL.Service({
    icrc1_symbol: IDL.Func([], [IDL.Text], ["query"]),
  })
}

export interface Backend {
  icrc1_symbol: ActorMethod<[], string>
}

describe("My IC Store and Actions", () => {
  const { queryCall, updateCall } = createReactorCore<Backend>({
    canisterId: ICRC1_CANISTERS[0].canisterId,
    idlFactory,
  })

  it("should return the ICP", async () => {
    const { call } = updateCall({
      functionName: "icrc1_symbol",
    })

    const data = await call()

    expect(data).toEqual(ICRC1_CANISTERS[0].symbol)
  })

  it("should return the ckETH", async () => {
    const { call } = updateCall({
      canisterId: ICRC1_CANISTERS[1].canisterId,
      functionName: "icrc1_symbol",
    })

    const data = await call()

    expect(data).toEqual(ICRC1_CANISTERS[1].symbol)
  })

  it("should return the Symbol for each canister", async () => {
    for await (const canister of ICRC1_CANISTERS) {
      const { dataPromise } = queryCall({
        canisterId: canister.canisterId,
        functionName: "icrc1_symbol",
      })

      const data = await dataPromise

      expect(data).toEqual(canister.symbol)
    }
  })
})
