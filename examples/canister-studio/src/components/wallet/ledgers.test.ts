import { describe, expect, it } from "vitest"
import { actor } from "../../canisters/icrc1.ts"
import {
  CKBTC_MINTER,
  ledgerInterface,
  transferMethod,
  WALLET_LEDGER_KEYS,
  WALLET_LEDGERS,
} from "./ledgers.ts"

describe("wallet ledgers", () => {
  it("are the registry's three ledgers and the minter", () => {
    expect(WALLET_LEDGER_KEYS.map((key) => WALLET_LEDGERS[key].id)).toEqual([
      "ryjl3-tyaaa-aaaaa-aaaba-cai",
      "mxzaz-hqaaa-aaaar-qaada-cai",
      "ss2fx-dyaaa-aaaar-qacoq-cai",
    ])
    expect(CKBTC_MINTER.id).toBe("mqygn-kiaaa-aaaar-qaadq-cai")
  })

  it("type every ledger with the icrc1 module, one stable interface each", () => {
    const icp = ledgerInterface(WALLET_LEDGERS.icp)
    expect(icp.actor).toBe(actor)
    expect(icp.canisterId).toBe(WALLET_LEDGERS.icp.id)
    expect(ledgerInterface(WALLET_LEDGERS.icp)).toBe(icp)
    expect(ledgerInterface(WALLET_LEDGERS.ckbtc)).not.toBe(icp)

    const names = icp.methods.map((m) => m.name)
    expect(names).toEqual([...names].sort())
    expect(transferMethod(icp)).toMatchObject({
      name: "icrc1_transfer",
      mode: "update",
    })
    expect(icp.method("__proto__")).toBeUndefined()
  })
})
