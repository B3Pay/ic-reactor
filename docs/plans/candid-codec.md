**Plan: Candid Codec API For IC Reactor v4**

Goal: move IC Reactor from “generate raw `IDL.*` factory code” to a readable, typed, metadata-rich Candid codec layer inspired by Zod.

Not a literal Zod clone. The API should feel familiar, but Candid fidelity comes first.

```ts
import { c } from "@ic-reactor/cod"

export const Account = c.record({
  owner: c.principal(),
  subaccount: c.opt(c.blob()),
})

export type Account = c.infer<typeof Account>

export const TransferResult = c.variant({
  Ok: c.nat(),
  Err: c.text(),
})

export const Ledger = c.service({
  icrc1_balance_of: c.query([Account], c.nat()),
  icrc1_transfer: c.update([TransferArg], TransferResult),
})

export const idlFactory = Ledger.idlFactory
export type _SERVICE = c.ServiceOf<typeof Ledger>
```

**Core Direction**

`.did` stays the stable backend/frontend contract.

The generated TypeScript becomes the app-facing contract.

The generated file should no longer expose low-level `IDL.Record(...)` declarations as the primary readable surface. Instead, it emits reusable codec declarations that can produce:

- TypeScript types
- Candid `IDL.Type`
- `idlFactory`
- method manifests
- metadata for forms/docs/AI
- future validation/serialization helpers

**Package Ownership**

`@ic-reactor/cod`

Owns the codec API:

```ts
c.record()
c.variant()
c.tuple()
c.vec()
c.opt()
c.blob()
c.principal()
c.text()
c.nat()
c.nat8()
c.int()
c.bool()
c.null()
c.reserved()
c.empty()
c.func()
c.service()
c.query()
c.update()
c.oneway()
c.infer
c.ServiceOf
```

It also owns metadata APIs:

```ts
c.text()
  .describe("Display name")
  .label("Name")
  .example("Alice")
  .meta({ form: { widget: "text" } })
```

`@ic-reactor/parser`

Evolves from string-oriented helpers toward structured Candid output:

```ts
parseDid(source): CandidSchema
```

The schema should include:

- named types
- service methods
- method mode: query/update/oneway
- argument names if available
- return types
- comments/docstrings
- source spans when useful
- recursive type relationships
- raw Candid compatibility data

Existing `didToJs` and `didToTs` stay compatible.

`@ic-reactor/codegen`

Consumes `parseDid()` and renders codec-based TypeScript.

It should stop depending on stitched `didToJs`/`didToTs` output for the new v4 path.

`@ic-reactor/core`

Consumes generated service contracts, but does not own parsing/codegen.

`@ic-reactor/react`

Consumes generated contracts and creates hooks/factories on top.

`@ic-reactor/start`

Consumes generated artifacts only. No compiler behavior.

**Generated Output Shape**

Preferred output:

```text
<canister-out-dir>/
  <name>/
    generated.ts
    index.ts
```

`generated.ts`:

```ts
import { c } from "@ic-reactor/cod"
import type { Principal } from "@icp-sdk/core/principal"

export const Account = c.record({
  owner: c.principal(),
  subaccount: c.opt(c.blob()),
})

export type Account = c.infer<typeof Account>

export const TransferArg = c.record({
  to: Account,
  memo: c.opt(c.blob()),
  amount: c.nat(),
})

export type TransferArg = c.infer<typeof TransferArg>

export const TransferResult = c.variant({
  Ok: c.nat(),
  Err: c.text(),
})

export type TransferResult = c.infer<typeof TransferResult>

export const service = c.service({
  transfer: c.update([TransferArg], TransferResult),
})

export const idlFactory = service.idlFactory
export type _SERVICE = c.ServiceOf<typeof service>

export const manifest = service.manifest()
```

`index.ts`:

```ts
export * from "./generated"
```

No `init` export unless a future concrete use case requires it.

**Metadata Model**

Every codec node should carry optional metadata:

```ts
type CandidMetadata = {
  name?: string
  description?: string
  docs?: string[]
  label?: string
  examples?: unknown[]
  source?: {
    file?: string
    line?: number
    column?: number
  }
  form?: {
    widget?: string
    placeholder?: string
    min?: string | number
    max?: string | number
    options?: unknown[]
  }
  custom?: Record<string, unknown>
}
```

Candid comments should map into metadata.

Example `.did`:

```did
/// Account that receives tokens.
type Account = record {
  /// Owner principal.
  owner : principal;

  /// Optional 32-byte subaccount.
  subaccount : opt blob;
};

service : {
  /// Transfer tokens to another account.
  transfer : (TransferArg) -> (TransferResult);
}
```

Generated:

```ts
export const Account = c
  .record({
    owner: c.principal().describe("Owner principal."),
    subaccount: c.blob().opt().describe("Optional 32-byte subaccount."),
  })
  .describe("Account that receives tokens.")
```

**Codec Runtime Design**

Each codec should be an immutable object with:

```ts
interface CandidCodec<T> {
  readonly kind: string
  readonly metadata: CandidMetadata
  toIDL(): IDL.Type<T>
  describe(text: string): this
  meta(metadata: CandidMetadata): this
}
```

Service codec:

```ts
interface CandidServiceCodec<TService> {
  readonly methods: Record<string, CandidMethodCodec>
  idlFactory: IDL.InterfaceFactory
  manifest(): CandidServiceManifest
}
```

Method manifest:

```ts
type CandidMethodManifest = {
  name: string
  mode: "query" | "update" | "oneway"
  args: CandidFieldManifest[]
  returns: CandidFieldManifest[]
  docs?: string[]
}
```

This gives `@ic-reactor/react`, `@ic-reactor/start`, docs, playgrounds, and AI tools a stable structured contract.

**Type Inference**

Primitive mapping:

```ts
c.text()      -> string
c.bool()      -> boolean
c.principal() -> Principal
c.nat()       -> bigint
c.nat8()      -> number
c.blob()      -> Uint8Array | number[]
c.opt(T)      -> [] | [T]
c.vec(T)      -> T[]
c.record({...}) -> object
c.variant({...}) -> discriminated Candid variant shape
```

The first version should match current `didToTs` semantics where possible to avoid breaking examples.

**Recursive Types**

Recursive types are the hardest part.

Target API:

```ts
export const Tree: c.Codec<Tree> = c.recursive("Tree", () =>
  c.variant({
    leaf: c.text(),
    node: c.record({
      children: c.vec(Tree),
    }),
  })
)

export type Tree = c.infer<typeof Tree>
```

Do not make recursive support the first implementation slice unless parser/codegen needs it immediately.

**First Useful Implementation Slice**

Smallest serious step:

1. Add codec primitives to `@ic-reactor/cod`.
2. Support:
   - primitives
   - `opt`
   - `vec`
   - `blob`
   - `record`
   - `variant`
   - `tuple`
   - `query`
   - `update`
   - `service`
3. Add `toIDL()`.
4. Add `c.infer`.
5. Add `service.idlFactory`.
6. Add `service.manifest()`.
7. Add tests proving codec-generated IDL behaves like current generated factories.

Do not touch parser/codegen first. Build the codec layer manually and verify the foundation.

**Second Slice: Codegen Renderer**

Add a new renderer in `@ic-reactor/codegen`:

```ts
generateCodecDeclarations(schema: CandidSchema): string
```

Initially support non-recursive records/variants/services.

Keep old generation path available behind compatibility behavior.

Generated files should import:

```ts
import { c } from "@ic-reactor/cod"
```

not raw `IDL`, except maybe internally if unavoidable.

**Third Slice: Parser Schema**

Add:

```ts
parseDid(source: string): CandidSchema
```

Start with enough structure for the renderer:

```ts
type CandidSchema = {
  types: CandidTypeDeclaration[]
  service?: CandidServiceDeclaration
  metadata?: CandidMetadata
}
```

Keep `didToJs` / `didToTs` unchanged.

Tests should assert both:

- old APIs still work
- new structured API produces expected schema

**Fourth Slice: Comment Metadata & JSDoc Validation Tags**

Parse doc comments into schema metadata and extract JSDoc-style validation tags to feed the validation layer.

Recommended rule:

- `///` and `/** */` immediately before a type attach to that type
- comments before record fields attach to fields
- comments before service methods attach to methods
- preserve raw text, but also extract specific JSDoc validation tags:
  - `@minimum <value> [err_msg]` -> maps to `.min()`
  - `@maximum <value> [err_msg]` -> maps to `.max()`
  - `@minLength <value> [err_msg]` -> maps to `.min()` for strings/vectors
  - `@maxLength <value> [err_msg]` -> maps to `.max()` for strings/vectors
  - `@pattern <regex>` -> maps to `.regex()`
  - `@format <type> [err_msg]` -> maps to custom format validators (e.g. `email`, `uuid`, `ip`)
- Allow configuring custom format mappings (similar to `customJSDocFormatTypes` in `ts-to-zod`) in the compiler options, mapping custom `@format` values to target regular expressions and error messages.

Example schema:

```ts
{
  kind: "record",
  name: "Account",
  docs: ["Account that receives tokens."],
  fields: [
    {
      name: "owner",
      type: { kind: "principal" },
      docs: ["Owner principal."]
    }
  ]
}
```

**Fifth Slice: Replace v4 Generated Output**

Switch `runCanisterPipeline()` to emit:

```text
generated.ts
index.ts
```

using codec declarations.

Keep compatibility protections:

- do not overwrite customized wrappers
- do not edit generated app artifacts by hand
- do not break current examples
- keep existing `didToJs`/`didToTs`
- avoid React dependencies in parser/codegen/candid/core

**Migration Strategy**

For v4, generated files change from:

```ts
export const idlFactory = ({ IDL }) => { ... }
```

to:

```ts
export const service = c.service({ ... })
export const idlFactory = service.idlFactory
```

Existing app imports should still work if they import:

```ts
idlFactory
_SERVICE
```

New apps can import richer objects:

```ts
Account
TransferArg
TransferResult
service
manifest
```

Legacy `index.generated.ts` handling should remain only for migration.

**Validation And Forms**

Once codec metadata exists, form rendering becomes straightforward.

Example:

```ts
const form = createCandidForm(TransferArg)
```

Because `TransferArg` knows:

- fields
- labels
- docs
- optionality
- primitive type
- variant choices
- nested record shape
- examples/custom metadata

This should live outside parser/codegen. The generated contract provides the data; UI packages consume it.

**Testing Plan**

`@ic-reactor/cod`:

- primitive codecs produce correct IDL
- record/variant/tuple/opt/vec produce correct IDL
- metadata chaining is immutable
- service manifest is stable
- `idlFactory` works with actor creation

`@ic-reactor/parser`:

- parses structured records
- parses structured variants
- parses service methods
- preserves comments
- keeps `didToJs`/`didToTs` compatibility

`@ic-reactor/codegen`:

- snapshot generated codec output
- no unused imports
- no `init`
- generated `idlFactory` typechecks
- generated `_SERVICE` type matches current behavior
- legacy wrapper migration stays safe

Examples:

- update or add a codec-codegen playground
- show `.did -> generated.ts`
- show manifest/metadata panel
- do not commit generated app artifacts unless required by the example

**Recommended Sequence**

1. Build `@ic-reactor/cod` codec API manually.
2. Add tests for manual codecs and IDL equivalence.
3. Add parser `parseDid()` structured output.
4. Add codegen renderer from schema to codec TypeScript.
5. Switch generated `generated.ts` to codec output.
6. Add comment metadata support.
7. Update playground to preview codec output and metadata.
8. Gradually deprecate raw `IDL.*` generated output for v4.

**End State**

IC Reactor v4 gets a clean contract layer:

```ts
.did -> parser schema -> codec generated.ts -> app/runtime/react/start
```

The generated TypeScript is readable, reusable, strongly typed, metadata-rich, and AI-friendly.

Raw Candid IDL still exists, but only as a compilation target. The user-facing model becomes the codec contract.
