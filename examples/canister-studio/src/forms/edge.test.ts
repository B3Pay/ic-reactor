// Edge cases through the path a live canister takes: .did text →
// didToContract (the CLI's WASM, offline) → schemaFromContract → the engine.
import { didToContract } from "@candid-core/cli"
import { serviceMethods, type ServiceMethod } from "@candid-core/schema"
import { schemaFromContract } from "@candid-core/schema/contract"
import { beforeAll, describe, expect, it } from "vitest"
import {
  checkCall,
  controlOf,
  defaultValue,
  draftFromValue,
  initialDraft,
  isUninhabited,
  selectArm,
  UNINHABITED,
  type Draft,
} from "./engine.ts"

const DID = `
type List = opt record { head : int; tail : List };
type Tree = variant { node : record { left : Tree; right : Tree }; leaf : nat };
type Loop = record { next : Loop };
type Settings = record {
  label : opt opt text;
  maybe_null : opt null;
  anything : opt reserved;
  r : reserved;
};
type Weird = record { 7 : bool; "has space" : nat8; quoted : float32 };
type Cb = func (nat) -> (text) query;
type Svc = service { ping : () -> () };
type Shape = variant { never : empty; circle : float64; dot };
service : {
  push : (list : List, value : int) -> (List);
  grow : (Tree) -> (Tree) query;
  spin : (Loop) -> ();
  settings : (Settings) -> (Settings);
  weird : (Weird, record { nat16; text }, record {}) -> ();
  refs : (cb : Cb, svc : Svc) -> (Cb, Svc) query;
  shape : (Shape, blob) -> ();
  impossible : (empty) -> ();
  proto : (record { "__proto__" : nat8; constructor : text; toString : opt bool }) -> ();
  arms : (variant { "__proto__" : nat; constructor; valueOf : text }) -> ();
}
`

let methods: ReadonlyMap<string, ServiceMethod>
const method = (name: string): ServiceMethod => {
  const m = methods.get(name)
  if (m === undefined) throw new Error(`no method ${name}`)
  return m
}

beforeAll(async () => {
  const envelope = await didToContract(DID)
  if (!("contract" in envelope)) throw new Error(JSON.stringify(envelope))
  const built = schemaFromContract(envelope)
  if (!built.ok || built.actor === undefined) throw new Error("no actor")
  methods = serviceMethods(built.actor)
})

const leaf = (text: string): Draft => ({ k: "leaf", text })

describe("recursion", () => {
  it("defaults a recursive variant to its finite arm, whatever the key order", () => {
    const grow = method("grow")
    expect(defaultValue(grow.args[0]!)).toEqual({ tag: "leaf", value: 0n })
    expect(checkCall(grow.args, [initialDraft(grow.args[0]!)]).ok).toBe(true)
  })

  it("expands one level per user action", () => {
    const [tree] = method("grow").args
    // Picking `node` builds one level: both children default to leaves.
    const node = selectArm(tree!, initialDraft(tree!), "node")
    expect(checkCall([tree!], [node]).values).toEqual([
      {
        tag: "node",
        value: {
          left: { tag: "leaf", value: 0n },
          right: { tag: "leaf", value: 0n },
        },
      },
    ])
    // A list grows when its tail is switched on.
    const [list] = method("push").args
    const one = draftFromValue(list!, { head: 1n, tail: null })
    const two = draftFromValue(list!, {
      head: 1n,
      tail: { head: 2n, tail: null },
    })
    expect(checkCall([list!], [one]).ok).toBe(true)
    expect(checkCall([list!], [two]).values).toEqual([
      { head: 1n, tail: { head: 2n, tail: null } },
    ])
  })

  it("flags types without values: the method cannot be called", () => {
    for (const name of ["spin", "impossible"]) {
      const m = method(name)
      expect(isUninhabited(m.args[0]!), name).toBe(true)
      expect(defaultValue(m.args[0]!), name).toBe(UNINHABITED)
      expect(initialDraft(m.args[0]!), name).toEqual({ k: "uninhabited" })
      const check = checkCall(m.args, [initialDraft(m.args[0]!)])
      expect(check).toMatchObject({ ok: false, uninhabited: true })
      expect(check.issues[0]?.path).toBe("$args[0]")
    }
  })

  it("disables a variant arm whose payload has no values", () => {
    const control = controlOf(method("shape").args[0]!)
    if (control.control !== "choice") throw new Error("a variant")
    expect(control.arms.map((a) => [a.tag, a.uninhabited, a.tagOnly])).toEqual(
      expect.arrayContaining([
        ["never", true, false],
        ["circle", false, false],
        ["dot", false, true],
      ])
    )
  })
})

describe("boxed opts", () => {
  it("keeps the three states of opt opt text apart", () => {
    const [settings] = method("settings").args
    for (const label of [null, { some: null }, { some: "hi" }]) {
      const value = {
        label,
        maybe_null: { some: null },
        anything: null,
        r: null,
      }
      const check = checkCall([settings!], [draftFromValue(settings!, value)])
      expect(check.issues, JSON.stringify(label)).toEqual([])
      expect(check.values).toEqual([value])
    }
  })

  it("puts a boxed opt's issues under .some", () => {
    const [settings] = method("settings").args
    const draft: Draft = {
      k: "record",
      fields: {
        label: {
          k: "opt",
          present: true,
          inner: { k: "opt", present: true, inner: leaf("x") },
        },
        maybe_null: { k: "opt", present: false },
        anything: { k: "opt", present: false },
        r: { k: "fixed" },
      },
    }
    expect(checkCall([settings!], [draft]).values).toEqual([
      { label: { some: "x" }, maybe_null: null, anything: null, r: null },
    ])
  })
})

describe("keys that are Object.prototype names", () => {
  it("writes and reads __proto__, constructor and toString as own fields", () => {
    const [arg] = method("proto").args
    const value = defaultValue(arg!) as Record<string, unknown>
    expect(Object.keys(value).sort()).toEqual([
      "__proto__",
      "constructor",
      "toString",
    ])
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype)
    expect(checkCall([arg!], [initialDraft(arg!)]).ok).toBe(true)
    // Loose JSON with those keys (JSON.parse makes them own properties).
    const loose = JSON.parse(
      '{"__proto__": 7, "constructor": "c", "toString": true}'
    ) as unknown
    const check = checkCall([arg!], [draftFromValue(arg!, loose)])
    expect(check.ok).toBe(true)
    const out = check.values?.[0] as Record<string, unknown>
    expect(Object.hasOwn(out, "__proto__")).toBe(true)
    expect(out["constructor"]).toBe("c")
    expect(out["toString"]).toBe(true)
  })

  it("reads variant arms named after Object.prototype members as arms", () => {
    const [arg] = method("arms").args
    for (const value of [
      { tag: "__proto__", value: 3n },
      { tag: "constructor" },
      { tag: "valueOf", value: "v" },
    ]) {
      const check = checkCall([arg!], [draftFromValue(arg!, value)])
      expect(check.issues, value.tag).toEqual([])
      expect(check.values).toEqual([value])
    }
    // `toString` is not an arm, even though every object has one.
    expect(draftFromValue(arg!, { tag: "toString" })).not.toMatchObject({
      tag: "toString",
    })
  })
})

describe("issues on the codec's paths", () => {
  it("names quoted keys, tuple slots, float32 rounding and func parts", () => {
    const weird = method("weird")
    const drafts: Draft[] = [
      {
        k: "record",
        fields: {
          _7_: { k: "bool", value: true },
          "has space": leaf("300"),
          quoted: leaf("0.1"),
        },
      },
      { k: "tuple", items: [leaf("-1"), leaf("x")] },
      { k: "fixed" },
    ]
    const issues = checkCall(weird.args, drafts).issues.map((i) => [
      i.path,
      i.code,
    ])
    expect(issues).toEqual(
      expect.arrayContaining([
        ["$args[0].quoted", "parse"],
        ['$args[0]["has space"]', "out_of_range"],
        ["$args[1][0]", "out_of_range"],
      ])
    )
    const refs = method("refs")
    const refIssues = checkCall(refs.args, [
      { k: "func", principal: "AAAAA-AA", method: "" },
      leaf(""),
    ]).issues.map((i) => [i.path, i.message])
    expect(refIssues).toEqual([
      ["$args[0].principal", "principal text is lower case"],
      ["$args[0].method", "required"],
      ["$args[1]", "required"],
    ])
  })

  it("refuses odd hex at the blob's path", () => {
    const shape = method("shape")
    const check = checkCall(shape.args, [
      initialDraft(shape.args[0]!),
      { k: "bytes", text: "abc", format: "hex" },
    ])
    expect(check.issues).toEqual([
      {
        path: "$args[1]",
        code: "parse",
        message: "hex needs an even number of digits",
      },
    ])
  })
})
