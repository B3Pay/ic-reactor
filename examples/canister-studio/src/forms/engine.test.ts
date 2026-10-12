import {
  c,
  principal,
  serviceMethods,
  type AnyFieldSchema,
  type AnySchema,
  type ServiceMethod,
} from "@candid-core/schema"
import { decodeArgs } from "@candid-core/schema/codec"
import { schemaFromContract } from "@candid-core/schema/contract"
import { createTestClient } from "@ic-reactor/core/testing"
import { describe, expect, it } from "vitest"
import minterEnvelope from "../canisters/ckbtc_minter.envelope.json"
import { actor as minterActor } from "../canisters/ckbtc_minter.ts"
import icpEnvelope from "../canisters/icp_ledger.envelope.json"
import { actor as icpActor } from "../canisters/icp_ledger.ts"
import icrc1Envelope from "../canisters/icrc1.envelope.json"
import {
  actor as icrc1Actor,
  TransferArg,
  type Actor as Icrc1Actor,
  type TransferArg as TransferArgValue,
} from "../canisters/icrc1.ts"
import { toHex } from "../lib/hex.ts"
import {
  checkCall,
  draftFromValue,
  fillNanos,
  initialDraft,
  issuesFromReactorError,
  mapDrafts,
  orderFields,
  pathLabel,
  renderedPaths,
  argPath,
  fieldsOf,
  resolve,
  selectArm,
  type Draft,
} from "./engine.ts"

const ANON = "2vxsx-fae"
const LEDGER = "mxzaz-hqaaa-aaaar-qaada-cai"

function methodsOf(envelope: unknown): ServiceMethod[] {
  const built = schemaFromContract(envelope)
  if (!built.ok || built.actor === undefined)
    throw new Error("the committed envelope does not load")
  return [...serviceMethods(built.actor).values()]
}

const MODULES: readonly [string, unknown, AnySchema][] = [
  ["icrc1", icrc1Envelope, icrc1Actor],
  ["icp_ledger", icpEnvelope, icpActor],
  ["ckbtc_minter", minterEnvelope, minterActor],
]

/** Every leaf of the drafts replaced: text that no number or principal parses. */
const poison = (text: string) => (at: { draft: Draft }) =>
  at.draft.k === "leaf"
    ? ({ k: "leaf", text } as const)
    : at.draft.k === "bytes"
      ? ({ k: "bytes", text: "zz", format: "hex" } as const)
      : undefined

describe.each(MODULES)("every method of %s", (_name, envelope, actor) => {
  const methods = methodsOf(envelope)
  const generated = serviceMethods(actor)

  it("has defaults that validate, encode and decode back", () => {
    expect(methods.length).toBeGreaterThan(0)
    for (const m of methods) {
      const check = checkCall(
        m.args,
        m.args.map((a) => initialDraft(a, { principal: ANON }))
      )
      // None of the three interfaces has an argument without values.
      expect(check.uninhabited, m.name).toBeUndefined()
      expect(check.issues, m.name).toEqual([])
      expect(check.ok, m.name).toBe(true)
      const bytes = check.bytes as Uint8Array
      expect(toHex(bytes.subarray(0, 4)), m.name).toBe("4449444c") // "DIDL"
      const decoded = decodeArgs(m.args, bytes)
      expect(decoded.ok && decoded.values, m.name).toEqual(check.values)
    }
  })

  it("round-trips values through drafts, byte for byte", () => {
    for (const m of methods) {
      const first = checkCall(
        m.args,
        m.args.map((a) => initialDraft(a, { principal: ANON }))
      )
      const values = first.values ?? []
      const again = checkCall(
        m.args,
        m.args.map((a, i) => draftFromValue(a, values[i]))
      )
      expect(again.bytes, m.name).toEqual(first.bytes)
    }
  })

  it("encodes the same bytes as the generated module", () => {
    for (const m of methods) {
      const g = generated.get(m.name)
      expect(g, m.name).toBeDefined()
      if (g === undefined) continue
      const fromEnvelope = checkCall(
        m.args,
        m.args.map((a) => initialDraft(a, { principal: ANON }))
      )
      const fromModule = checkCall(
        g.args,
        g.args.map((a) => initialDraft(a, { principal: ANON }))
      )
      expect(fromModule.bytes, m.name).toEqual(fromEnvelope.bytes)
    }
  })

  it.each([
    ["unparsable text", "%"],
    ["a negative number", "-1"],
  ])("puts every issue of %s on a rendered field", (_what, text) => {
    for (const m of methods) {
      const drafts = mapDrafts(
        m.args,
        m.args.map((a) => initialDraft(a)),
        poison(text)
      )
      const check = checkCall(m.args, drafts)
      const values = check.values ?? []
      const paths = new Set<string>()
      m.args.forEach((a, i) => renderedPaths(a, values[i], argPath(i), paths))
      for (const issue of check.issues)
        expect(paths.has(issue.path), `${m.name} ${issue.path}`).toBe(true)
    }
  })
})

describe("drafts and values", () => {
  const transfer: TransferArgValue = {
    to: {
      owner: principal("ryjl3-tyaaa-aaaaa-aaaba-cai"),
      subaccount: new Uint8Array(32).fill(1),
    },
    fee: 10n,
    memo: Uint8Array.of(0x68, 0x69),
    from_subaccount: null,
    created_at_time: 1_760_000_000_123_456_789n,
    amount: 2n ** 70n,
  }

  it("round-trips an ICRC-1 transfer exactly, bigints past 2^53 included", () => {
    const check = checkCall(
      [TransferArg],
      [draftFromValue(TransferArg, transfer)]
    )
    expect(check.ok).toBe(true)
    expect(check.values).toEqual([transfer])
    // One argument: vars is the value itself, never [value].
    expect(check.vars).toEqual(transfer)
  })

  it("reads loose JSON: digit strings, hex blobs, byte arrays, [v] opts, { Tag: payload }", () => {
    const loose = {
      to: { owner: "ryjl3-tyaaa-aaaaa-aaaba-cai", subaccount: [1, 2, 3] },
      fee: ["10"],
      memo: "6869",
      from_subaccount: null,
      created_at_time: 5,
      amount: "1180591620717411303424",
    }
    const check = checkCall([TransferArg], [draftFromValue(TransferArg, loose)])
    expect(check.issues).toEqual([])
    expect(check.values).toEqual([
      {
        ...transfer,
        to: { ...transfer.to, subaccount: new Uint8Array([1, 2, 3]) },
        created_at_time: 5n,
      },
    ])
    const value = c.variant({ Nat: c.nat, Text: c.text })
    expect(
      checkCall([value], [draftFromValue(value, { Text: "x" })]).values
    ).toEqual([{ tag: "Text", value: "x" }])
  })

  it("never shows a different amount for a JSON number past 2^53", () => {
    const draft = draftFromValue(c.nat, 2 ** 60)
    expect(draft).toEqual({ k: "leaf", text: "" })
    expect(checkCall([c.nat], [draft]).issues[0]).toMatchObject({
      path: "$args[0]",
      code: "parse",
      message: "required",
    })
  })

  it("orders required fields first, then the optional ones", () => {
    const node = resolve(TransferArg)
    if (node.kind !== "record") throw new Error("TransferArg is a record")
    expect(orderFields(fieldsOf(node)).map(([key]) => key)).toEqual([
      "to",
      "amount",
      "fee",
      "memo",
      "from_subaccount",
      "created_at_time",
    ])
  })

  it("names fields by their path for people", () => {
    expect(pathLabel("$args[0].to.owner", 1)).toBe("to.owner")
    expect(pathLabel("$args[0]", 1)).toBe("argument")
    expect(pathLabel("$args[1][0]", 2)).toBe("arg1[0]")
    expect(pathLabel("$", 2)).toBe("arguments")
  })

  it("reports friendly parse messages at the leaf's path", () => {
    const draft = draftFromValue(TransferArg, {
      ...transfer,
      to: { owner: "", subaccount: null },
    })
    const issues = checkCall([TransferArg], [draft]).issues
    expect(issues).toEqual([
      { path: "$args[0].to.owner", code: "parse", message: "required" },
    ])
    const upper = draftFromValue(TransferArg, {
      ...transfer,
      to: { owner: "RYJL3-TYAAA-AAAAA-AAABA-CAI", subaccount: null },
    })
    expect(checkCall([TransferArg], [upper]).issues[0]?.message).toBe(
      "principal text is lower case"
    )
  })

  it("leaves range checks to validate, with its exact bounds", () => {
    const issues = checkCall([c.nat8], [{ k: "leaf", text: "300" }]).issues
    expect(issues).toEqual([
      expect.objectContaining({ path: "$args[0]", code: "out_of_range" }),
    ])
  })

  it("fills a time in nanoseconds: an opt, a leaf, ICP's TimeStamp record", () => {
    const optTime = c.opt(c.nat64)
    expect(fillNanos(optTime, { k: "opt", present: false }, 7n)).toEqual({
      k: "opt",
      present: true,
      inner: { k: "leaf", text: "7" },
    })
    const stamp = c.opt(c.record({ timestamp_nanos: c.nat64 }))
    const filled = fillNanos(stamp, initialDraft(stamp), 9n)
    expect(checkCall([stamp], [filled]).values).toEqual([
      { timestamp_nanos: 9n },
    ])
  })

  it("keeps each visited arm's payload when switching variants", () => {
    const v = c.variant({ A: c.nat, B: c.text, C: c.null })
    let draft = initialDraft(v)
    draft = selectArm(v, draft, "B")
    if (draft.k !== "variant") throw new Error("a variant draft")
    draft = {
      ...draft,
      payloads: { ...draft.payloads, B: { k: "leaf", text: "kept" } },
    }
    draft = selectArm(v, selectArm(v, draft, "C"), "B")
    expect(checkCall([v], [draft]).values).toEqual([
      { tag: "B", value: "kept" },
    ])
    expect(checkCall([v], [selectArm(v, draft, "C")]).values).toEqual([
      { tag: "C" },
    ])
  })
})

describe("issuesFromReactorError", () => {
  it("maps an invalid_args ReactorError's issues to $args[i] field paths", async () => {
    const { client, mock } = createTestClient({ network: "ic" })
    mock<Icrc1Actor>(icrc1Actor, LEDGER, { icrc1_balance_of: () => 0n })
    const ledger = client.canister<Icrc1Actor>(icrc1Actor, { id: LEDGER })
    let error: unknown
    try {
      // A principal that is not canonical text: the client refuses to encode it.
      await ledger.icrc1_balance_of({
        owner: "not a principal",
        subaccount: null,
      } as never)
    } catch (e) {
      error = e
    }
    const issues = issuesFromReactorError(error)
    expect(issues).toEqual([
      expect.objectContaining({ path: "$args[0].owner", code: "invalid_type" }),
    ])
    // The same path a form field renders for that argument.
    const value = { owner: "", subaccount: null }
    const icrc1 = methodsOf(icrc1Envelope).find(
      (m) => m.name === "icrc1_balance_of"
    )
    const schema = icrc1?.args[0] as AnyFieldSchema
    expect(renderedPaths(schema, value, argPath(0)).has("$args[0].owner")).toBe(
      true
    )
  })

  it("gives nothing for other errors", () => {
    expect(issuesFromReactorError(new Error("boom"))).toEqual([])
    expect(issuesFromReactorError({ kind: "rejected", issues: [] })).toEqual([])
    expect(issuesFromReactorError(undefined)).toEqual([])
  })

  it("reads a recorded error of the same shape", () => {
    expect(
      issuesFromReactorError({
        kind: "invalid_args",
        issues: [
          {
            path: "$args[0].amount",
            code: "invalid_type",
            message: "m",
            extra: 1,
          },
        ],
      })
    ).toEqual([{ path: "$args[0].amount", code: "invalid_type", message: "m" }])
  })
})
