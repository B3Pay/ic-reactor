# cod

`cod` is a Rust/WASM Candid core for Internet Computer apps.

The intended architecture is:

- Rust owns Candid parsing, type checking, text-value parsing, byte encoding, and byte decoding.
- WASM exposes that Rust core to JavaScript.
- TypeScript is a thin facade around WASM.
- The only ICP SDK dependency should be the agent you use to send `Uint8Array` arguments and receive reply bytes.

## TypeScript Usage

```ts
import { readFileSync } from "node:fs"
import { c } from "@ic-reactor/cod"

await c.init(readFileSync("./pkg/cod_core_bg.wasm"))

const program = c.program(`
type Contact = record { email : text; age : nat8 };
service : {
  save : (Contact) -> (variant { ok : nat; err : text });
}
`)

const arg = program.encodeMethodArgs(
  "save",
  `(record { email = "dev@example.com"; age = 42 })`
)

// Pass `arg` to your ICP SDK agent call.
// Decode reply bytes with the same Rust/WASM core:
const replyText = program.decodeMethodReply("save", replyBytes)
```

The TypeScript layer does not reimplement Candid serialization. It passes `.did`, Candid text args, and bytes to WASM.

## DID-First Actor Runtime

`cod` can build an actor directly from Candid DID text at runtime. This avoids hand-written JavaScript `IDL.*` factories while still using the Rust/WASM Candid core for the actual wire encoding and decoding.

```ts
import { readFileSync } from "node:fs"
import { c } from "@ic-reactor/cod"

await c.init(readFileSync("./node_modules/cod/pkg/cod_core_bg.wasm"))

const ledger = await c.actor({
  agent,
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
  candidSource: `
    type Account = record {
      owner : principal;
      subaccount : opt blob;
    };

    service : {
      icrc1_balance_of : (Account) -> (nat) query;
    }
  `,
})

const balance = await ledger.query("icrc1_balance_of", [
  {
    owner: "2vxsx-fae",
    subaccount: undefined,
  },
])
```

Runtime actors provide:

- DID-derived schemas without generated `IDL.Record(...)` code.
- Strict method-mode checks for `query`, `update`, `composite_query`, and unsupported `oneway` calls.
- Pre-encode validation errors with paths such as `args[0].owner`.
- Post-decode reply validation.
- Idiomatic DID optional values: `undefined` and `null` both encode as absent, and absent decoded options return `undefined`.
- `agent.update(...)` support for modern ICP agents that poll update replies, with fallback support for transports that return reply bytes directly.

## Generated Forms

`cod` also exposes framework-neutral form helpers for DID-derived method forms. The helpers produce editable state, convert that state back to app-level method arguments, and report conversion issues before encoding.

```ts
const program = await c.compileDid(candidSource)
const method = program.method("icrc1_balance_of")
const form = method.toFormSchema()

let state = c.createFormState(form.args)
state = c.updateFieldValue(state, 0, ["owner"], "2vxsx-fae")

const issues = c.validateFormState(state, form.args)
if (issues.length === 0) {
  const args = c.formStateToArgs(state, form.args)
  const result = await actor.query(method.name, args)
}
```

The runtime form UI example uses these same package exports, so React is only an example renderer rather than a required dependency.

### Candid Comment Validators

Generated runtime forms expose display-only doc comments as `docs: string[]`, preserve the complete normalized comment block as `rawDocs: string[]`, and expose structured `docTags` plus normalized `validation` rules on compatible `FormField`s. Validator tag names follow the same JSDoc spelling used by Zod / `ts-to-zod`:

```did
type Contact = record {
  // @label Email
  // @format email Invalid email address.
  email : text;

  // @format phone-number Use 555-123-4567 format.
  phone : text;

  // @minLength 2 Too short.
  // @maxLength 50 Too long.
  name : text;

  // @pattern ^[A-Z]{2}\d{2}$
  code : text;

  // @minimum 18 Too young.
  // @maximum 65 Too old.
  age : nat8;

  // @elementMinLength 2 Alias is too short.
  aliases : vec text;
};
```

Supported tags are `@minimum`, `@maximum`, `@minLength`, `@maxLength`, `@format`, and `@pattern`. Vector item variants are supported where the generated item field is compatible: `@elementMinLength`, `@elementMaxLength`, `@elementFormat`, `@elementPattern`, `@elementMinimum`, and `@elementMaximum`.

Forms also support `@label Display Name` as UI metadata. It overrides the generated `label` for a `FormField` or `FormVariantOption`, but it never changes `name`, `path`, encoding, or decoding.

Built-in formats are `date-time`, `date`, `time`, `duration`, `email`, `ip`, `ipv4`, `ipv6`, `url`, and `uuid`. Custom formats use the `customJSDocFormatTypes` option, matching `ts-to-zod` config naming:

```ts
const program = await c.compileDid(candidSource, {
  customJSDocFormatTypes: {
    "phone-number": {
      regex: "^\\d{3}-\\d{3}-\\d{4}$",
      errorMessage: "Use 555-123-4567 format.",
    },
  },
})
```

Tag lines are intentionally excluded from `docs` so renderers can show field descriptions directly. For example, `// Display name.`, `// @label Full name`, and `// @minLength 2 Too short.` becomes `label: "Full name"`, `docs: ["Display name."]`, `rawDocs: ["Display name.", "@label Full name", "@minLength 2 Too short."]`, and a normalized `minLength` validation rule.

Validation runs through `c.validateFormState(state, form.args)`. Disabled optional fields remain valid and convert to `undefined`; when enabled, validators on the optional field are applied to the generated inner value field.

## Rust Core

The Rust API centers on `CandidProgram`:

```rust
use cod::CandidProgram;

let program = CandidProgram::from_source(r#"
service : { greet : (text) -> (text) query }
"#)?;

let bytes = program.encode_method_args("greet", r#"("ICP")"#)?;
let args = program.decode_method_args("greet", &bytes)?;
```

Core capabilities:

- Parse and type-check `.did` services with `candid_parser`.
- Encode method args from Candid text to wire bytes.
- Decode method args or replies from wire bytes to typed Candid text.
- Encode/decode service-class init args.
- Encode/decode dynamic args without a `.did`.
- Emit service summaries and canonical service DID.

## Build WASM

The local Rust toolchain for this package is pinned in `rust-toolchain.toml`
because the current locked Candid dependency graph requires Rust 1.88.

```bash
wasm-pack build \
  --target web \
  --out-dir pkg \
  --out-name cod_core \
  --release \
  --no-opt \
  -- \
  --features wasm
npm run build
```

This produces:

- `pkg/cod_core_bg.wasm`
- `pkg/cod_core.js`
- `dist/index.js`
- `dist/index.d.ts`

## Live Examples

Use one command for the browser examples:

```bash
npm run examples
```

This builds the WASM package and TypeScript output, watches the bundled ICRC demo, serves the repo at `http://127.0.0.1:4173/`, and opens the examples hub:

- `http://127.0.0.1:4173/examples/`
- `http://127.0.0.1:4173/examples/playground/`
- `http://127.0.0.1:4173/examples/gui/`
- `http://127.0.0.1:4173/examples/icrc/`

Use `npm run examples:no-open` when you want the same server without opening a browser.

### GUI Example

```bash
npm run example:gui
```

Then open `http://127.0.0.1:4173/examples/gui/`.

The browser workbench loads the existing WASM package, parses a Candid service, lists methods, encodes method arguments to wire bytes, decodes those bytes back to typed Candid text, and exercises dynamic reply decoding.

### ICRC Mainnet Example

```bash
npm run example:icrc
```

Then open `http://127.0.0.1:4173/examples/icrc/`.

The ICRC workbench uses `@icp-sdk/core` only for the real mainnet `HttpAgent` transport. The local Rust/WASM `cod` core encodes ICRC method arguments, decodes reply bytes, reads standard ICRC-1 metadata, and queries account balances. The trace panel shows each step from Candid text args through wire bytes, the agent response, decoded reply text, and parsed UI values.

### TypeScript Generator Playground

```bash
npm run example:playground
```

Then open `http://127.0.0.1:4173/examples/playground/`.

The playground lets you paste any Candid `.did` source in the left pane and instantly see the generated TypeScript file in the right pane. It runs entirely in the browser via WASM — no server-side generation needed. The output includes executable `c.*` schema constants, exported `c.Infer` types, and a generated canister service schema. Preset examples are available for quick exploration.

## Generator

The generator emits TypeScript schema code and a named canister service schema.

```bash
cargo run -- generate examples/service.did --canister-name backend --output examples/service.cod.ts
```

The same canister name can be passed from JavaScript:

```ts
const generated = c.generateTypescript(candidSource, {
  canisterName: "backend",
})
```

Generated files include:

- `c.*` schema constants for Candid aliases.
- `c.Infer` type aliases for generated value schemas.
- A canister-named `c.service(...)` export, for example `export const backend = c.service(...)`.

See `examples/ic-reactor-dx` for a compact IC Reactor-style example that uses the generated value types and canister service schema together.

## Agent Boundary

`cod` intentionally does not wrap the ICP SDK agent yet. The boundary is explicit:

```ts
const arg = program.encodeMethodArgs(
  "save",
  `(record { email = "dev@example.com"; age = 42 })`
)

await agent.call(canisterId, {
  methodName: "save",
  arg,
})
```

That keeps Candid logic in Rust/WASM while allowing the app to use whichever ICP SDK agent setup it needs.
