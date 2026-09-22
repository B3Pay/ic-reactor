import { ClientManager, uint8ArrayToHex } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { describe, expect, it, vi } from "vitest"
import { MetadataDisplayReactor } from "../../src/metadata-display-reactor.js"
import { MetadataReactor } from "../../src/metadata-reactor.js"

/**
 * A func or service type inside an argument is a reference, a value like any
 * other: `[principal, method]` for a func, a principal for a service. Both form
 * visitors read one as a method or a whole service instead, because
 * `visitFunc` and `visitService` are also their method- and service-level
 * entry points. The field got no label, schema or default, so a variant whose
 * default option held one made MetadataReactor.initialize() throw, a service
 * reference made the argument schema's safeParse throw, and a func reference's
 * schema demanded the func's own argument tuple instead of a reference.
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

async function displayReactor(candid: string) {
  const reactor = new MetadataDisplayReactor({
    name: "refs",
    canisterId: "aaaaa-aa",
    clientManager: createMockClientManager(),
    candid,
  })
  await reactor.initialize()
  return reactor
}

async function metadataReactor(candid: string) {
  const reactor = new MetadataReactor({
    name: "refs",
    canisterId: "aaaaa-aa",
    clientManager: createMockClientManager(),
    candid,
  })
  await reactor.initialize()
  return reactor
}

/** Calls `method` with `args` and returns the argument bytes that were sent. */
async function sentArgs(
  reactor: MetadataDisplayReactor,
  method: string,
  args: unknown[],
  reply: Uint8Array = IDL.encode([], [])
): Promise<Uint8Array> {
  const send = vi.spyOn(reactor as any, "executeCall").mockResolvedValue(reply)
  try {
    await reactor.callMethod({ functionName: method as never, args })
    return send.mock.calls[0][1] as Uint8Array
  } finally {
    send.mockRestore()
  }
}

const archive = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai")

describe("func and service references in arguments", () => {
  // The management canister's http_request takes one, and so does any method
  // that registers a callback.
  const HTTP_REQUEST = `
    type http_header = record { name : text; value : text };
    type http_request_result = record {
      status : nat;
      headers : vec http_header;
      body : blob;
    };
    type http_request_args = record {
      url : text;
      transform : opt record {
        function : func (record {
          response : http_request_result;
          context : blob;
        }) -> (http_request_result) query;
        context : blob;
      };
    };
    service : {
      http_request : (http_request_args) -> (http_request_result);
      register : (service { notify : (text) -> () }) -> ();
      subscribe : (variant { callback : func (text) -> () oneway }) -> ();
    }
  `
  const HttpRequestResult = IDL.Record({
    status: IDL.Nat,
    headers: IDL.Vec(IDL.Record({ name: IDL.Text, value: IDL.Text })),
    body: IDL.Vec(IDL.Nat8),
  })
  const HttpRequestArgs = IDL.Record({
    url: IDL.Text,
    transform: IDL.Opt(
      IDL.Record({
        function: IDL.Func(
          [
            IDL.Record({
              response: HttpRequestResult,
              context: IDL.Vec(IDL.Nat8),
            }),
          ],
          [HttpRequestResult],
          ["query"]
        ),
        context: IDL.Vec(IDL.Nat8),
      })
    ),
  })

  it("lets MetadataReactor initialize when a variant defaults to a func reference", async () => {
    const reactor = await metadataReactor(HTTP_REQUEST)

    const meta = reactor.getInputMeta("subscribe")
    expect(meta?.defaults).toEqual([{ _type: "callback", callback: ["", ""] }])
    expect(
      meta?.schema.safeParse([
        { _type: "callback", callback: [archive.toText(), "on_event"] },
      ]).success
    ).toBe(true)
  })

  it("describes a service reference argument as a principal", async () => {
    const reactor = await displayReactor(HTTP_REQUEST)
    const meta = reactor.getInputMeta("register")
    if (!meta) throw new Error("metadata missing")

    expect(meta.args[0]).toMatchObject({
      type: "principal",
      candidType: "service",
      name: "[0]",
      defaultValue: "",
    })
    expect(meta.schema.safeParse([archive.toText()]).success).toBe(true)
    expect(meta.schema.safeParse(["not a principal"]).success).toBe(false)

    const bytes = await sentArgs(reactor, "register", [archive.toText()])
    const [sent] = IDL.decode(
      [IDL.Service({ notify: IDL.Func([IDL.Text], [], []) })],
      bytes
    ) as unknown as [Principal]
    expect(sent.toText()).toBe(archive.toText())
  })

  it("sends http_request's transform function from its form value", async () => {
    const reactor = await displayReactor(HTTP_REQUEST)
    const meta = reactor.getInputMeta("http_request")
    if (!meta) throw new Error("metadata missing")

    const record = meta.args[0]
    if (record.type !== "record") throw new Error("expected a record")
    const transform = record.fields.find((f) => f.label === "transform")
    if (transform?.type !== "optional") throw new Error("expected an opt")
    const inner = transform.innerField
    if (inner.type !== "record") throw new Error("expected a record")
    const func = inner.fields.find((f) => f.label === "function")
    expect(func).toMatchObject({
      type: "tuple",
      candidType: "func",
      name: "[0].transform.function",
      defaultValue: ["", ""],
    })
    expect(transform.getInnerDefault()).toEqual({
      function: ["", ""],
      context: "",
    })

    const args = [
      {
        url: "https://example.com",
        transform: { function: [archive.toText(), "transform"], context: "" },
      },
    ]
    expect(meta.schema.safeParse(args).success).toBe(true)

    const bytes = await sentArgs(
      reactor,
      "http_request",
      args,
      IDL.encode([HttpRequestResult], [{ status: 200n, headers: [], body: [] }])
    )
    const [sent] = IDL.decode([HttpRequestArgs], bytes) as any[]
    expect(sent.url).toBe("https://example.com")
    const [[canister, method]] = sent.transform.map((t: any) => t.function)
    expect(canister.toText()).toBe(archive.toText())
    expect(method).toBe("transform")
  })

  it("hydrates a func reference into the value its schema accepts", async () => {
    const reactor = await metadataReactor(HTTP_REQUEST)
    const encoded = IDL.encode(
      [HttpRequestArgs],
      [
        {
          url: "https://example.com",
          transform: [{ function: [archive, "transform"], context: [] }],
        },
      ]
    )

    const built = await reactor.buildForMethod("http_request", {
      candidArgsHex: uint8ArrayToHex(new Uint8Array(encoded)),
    })

    expect(built.hydration).toEqual({
      status: "hydrated",
      values: [
        {
          url: "https://example.com",
          transform: { function: [archive.toText(), "transform"], context: "" },
        },
      ],
    })
    if (built.hydration.status !== "hydrated") return
    expect(built.meta.schema.safeParse(built.hydration.values).success).toBe(
      true
    )
  })
})

// ════════════════════════════════════════════════════════════════════════════
// Generated: references at random positions in argument types
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

const FUNC_REF = "func (nat) -> (text) query"
const SERVICE_REF = "service { notify : (text) -> () }"
const LEAVES = ["nat", "text", "principal", FUNC_REF, SERVICE_REF]
const LABELS = ["a", "owner", "callback", "target", "0", "1"]

/**
 * Candid text for a random type holding at least one reference. An `opt`
 * never wraps another `opt` or a `vec`: a form cannot tell some(none) from
 * none, or some(empty vec) from none, whatever the element.
 */
function typeText(r: Rng, depth: number): string {
  if (depth === 0) return r.pick([FUNC_REF, SERVICE_REF])
  const child = () => (r.int(3) === 0 ? r.pick(LEAVES) : typeText(r, depth - 1))
  switch (r.int(5)) {
    case 0: {
      const inner = typeText(r, depth - 1)
      return /^(opt|vec) /.test(inner) ? inner : `opt ${inner}`
    }
    case 1:
      return `vec ${typeText(r, depth - 1)}`
    case 2:
      return `record { ${typeText(r, depth - 1)}; ${child()} }`
    case 3: {
      const [a, b] = [r.pick(LABELS.slice(0, 4)), r.pick(LABELS.slice(0, 4))]
      const second = a === b ? "" : `; ${b} : ${child()}`
      return `record { ${a} : ${typeText(r, depth - 1)}${second} }`
    }
    default:
      return `variant { ${r.pick(LABELS.slice(0, 4))} : ${typeText(r, depth - 1)}; none }`
  }
}

const PRINCIPALS = ["aaaaa-aa", "2vxsx-fae", archive.toText()]

/** A random value of `t` in the form IDL.encode takes. */
function valueOf(r: Rng, t: IDL.Type): unknown {
  if (t instanceof IDL.FuncClass)
    return [Principal.fromText(r.pick(PRINCIPALS)), r.pick(["m", "on_event"])]
  if (t instanceof IDL.ServiceClass || t instanceof IDL.PrincipalClass)
    return Principal.fromText(r.pick(PRINCIPALS))
  if (t instanceof IDL.NatClass) return r.pick([0n, 7n, 2n ** 70n])
  if (t instanceof IDL.TextClass) return r.pick(["x", "hello"])
  if (t instanceof IDL.OptClass)
    return r.int(3) === 0 ? [] : [valueOf(r, t._type)]
  if (t instanceof IDL.VecClass)
    return Array.from({ length: r.int(3) }, () => valueOf(r, t._type))
  if (t instanceof IDL.VariantClass) {
    const [k, ft] = r.pick(t._fields)
    return { [k]: ft instanceof IDL.NullClass ? null : valueOf(r, ft) }
  }
  if (t instanceof IDL.TupleClass)
    return t._fields.map(([, c]) => valueOf(r, c))
  if (t instanceof IDL.RecordClass)
    return Object.fromEntries(t._fields.map(([k, ft]) => [k, valueOf(r, ft)]))
  throw new Error(`no value for ${t.display()}`)
}

/** The form value both visitors describe for `v`. */
function formOf(t: IDL.Type, v: any): unknown {
  if (t instanceof IDL.FuncClass) return [v[0].toText(), v[1]]
  if (t instanceof IDL.ServiceClass || t instanceof IDL.PrincipalClass)
    return v.toText()
  if (t instanceof IDL.NatClass) return v.toString()
  if (t instanceof IDL.OptClass)
    return v.length === 0 ? null : formOf(t._type, v[0])
  if (t instanceof IDL.VecClass) return v.map((x: any) => formOf(t._type, x))
  if (t instanceof IDL.VariantClass) {
    const [k] = Object.keys(v)
    const ft = t._fields.find(([n]) => n === k)![1]
    return ft instanceof IDL.NullClass
      ? { _type: k }
      : { _type: k, [k]: formOf(ft, v[k]) }
  }
  if (t instanceof IDL.TupleClass)
    return t._fields.map(([, c], i) => formOf(c, v[i]))
  if (t instanceof IDL.RecordClass)
    return Object.fromEntries(t._fields.map(([k, ft]) => [k, formOf(ft, v[k])]))
  return v
}

/** Principals as text, so decoded and generated values compare. */
function plain(x: unknown): unknown {
  if (x instanceof Principal) return x.toText()
  if (typeof x === "bigint") return `${x}n`
  if (Array.isArray(x)) return x.map(plain)
  if (x && typeof x === "object")
    return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, plain(v)]))
  return x
}

describe("generated argument types holding references (seed 20260923)", () => {
  it("both reactors describe, validate, send and hydrate every value", async () => {
    const r = rng(20260923)
    for (let s = 0; s < 40; s++) {
      const argTexts = Array.from({ length: 1 + r.int(2) }, () =>
        typeText(r, 1 + r.int(3))
      )
      const candid = `service : { m : (${argTexts.join(", ")}) -> () }`
      const context = `for ${candid}`

      const display = await displayReactor(candid)
      const metadata = await metadataReactor(candid)
      const displayMeta = display.getInputMeta("m")!
      const metadataMeta = metadata.getInputMeta("m")!
      const argTypes = ((display as any).getFuncClass("m") as IDL.FuncClass)
        .argTypes

      for (let trial = 0; trial < 3; trial++) {
        const value = argTypes.map((t) => valueOf(r, t))
        const form = argTypes.map((t, i) => formOf(t, value[i]))

        expect(displayMeta.schema.safeParse(form).success, context).toBe(true)
        expect(metadataMeta.schema.safeParse(form).success, context).toBe(true)

        const bytes = await sentArgs(display, "m", form)
        expect(plain(IDL.decode(argTypes, bytes)), context).toEqual(
          plain(value)
        )

        const built = await metadata.buildForMethod("m", {
          candidArgsHex: uint8ArrayToHex(
            new Uint8Array(IDL.encode(argTypes, value))
          ),
        })
        expect(built.hydration, context).toEqual({
          status: "hydrated",
          values: form,
        })
      }
    }
  })
})
