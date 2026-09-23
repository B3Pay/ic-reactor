import { ClientManager } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { describe, expect, it } from "vitest"
import { CandidAdapter } from "../../src/adapter.js"
import { CandidReactor } from "../../src/reactor.js"
import { normalizeCandidInterface } from "../../src/utils.js"

/**
 * registerMethod takes type declarations followed by a signature. The
 * declarations were found with a `^type` line match, so only a declaration at
 * the very start of a line counted. The documented example is an indented
 * template literal with two declarations: the second was read as part of the
 * signature, and registration failed with a parser error.
 */

function createMockClientManager(): ClientManager {
  const agent = HttpAgent.createSync({ host: "https://ic0.app" })
  return {
    agent,
    registerCanisterId: () => {},
    subscribe: () => () => {},
    queryClient: {
      invalidateQueries: () => Promise.resolve(),
      ensureQueryData: () => Promise.resolve(undefined),
      getQueryData: () => undefined,
    },
  } as unknown as ClientManager
}

function createReactor() {
  return new CandidReactor({
    name: "dynamic",
    canisterId: "aaaaa-aa",
    clientManager: createMockClientManager(),
  })
}

/** The method `name` as the parser reads it from a whole service. */
async function parsedMethod(
  service: string,
  name: string
): Promise<IDL.FuncClass> {
  const adapter = new CandidAdapter({
    clientManager: createMockClientManager(),
  })
  const { idlFactory } = await adapter.parseCandidSource(service)
  return idlFactory({ IDL })._fields.find(([n]) => n === name)![1]
}

describe("registerMethod with type declarations", () => {
  it("registers the documented example, whose declarations are indented", async () => {
    const reactor = createReactor()

    await reactor.registerMethod({
      functionName: "complex_method",
      candid: `
        type Proposal = record { id: nat64; payload: rec_1 };
        type rec_1 = record { data: text; next: opt rec_1 };
        (Proposal) -> (opt rec_1) query
      `,
    })

    expect(reactor.getMethodNames()).toEqual(["complex_method"])
  })

  it("reads several declarations on one line", () => {
    expect(
      normalizeCandidInterface(
        "type A = nat; type B = record { a : A }; (B) -> (A) query",
        "m"
      )
    ).toBe(
      'type A = nat; type B = record { a : A };\nservice : { "m": (B) -> (A) query; }'
    )
  })

  it("keeps a quoted name with an escaped quote inside the declaration", () => {
    expect(
      normalizeCandidInterface(
        'type A = record { "say \\"hi\\";" : text };\n  (A) -> ()',
        "m"
      )
    ).toBe(
      'type A = record { "say \\"hi\\";" : text };\nservice : { "m": (A) -> (); }'
    )
  })

  // `"a\\"` is the name `a\`: the quote after the escaped backslash closes it.
  // The balance check took that quote for an escaped one and rejected the input.
  it("keeps a quoted name that ends in an escaped backslash", () => {
    expect(
      normalizeCandidInterface('(record { "a\\\\" : nat }) -> ()', "m")
    ).toBe('service : { "m": (record { "a\\\\" : nat }) -> (); }')
    expect(
      normalizeCandidInterface(
        'type T = record { "a\\\\" : nat; b : text };\n(T) -> ()',
        "m"
      )
    ).toBe(
      'type T = record { "a\\\\" : nat; b : text };\nservice : { "m": (T) -> (); }'
    )
  })

  it("registers a method whose field name ends in an escaped backslash", async () => {
    const reactor = createReactor()

    await reactor.registerMethod({
      functionName: "m",
      candid: '(record { "a\\\\" : nat; b : text }) -> () query',
    })

    expect(reactor.getMethodNames()).toEqual(["m"])
    const [, func] = reactor
      .getServiceInterface()
      ._fields.find(([name]) => name === "m")!
    const [arg] = (func as IDL.FuncClass).argTypes as [IDL.RecordClass]
    expect(arg._fields.map(([name]) => name).sort()).toEqual(["a\\", "b"])
  })
})

// ════════════════════════════════════════════════════════════════════════════
// Generated: the same declarations and signature, laid out many ways
// ════════════════════════════════════════════════════════════════════════════

function rng(seed: number) {
  let s = seed >>> 0
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (n: number) => Math.floor(next() * n)
  const pick = <T>(xs: readonly T[]): T => xs[int(xs.length)]
  return { int, pick }
}
type Rng = ReturnType<typeof rng>

const PRIMITIVES = ["nat", "int64", "text", "bool", "principal", "blob"]

/** A type expression over the primitives and the names declared so far. */
function typeExpr(r: Rng, names: string[], depth: number): string {
  const leaf = () =>
    names.length > 0 && r.int(2) === 0 ? r.pick(names) : r.pick(PRIMITIVES)
  if (depth === 0) return leaf()
  switch (r.int(5)) {
    case 0:
      return `opt ${typeExpr(r, names, depth - 1)}`
    case 1:
      return `vec ${typeExpr(r, names, depth - 1)}`
    case 2:
      return `record { a : ${typeExpr(r, names, depth - 1)}; "b;c" : ${leaf()} }`
    case 3:
      return `variant { ok : ${typeExpr(r, names, depth - 1)}; err : text; none }`
    default:
      return leaf()
  }
}

/** Whitespace and comments a person might put between two declarations. */
const GAPS = [
  "\n",
  " ",
  "\n    ",
  "\n\t\t",
  "  \n\n  ",
  " /* note; */ ",
  " // x\n  ",
]

describe("generated type declarations (seed 20260923)", () => {
  it("registers the method however the declarations are laid out", async () => {
    const r = rng(20260923)
    for (let s = 0; s < 40; s++) {
      const names: string[] = []
      const declarations: string[] = []
      for (let i = 0; i < 1 + r.int(4); i++) {
        declarations.push(`type T${i} = ${typeExpr(r, names, 2)};`)
        names.push(`T${i}`)
      }
      const args = Array.from({ length: r.int(3) }, () => typeExpr(r, names, 1))
      const signature = `(${args.join(", ")}) -> (${typeExpr(r, names, 1)})${r.pick(["", " query"])}`

      let candid = r.pick(["", "\n", "\n      "])
      for (const declaration of declarations) {
        candid += declaration + r.pick(GAPS)
      }
      candid += signature + r.pick(["", ";", " ;\n    "])

      const expected = await parsedMethod(
        `${declarations.join("\n")}\nservice : { m : ${signature} }`,
        "m"
      )
      const reactor = createReactor()
      await reactor.registerMethod({ functionName: "m", candid })

      const registered = (reactor as any).getFuncClass("m") as IDL.FuncClass
      expect(registered.display(), JSON.stringify(candid)).toBe(
        expected.display()
      )
    }
  })
})
