// What `pnpm faucet` accepts before it moves any ICP.
import { describe, expect, it } from "vitest"
import { readFaucetArgs } from "./faucet-args.ts"

const ME = "psith-oknjz-x73tv-7x3p4-a2sji-7o6lo-g2754-yfgfl-3vlqe-irrrt-4ae"

describe("the faucet's arguments", () => {
  it("sends 10 ICP unless told how much", () => {
    expect(readFaucetArgs([ME])).toEqual({ ok: true, to: ME, amount: "10" })
    expect(readFaucetArgs([ME, "0.5"])).toEqual({
      ok: true,
      to: ME,
      amount: "0.5",
    })
  })

  it.each([
    [[], "Usage: pnpm faucet <principal> [amount in ICP]"],
    [[ME, "1", "2"], "Usage: pnpm faucet <principal> [amount in ICP]"],
    [["me"], "Not a principal: me"],
    [[ME, "1e3"], "Not an ICP amount: 1e3 (plain digits, at most 8 decimals)"],
    [
      [ME, "0.000000001"],
      "Not an ICP amount: 0.000000001 (plain digits, at most 8 decimals)",
    ],
    [[ME, "0"], "Send more than zero."],
  ])("refuses %j", (args, reason) => {
    expect(readFaucetArgs(args)).toEqual({ ok: false, reason })
  })
})
