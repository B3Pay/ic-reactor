/**
 * A DisplayReactor could not call a method whose argument or result type
 * contains itself through `opt`, `vec` or a tuple. Motoko's `List` is the
 * common case:
 *
 *   type List = opt record { int; List };
 *   service : { get : () -> (List) query }
 *
 * The reactor itself compiled, but `ReactorReturnOk<Service, "get", "display">`
 * failed with TS2589, "Type instantiation is excessively deep and possibly
 * infinite", and so did every hook and `callMethod` on `get` (#566). A type
 * that contains itself through a record field or a variant arm, such as
 * ICRC-3's `Value`, already resolved and still does.
 *
 * Checked by `pnpm typecheck` (tests are in the typecheck project), not by
 * vitest.
 */
import { describe, it, expectTypeOf } from "vitest"
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { Principal } from "@icp-sdk/core/principal"
import type { DisplayReactor } from "../src/display-reactor.js"
import type { ReactorArgs, ReactorReturnOk } from "../src/types/reactor.js"

// Declared as didc and @ic-reactor/parser's didToTs emit them.

/** `type List = opt record { int; List }` */
type List = [] | [[bigint, List]]
/** `type Triple = opt record { nat; text; Triple }` */
type Triple = [] | [[bigint, string, Triple]]
/** `type Pair = record { nat; opt Pair }` */
type Pair = [bigint, [] | [Pair]]
/** `type Forest = vec Forest` */
type Forest = Array<Forest>
/** `type Dict = vec record { text; Dict }` */
type Dict = Array<[string, Dict]>
/** `type Opt = opt Opt` */
type Opt = [] | [Opt]
/** `type OptA = opt OptB; type OptB = opt OptA` */
type OptA = [] | [OptB]
type OptB = [] | [OptA]

interface Tree {
  value: bigint
  children: Array<Tree>
}
interface Node {
  next: [] | [Node]
  v: string
}
/** ICRC-3's generic block value, trimmed to one arm of each kind. */
type Value =
  | { Nat: bigint }
  | { Text: string }
  | { Array: Array<Value> }
  | { Map: Array<[string, Value]> }

interface Service {
  get: ActorMethod<[], List>
  set: ActorMethod<[List], List>
  triple: ActorMethod<[], Triple>
  pair: ActorMethod<[], Pair>
  forest: ActorMethod<[], Forest>
  dict: ActorMethod<[], Dict>
  opt: ActorMethod<[], Opt>
  optA: ActorMethod<[], OptA>
  tree: ActorMethod<[], Tree>
  node: ActorMethod<[], Node>
  value: ActorMethod<[], Value>
}

// What each displays as. `opt` is the value, `null` or `undefined`; `int` and
// `nat` are strings.
type ListView = [string, ListView] | null | undefined
type TripleView = [string, string, TripleView] | null | undefined
type PairView = [string, PairView | null | undefined]
type ForestView = ForestView[]
type DictView = { [key: string]: DictView }

declare const reactor: DisplayReactor<Service>

describe("display types of a type that contains itself", () => {
  it("resolve Motoko's List", () => {
    expectTypeOf<ReactorReturnOk<Service, "get", "display">>().not.toBeAny()
    expectTypeOf<
      ReactorReturnOk<Service, "get", "display">
    >().toEqualTypeOf<ListView>()
    expectTypeOf<ReactorArgs<Service, "set", "display">>().toEqualTypeOf<
      [ListView]
    >()

    // The raw Candid transform is unchanged.
    expectTypeOf<ReactorReturnOk<Service, "get">>().toEqualTypeOf<List>()
  })

  it("read a List node by node", () => {
    const list = {} as ReactorReturnOk<Service, "get", "display">
    if (list) {
      const [head, tail] = list
      expectTypeOf(head).toEqualTypeOf<string>()
      expectTypeOf(tail).toEqualTypeOf<ListView>()
    }
  })

  it("let DisplayReactor call a method that takes and returns a List", async () => {
    const list = await reactor.callMethod({ functionName: "get" })
    expectTypeOf(list).toEqualTypeOf<ListView>()

    await reactor.callMethod({
      functionName: "set",
      args: [["1", ["2", null]]],
    })
    // @ts-expect-error a List holds strings for its int, not bigints
    await reactor.callMethod({ functionName: "set", args: [[1n, null]] })

    const cached = await reactor.fetchQuery({ functionName: "get" })
    expectTypeOf(cached).toEqualTypeOf<[string, ListView] | null>()

    reactor.registerValidator("set", ([list]) => {
      expectTypeOf(list).toEqualTypeOf<ListView>()
      return { success: true }
    })
  })

  it("resolve an optional that contains itself", () => {
    // `opt opt …` never reaches a value, so only null and undefined remain.
    expectTypeOf<ReactorReturnOk<Service, "opt", "display">>().toEqualTypeOf<
      null | undefined
    >()
    expectTypeOf<ReactorReturnOk<Service, "optA", "display">>().toEqualTypeOf<
      null | undefined
    >()
  })

  it("resolve the same through other tuples, vectors and maps", () => {
    expectTypeOf<
      ReactorReturnOk<Service, "triple", "display">
    >().toEqualTypeOf<TripleView>()
    expectTypeOf<
      ReactorReturnOk<Service, "pair", "display">
    >().toEqualTypeOf<PairView>()
    expectTypeOf<
      ReactorReturnOk<Service, "forest", "display">
    >().toEqualTypeOf<ForestView>()
    expectTypeOf<
      ReactorReturnOk<Service, "dict", "display">
    >().toEqualTypeOf<DictView>()
  })

  it("still resolve records and variants that contain themselves", () => {
    type TreeView = ReactorReturnOk<Service, "tree", "display">
    expectTypeOf<TreeView["value"]>().toEqualTypeOf<string>()
    expectTypeOf<TreeView["children"]>().toEqualTypeOf<TreeView[]>()

    type NodeView = ReactorReturnOk<Service, "node", "display">
    expectTypeOf<NodeView["v"]>().toEqualTypeOf<string>()
    expectTypeOf<NodeView["next"]>().toEqualTypeOf<
      NodeView | null | undefined
    >()

    type ValueView = ReactorReturnOk<Service, "value", "display">
    type Arm<K extends string> = Extract<ValueView, { _type: K }>
    expectTypeOf<Arm<"Nat">["Nat"]>().toEqualTypeOf<string>()
    expectTypeOf<Arm<"Array">["Array"]>().toEqualTypeOf<ValueView[]>()
    expectTypeOf<Arm<"Map">["Map"]>().toEqualTypeOf<Record<string, ValueView>>()
  })
})

interface Nested {
  pairs: ActorMethod<[], [[bigint, string], [Principal, bigint]]>
  vecs: ActorMethod<[], [Array<bigint>, Array<string>]>
  maps: ActorMethod<[], Array<[string, Array<[string, bigint]>]>>
}

describe("display types of nested types that do not contain themselves", () => {
  // Only a vector, tuple or map whose element nests arrays three deep is built
  // lazily. Anything shallower keeps exactly the type it had. Each lazily
  // built tuple is a type of its own, so `pairs` built lazily would not be
  // identical to `[[string, string], [string, string]]`, though each would be
  // assignable to the other.
  it("keep exactly the same types", () => {
    expectTypeOf<ReactorReturnOk<Nested, "pairs", "display">>().toEqualTypeOf<
      [[string, string], [string, string]]
    >()
    expectTypeOf<ReactorReturnOk<Nested, "vecs", "display">>().toEqualTypeOf<
      [string[], string[]]
    >()
    expectTypeOf<ReactorReturnOk<Nested, "maps", "display">>().toEqualTypeOf<
      Record<string, Record<string, string>>
    >()
  })
})
