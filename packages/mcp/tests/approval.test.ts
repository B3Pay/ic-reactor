// The approval form's text, for any client: plain, or rendered as Markdown.
import { describe, expect, it } from "vitest"
import { approvalMessage, type ApprovalFacts } from "../src/server/approval.ts"

const facts: ApprovalFacts = {
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
  canisterName: "ledger",
  method: "icrc1_transfer",
  mode: "update",
  caller: "2vxsx-fae",
  callerSource: "from a test key",
  network: "a fake replica",
  argsText: '(\n  record { memo = "<!-- hidden -->"; amount = 5 : nat },\n)',
  argBytes: 42,
  argSha256: "ab".repeat(32),
  provenance: { kind: "metadata", certified: true, moduleHash: null },
}

/** The lines between the opening fence and the first line that closes it, as CommonMark reads them. */
function fenced(message: string): { fence: string; inside: string[] } {
  const lines = message.split("\n")
  const open = lines.findIndex((line) => /^`{3,}$/.test(line))
  const fence = lines[open] ?? ""
  const close = lines.findIndex(
    (line, i) =>
      i > open && new RegExp(`^ {0,3}\`{${fence.length},}\\s*$`).test(line)
  )
  return { fence, inside: lines.slice(open + 1, close) }
}

describe("approvalMessage", () => {
  it("puts the facts and the arguments in one code fence", () => {
    const message = approvalMessage(facts)
    const { fence, inside } = fenced(message)
    expect(fence).toBe("```")
    expect(inside[0]).toBe("Canister: ryjl3-tyaaa-aaaaa-aaaba-cai (ledger)")
    expect(inside).toContain(
      '  record { memo = "<!-- hidden -->"; amount = 5 : nat },'
    )
    expect(inside.at(-1)).toMatch(/^Interface: /)
    expect(message.split("\n").at(-1)).toMatch(/^Nothing is sent unless/)
  })

  it("makes the fence longer than any run of backticks that starts a line inside it", () => {
    const message = approvalMessage({
      ...facts,
      argsText: "(\n```\n   ````\n    `````\n)",
    })
    const { fence, inside } = fenced(message)
    // Four spaces of indentation make a line code, never a closing fence.
    expect(fence).toBe("`````")
    expect(inside).toContain("    `````")
    expect(inside.at(-1)).toMatch(/^Interface: /)
  })

  it("writes a method name that is not a plain identifier as a Candid string", () => {
    const message = approvalMessage({ ...facts, method: "send‮" })
    expect(message).toContain('Method:   "send\\u{202e}"')
  })
})
