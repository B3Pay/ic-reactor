**Plan: COD Candid Contract Runtime For IC Reactor v4**

Goal: move IC Reactor from generated raw `IDL.*` factories to a readable,
typed, metadata-rich Candid contract layer inspired by Zod, while reusing the
Rust Candid implementation as the source of truth for Candid parsing,
type-checking, compatibility, and binary encoding/decoding.

This is not a from-scratch Candid implementation. IC Reactor should own the
TypeScript contract API and runtime ergonomics, not reimplement the Candid
spec. The generated app-facing code should use `@ic-reactor/cod`; low-level
request execution should use `@icp-sdk/agent` directly.

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

export default c.service({
  icrc1_balance_of: c.query([Account], c.nat()),
  icrc1_transfer: c.update([TransferArg], TransferResult),
})
```

**Core Direction**

`.did` stays the stable backend/frontend contract.

The Rust Candid implementation remains the semantic authority:

- parse `.did`
- type-check Candid
- resolve aliases and recursive references
- validate service compatibility
- produce a structured schema
- encode arguments to Candid binary
- decode Candid binary responses

The generated TypeScript becomes the app-facing contract:

- no raw generated `IDL.Record(...)`
- no generated `idlFactory`
- no dependency on `Actor.createActor()`
- reusable COD declarations
- TypeScript types
- service method manifests
- metadata for forms/docs/AI
- validation metadata
- direct client/runtime support over `@icp-sdk/agent`

`@icp-sdk/agent` should remain responsible for the IC transport layer:

- request signing
- query/update calls
- update polling
- certificates and response verification
- agent configuration

COD should be responsible for mapping typed service calls to Candid binary
arguments and typed return values.

**Package Ownership**

`@ic-reactor/cod`

Owns the public TypeScript contract API:

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

COD codecs should be immutable contract descriptors. They should not be thin
wrappers around JavaScript `IDL.Type` instances. Their internal shape should be
stable enough for generated code, manifests, form rendering, docs, validation,
and runtime calls.

`@ic-reactor/parser`

Owns Rust/WASM Candid integration. It should expose:

```ts
parseDid(source: string): CandidSchema
didToCod(source: string, options?: DidToCodOptions): string
encodeCandid(types: CandidTypeSchema[], values: unknown[]): Uint8Array
decodeCandid(types: CandidTypeSchema[], bytes: Uint8Array): unknown[]
verifyCompatibility(previousDid: string, nextDid: string): CompatibilityResult
```

`didToCod()` may be implemented in Rust so the same checked Candid AST/schema
drives both semantic validation and generated COD TypeScript. The output should
still be formatted and wrapped by the codegen pipeline when written to disk.

Existing `didToJs` and `didToTs` may stay temporarily for migration and test
comparison, but the v4 path should not depend on them.

`@ic-reactor/codegen`

Owns generated file orchestration:

- choosing output paths
- writing `generated.ts` and `index.ts`
- preserving user wrappers
- invoking parser `didToCod()` or `parseDid()`
- applying formatting
- integrating CLI and Vite plugin behavior

It should not parse raw generated `IDL` JavaScript.

`@ic-reactor/core`

Consumes generated COD service contracts and owns runtime client integration
over `@icp-sdk/agent`. It should not depend on React and should not require
`Actor.createActor()`.

`@ic-reactor/react`

Consumes generated COD service contracts and creates hooks/factories on top of
the core client runtime.

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

export default c.service({
  transfer: c.update([TransferArg], TransferResult),
})
```

`index.ts`:

```ts
export { default } from "./generated"
export * from "./generated"
```

No `idlFactory` export in the v4 primary path.

No `init` export unless a concrete use case requires constructor argument
support. If constructor argument support is added, it should be modeled as COD
metadata/codecs, not as an `IDL` factory helper.

**Runtime Client Shape**

The runtime should call `@icp-sdk/agent` directly using Candid binary generated
from COD schemas.

Target shape:

```ts
import service from "./generated"

const ledger = createCodClient({
  canisterId,
  agent,
  service,
})

const balance = await ledger.icrc1_balance_of({
  owner,
  subaccount: [],
})
```

Internally:

```text
method args
  -> COD method schema
  -> Rust/WASM encodeCandid()
  -> agent.query() or agent.call()
  -> Rust/WASM decodeCandid()
  -> typed return value
```

This replaces the need for `Actor.createActor()` in the main IC Reactor runtime.

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

Each codec should be an immutable object with enough structural data for
generation, metadata, manifests, and Rust/WASM encode/decode bridging:

```ts
interface CandidCodec<T> {
  readonly kind: string
  readonly metadata: CandidMetadata
  toSchema(): CandidTypeSchema
  describe(text: string): this
  meta(metadata: CandidMetadata): this
}
```

Service codec:

```ts
interface CandidServiceCodec<TService> {
  readonly methods: Record<string, CandidMethodCodec>
  toSchema(): CandidServiceSchema
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

This gives `@ic-reactor/core`, `@ic-reactor/react`, `@ic-reactor/start`, docs,
playgrounds, and AI tools a stable structured contract.

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

The first version should match current `didToTs` semantics where possible to
avoid breaking examples.

**Recursive Types**

Recursive types must be supported in the same single implementation pass if
the Rust schema exposes them from real `.did` files.

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

The Rust Candid parser/type checker should remain responsible for detecting and
validating recursive relationships. COD only needs to represent the checked
relationship and preserve it for encode/decode.

**Single Implementation Phase**

Implement the v4 COD path as one coherent vertical slice:

1. Extend `@ic-reactor/parser` so Rust/WASM exposes checked `CandidSchema`,
   `didToCod()`, `encodeCandid()`, and `decodeCandid()`.
2. Update `@ic-reactor/cod` so codecs are native structural descriptors with
   `toSchema()`, metadata chaining, type inference, service manifests, and no
   required `IDL.Type` backing.
3. Add method codecs for `query`, `update`, and `oneway`, including argument
   and return schemas needed by the runtime.
4. Add the core COD client runtime that maps service methods to direct
   `@icp-sdk/agent` calls and uses Rust/WASM Candid encode/decode.
5. Update `@ic-reactor/codegen` so CLI and Vite generation emit COD
   `generated.ts` and `index.ts` files.
6. Parse doc comments and JSDoc validation tags into schema metadata and render
   them into generated COD declarations.
7. Keep legacy `didToJs`/`didToTs` and raw `IDL` generation only as migration
   compatibility until v4 no longer needs them.

**Comment Metadata & JSDoc Validation Tags**

Parse doc comments into schema metadata and extract JSDoc-style validation tags
to feed the validation layer.

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
  - `@format <type> [err_msg]` -> maps to custom format validators, e.g.
    `email`, `uuid`, `ip`
- allow configuring custom format mappings similar to
  `customJSDocFormatTypes` in `ts-to-zod`

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

**Migration Strategy**

For v4, generated files change from:

```ts
export const idlFactory = ({ IDL }) => { ... }
```

to:

```ts
export default c.service({ ... })
```

Existing apps that still depend on `idlFactory` should use the legacy generator
or an explicit compatibility option. The primary v4 generated output should not
include `idlFactory`.

New apps import richer objects:

```ts
import service, { Account, TransferArg, TransferResult } from "./generated"
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

This should live outside parser/codegen. The generated contract provides the
data; UI packages consume it.

**Testing Plan**

`@ic-reactor/parser`:

- parses structured records
- parses structured variants
- parses service methods
- preserves comments
- extracts validation metadata
- resolves recursive types
- encodes arguments using Rust Candid
- decodes responses using Rust Candid
- keeps `didToJs`/`didToTs` compatibility while migration support exists

`@ic-reactor/cod`:

- primitive codecs produce stable schemas
- record/variant/tuple/opt/vec produce stable schemas
- metadata chaining is immutable
- service manifest is stable
- recursive codecs preserve references
- inferred types match current `didToTs` behavior where possible

`@ic-reactor/core`:

- COD client calls `agent.query()` for query methods
- COD client calls `agent.call()` and polls for update methods
- oneway methods return `Promise<void>`
- arguments are encoded through Rust/WASM Candid helpers
- responses are decoded through Rust/WASM Candid helpers
- no `Actor.createActor()` dependency in the primary runtime path

`@ic-reactor/codegen`:

- snapshot generated COD output
- no unused imports
- no `IDL.`
- no `idlFactory` in primary v4 output
- no `init` unless constructor support is explicitly modeled
- generated service type matches current behavior
- legacy wrapper migration stays safe

Examples:

- update or add a codec-codegen playground
- show `.did -> generated.ts`
- show manifest/metadata panel
- show direct `@icp-sdk/agent` COD client usage
- do not commit generated app artifacts unless required by the example

**End State**

IC Reactor v4 gets a clean contract/runtime layer:

```text
.did
  -> Rust Candid parser/type checker
  -> generated COD TypeScript
  -> COD service schema
  -> Rust/WASM Candid encode/decode
  -> @icp-sdk/agent direct calls
  -> core/react/start
```

The generated TypeScript is readable, reusable, strongly typed,
metadata-rich, and AI-friendly.

Raw Candid `IDL` is no longer the generated contract model and is not required
for the primary runtime path.
