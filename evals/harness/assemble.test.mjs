// Tests of the prompt variants (harness/assemble.mjs).
//
//   node --test harness/assemble.test.mjs
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import {
  CONDITIONS,
  PROMPT_VARIANTS,
  RUN_TEXT,
  TASKS,
  conditionSpec,
  promptFile,
  renderPrompt,
} from "./assemble.mjs"

const template = (task, variant) =>
  readFileSync(promptFile(task, variant), "utf8")

describe("prompt parity", () => {
  for (const task of TASKS) {
    for (const variant of PROMPT_VARIANTS) {
      for (const mode of Object.keys(RUN_TEXT)) {
        it(`${task} ${variant} ${mode}: conditions differ only in the library line`, () => {
          const rendered = CONDITIONS.map((c) =>
            renderPrompt(task, c, mode, variant).split("\n")
          )
          const [first, ...rest] = rendered
          for (const [k, lines] of rest.entries()) {
            assert.equal(lines.length, first.length)
            const differing = lines
              .map((line, i) => (line === first[i] ? null : i))
              .filter((i) => i !== null)
            // At most one line differs, and it is the {{LIBRARY}} line.
            assert.ok(
              differing.length <= 1,
              `${CONDITIONS[k + 1]}: ${differing}`
            )
            const libraryLine = template(task, variant)
              .split("\n")
              .indexOf("{{LIBRARY}}")
            for (const i of differing) assert.equal(i, libraryLine)
            assert.equal(
              lines[libraryLine],
              conditionSpec(CONDITIONS[k + 1]).library
            )
          }
        })
      }
    }
  }
  it("rejects an unknown variant", () => {
    assert.throws(
      () => renderPrompt("node-tool", "thin", "sandboxed", "terse"),
      /unknown prompt variant/
    )
  })
})

// The contract the hidden tests read: stated in both variants.
const CONTRACT = {
  "node-tool": [
    "createLedgerTool(config)",
    "src/contract.ts",
    "getBalance(owner: string): Promise<bigint>",
    "icrc1_balance_of",
    "icrc1_transfer",
    "8 decimals",
    "`config.rootKey`",
    "`config.identity`",
    "{ ok: true, blockIndex }",
    "{ ok: false, mayHaveExecuted, reason }",
  ],
  "react-wallet": [
    "`signin`",
    "`signout`",
    "`balance`",
    "`transfer-to`",
    "`transfer-amount`",
    "`transfer-submit`",
    "`transfer-status`",
    "data-state",
    "`idle`",
    "`pending`",
    "`success`",
    "`error`",
    "`unknown`",
    "exactly 8",
    "no grouping",
    "icrc1_balance_of",
    "icrc1_transfer",
    "`rootKey`",
  ],
}

// The safety rules the explicit prompt states and the minimal one must not.
const RULES = [
  /reject code/i,
  /\b4xx\b|\b5xx\b|\b408\b|HTTP/,
  /anonymous principal/i,
  /\bnever\b/i,
  /nat64|18446744073709551615/,
  /more than 8 fraction digits/i,
  /without contacting the ledger/i,
  /fetch (a|the) root key/i,
  /localhost|127\.0\.0\.1|\[::1\]/,
  /again automatically|send it again|sent again/i,
  /read again|re-?read/i,
  /different principal|previous principal/i,
  /`number`/,
  /Requirements/,
]

describe("prompt variants", () => {
  for (const task of TASKS) {
    it(`${task}: both variants state the contract the tests read`, () => {
      for (const variant of PROMPT_VARIANTS) {
        const text = template(task, variant)
        for (const needle of CONTRACT[task]) {
          assert.ok(text.includes(needle), `${variant} lacks ${needle}`)
        }
      }
    })
    it(`${task}: the explicit prompt states the rules, the minimal one does not`, () => {
      const explicit = template(task, "explicit")
      const minimal = template(task, "minimal")
      assert.ok(RULES.filter((r) => r.test(explicit)).length >= 8)
      for (const rule of RULES) {
        assert.ok(!rule.test(minimal), `minimal matches ${rule}`)
      }
    })
  }
  it("the minimal prompts define the outcome vocabulary", () => {
    assert.match(
      template("node-tool", "minimal"),
      /`mayHaveExecuted`\s+says whether the transfer could nevertheless have taken\s+effect/
    )
    assert.match(
      template("react-wallet", "minimal"),
      /`unknown` \(it\s+failed, but may\s+nevertheless have taken effect\)/
    )
  })
})
