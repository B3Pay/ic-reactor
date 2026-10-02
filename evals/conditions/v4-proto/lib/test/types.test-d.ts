// Compile-only probes of the handle types. Every `@ts-expect-error` below
// must be an error, or tsc fails with "Unused '@ts-expect-error' directive".
//
//   node node_modules/typescript/bin/tsc -p test/tsconfig.json
import { c, type PrincipalValue, type Schema } from "@candid-core/schema"
import { skipToken } from "@tanstack/query-core"
import {
  createClient,
  defineService,
  principal,
  type PrincipalText,
} from "../src/index.js"

// A hand-built service in the shape `candid-core-cli gen` emits, with every
// mode and the result shapes the handle layer treats specially.
type Owner = { owner: PrincipalValue; note: string | null }
const Owner: Schema<Owner> = c.rec(() =>
  c.record({ owner: c.principal, note: c.opt(c.text) })
)
type Res =
  | { tag: "Ok"; value: Owner }
  | {
      tag: "Err"
      value: { tag: "NotFound" } | { tag: "Denied"; value: string }
    }
const Res: Schema<Res> = c.rec(() =>
  c.variant({ Ok: Owner, Err: c.variant({ NotFound: c.null, Denied: c.text }) })
)
type ThreeArms =
  | { tag: "Ok"; value: bigint }
  | { tag: "Err"; value: string }
  | { tag: "Pending" }
const ThreeArms: Schema<ThreeArms> = c.rec(() =>
  c.variant({ Ok: c.nat, Err: c.text, Pending: c.null })
)

const schema: Schema<PrincipalValue> = c.rec(() =>
  c.service({
    get: c.func([c.principal], [Res], "query"),
    list: c.func([], [c.vec(Owner)], "composite_query"),
    set: c.func([Owner], [Res], "update"),
    three: c.func([], [ThreeArms], "update"),
  })
)
type Actor = {
  get: (arg0: PrincipalValue) => Promise<Res>
  list: () => Promise<Array<Owner>>
  set: (arg0: Owner) => Promise<Res>
  three: () => Promise<ThreeArms>
}

const Service = defineService<Actor>()(schema, {
  get: "query",
  list: "composite_query",
  set: "update",
  three: "update",
})

// @ts-expect-error a mode map missing a method
defineService<Actor>()(schema, {
  get: "query",
  list: "composite_query",
  set: "update",
})
defineService<Actor>()(schema, {
  get: "query",
  list: "composite_query",
  set: "update",
  three: "update",
  // @ts-expect-error a mode map naming a method the actor lacks
  extra: "query",
})

const client = createClient({ network: "local" })
const svc = client.canister(Service, { id: "aaaaa-aa" })
const me: PrincipalText = principal("aaaaa-aa")

// Reads: queryOptions and queryKey; plain queries also have certified.
svc.get.queryOptions([me])
svc.get.queryOptions(skipToken)
svc.get.queryKey()
void svc.get.certified([me])
svc.list.queryOptions([])
// @ts-expect-error a composite query cannot be run as a certified update call
void svc.list.certified([])

// Mode gating: no mutationOptions on a read, no queryOptions on a write.
// @ts-expect-error mutationOptions on a query
svc.get.mutationOptions()
// @ts-expect-error queryOptions on an update
svc.set.queryOptions([{ owner: me, note: null }])
// @ts-expect-error queryKey on an update
svc.set.queryKey()

// Writes: mutationOptions without retry; invalidates takes read handles only.
svc.set.mutationOptions({ invalidates: [svc.get, svc.list] })
// @ts-expect-error retry is not an option of mutationOptions
svc.set.mutationOptions({ retry: 3 })
// @ts-expect-error an update handle cannot be invalidated
svc.set.mutationOptions({ invalidates: [svc.three] })

// Principals are branded text at the boundary, in and out.
// @ts-expect-error plain string is not PrincipalText
void svc.get(["aaaaa-aa"])
// @ts-expect-error a principal carrier is not PrincipalText either
void svc.get([{ toText: () => "aaaaa-aa" }])
// @ts-expect-error arguments are the argument tuple
void svc.get(me)
async function data() {
  // Exactly-two-arm Ok/Err unwraps: data is the Ok payload, principals as text.
  const got = await svc.get([me])
  const owner: PrincipalText = got.owner
  const note: string | null = got.note
  // @ts-expect-error the Ok payload, not the Result
  void got.tag
  void owner
  void note
  // A three-arm variant is not a result: data is the whole variant.
  const three = await svc.three([])
  const tag: "Ok" | "Err" | "Pending" = three.tag
  void tag
}
void data

// Errors: canister_err narrows to the method's typed Err.
const opts = svc.set.mutationOptions({
  onError(error) {
    if (error.kind === "canister_err") {
      const e: { tag: "NotFound" } | { tag: "Denied"; value: string } =
        error.err
      void e
    } else {
      const none: undefined = error.err
      void none
    }
  },
})
void opts
// A method whose result is not a result variant has no canister_err at all.
svc.three.mutationOptions({
  onError(error) {
    // @ts-expect-error "canister_err" is not a possible kind here
    if (error.kind === "canister_err") void error
  },
})
