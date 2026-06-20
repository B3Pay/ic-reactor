# Candid Compiler And Codegen Evolution Plan

## Summary

Evolve IC Reactor's Candid compiler/codegen path into a richer, cleaner pipeline
for modern ICP apps.

The goal is to keep `.did` as the stable public API contract while improving
what IC Reactor can produce from it: typed IDL factories, service types, method
metadata, docs/comment metadata, API diffs, better generated hooks, and
app-friendly outputs for `@ic-reactor/start`.

Current flow:

```text
.did file
  -> @ic-reactor/parser didToJs/didToTs
  -> generated declarations
  -> generated reactor/hooks
```

Target flow:

```text
Motoko/Rust/manual Candid
  -> .did contract
  -> structured Candid schema
  -> typed IDL factory + service types + metadata overlay
  -> generated reactors/hooks/query objects/docs/AI context
```

## Core Decisions

- Keep `.did` as the source contract for frontend bindings.
- Do not copy `.did` into generated frontend declaration folders by default.
  The `.did` file should live with the canister/backend contract and remain the
  input to codegen.
- Generate TypeScript declaration artifacts only for modern IC Reactor v4
  codegen. Do not keep generating parallel `.js` plus `.d.ts` frontend binding
  files from `@ic-reactor/codegen`.
- Do not generate React hooks directly from Motoko or Rust source.
- Add richer compiler output in `@ic-reactor/parser`, then consume it from
  `@ic-reactor/codegen`.
- Keep `@ic-reactor/codegen` as the only declaration/reactor generation pipeline
  used by CLI, Vite plugin, and Start.
- Keep generated files clearly marked and preserve stable user-owned wrappers.
- Prefer structured compiler data over string manipulation for new features.
- Keep existing `@ic-reactor/parser` `didToJs` and `didToTs` APIs working for
  compatibility and dynamic Candid workflows.
- Reuse the existing `@ic-reactor/candid` metadata reactor and visitors for
  runtime form/result metadata. Add comment/doc metadata as an overlay instead
  of creating a competing form system in codegen.

## V0: TypeScript-Only Generated Declarations

Modernize generated frontend declaration output while keeping `.did` as the
input contract.

### Output Shape

Generate:

```text
<canister-out-dir>/
  declarations/
    <name>.ts
  index.generated.ts
  index.ts
```

Do not generate these in the modern pipeline:

```text
declarations/<name>.js
declarations/<name>.d.ts
declarations/<name>.did
```

The source `.did` remains in the backend/canister contract location, for
example:

```text
backend/backend.did
```

### TypeScript IDL Factory Output

Generate a TypeScript-first factory format:

```ts
import type { IDL } from "@icp-sdk/core/candid"

export const idlFactory: IDL.InterfaceFactory = ({ IDL }) => {
  return IDL.Service({
    greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]),
  })
}

export const init = ({ IDL }: { IDL: typeof IDL }): IDL.Type[] => []
```

Benefits:

- Better editor diagnostics.
- Easier source inspection.
- Cleaner imports in generated React/Start apps.
- No parallel JS implementation plus `.d.ts` declaration files.
- Less generated-file clutter for AI tools and modern app templates.

### Codegen Integration

Update declaration generation to:

- write only `declarations/<name>.ts`;
- keep `index.generated.ts` imports unchanged:
  `import { idlFactory, type _SERVICE } from "./declarations/<name>"`;
- derive the TypeScript file from the current parser output first, then move to
  structured-schema rendering when `parseDid` is mature;
- update CLI and Vite docs/help text that still mention `.js` plus `.d.ts`.

### Migration Policy

This branch is the IC Reactor v4 line, so codegen can switch to TypeScript-only
output. The parser package still keeps `didToJs` and `didToTs` compatibility.

Existing checked-in generated example artifacts should be regenerated only when
they are part of the focused verification path.

## V1: Structured Candid Schema With Docs

Add a structured compiler API in `@ic-reactor/parser`:

```ts
parseDid(candid: string): CandidSchema
```

Initial schema shape:

```ts
interface CandidSchema {
  service?: CandidService
  types: Record<string, CandidTypeDeclaration>
  init: CandidType[]
}

interface CandidService {
  docs: string[]
  methods: CandidMethod[]
}

interface CandidMethod {
  name: string
  docs: string[]
  mode: "query" | "update" | "composite_query" | "oneway"
  args: CandidArgument[]
  returns: CandidType[]
  tags: CandidDocTags
}

interface CandidTypeDeclaration {
  name: string
  docs: string[]
  type: CandidType
  tags: CandidDocTags
}

interface CandidField {
  name: string
  docs: string[]
  type: CandidType
  tags: CandidDocTags
}
```

The Rust `candid_parser` AST already preserves doc comments for service docs,
type declarations, methods, and record/variant fields. `parseDid` should expose
that information instead of using string or regex-based comment parsing.

### Doc Tag Parsing

Keep raw docs and parse a small annotation layer from doc comments:

```did
/// Create a profile.
/// @form submitLabel Create profile
/// @param 0 Profile payload
create_profile : (ProfileInput) -> (ProfileId);

/// Profile payload shown in the public directory.
type ProfileInput = record {
  /// Public display name.
  /// @form label Display name
  /// @form widget text
  name : text;

  /// Optional biography.
  /// @form widget textarea
  bio : opt text;
};
```

The initial parser should support a conservative tag shape:

```ts
type CandidDocTags = Record<string, Record<string, string | true>>
```

For example:

```ts
{
  form: {
    label: "Display name",
    widget: "text"
  }
}
```

Avoid locking into a large annotation DSL in the first implementation. Preserve
unknown tags so apps and future packages can interpret them.

## V2: Generated Metadata Overlay

Generate a metadata overlay next to the TypeScript IDL factory:

```text
declarations/
  backend.ts
  backend.metadata.ts
```

Example output:

```ts
export const candidMetadata = {
  service: {
    docs: ["Backend service."],
  },
  methods: {
    create_profile: {
      docs: ["Create a profile."],
      tags: {
        form: { submitLabel: "Create profile" },
        param: { "0": "Profile payload" },
      },
      mode: "update",
      args: [{ name: "arg0", typeRef: "ProfileInput" }],
      returns: [{ typeRef: "ProfileId" }],
    },
  },
  types: {
    ProfileInput: {
      docs: ["Profile payload shown in the public directory."],
      fields: {
        name: {
          docs: ["Public display name."],
          tags: { form: { label: "Display name", widget: "text" } },
        },
        bio: {
          docs: ["Optional biography."],
          tags: { form: { widget: "textarea" } },
        },
      },
    },
  },
} as const
```

Use this overlay to improve:

- generated query/mutation factory names
- route loader examples
- form generation
- docs and API tables
- AI-readable project context
- `@ic-reactor/start` first-screen demos

The overlay must be generated from `parseDid` structured output, not from
generated factory strings.

## V3: Candid Metadata Reactor Integration

Reuse the existing `@ic-reactor/candid` metadata reactor/visitor system.

Add a small merge API that applies generated comment metadata to runtime
visitor output:

```ts
reactor.applyMetadata(candidMetadata)
```

or constructor support:

```ts
const reactor = new MetadataReactor({
  name: "backend",
  idlFactory,
  clientManager,
  metadata: candidMetadata,
})
```

Merge targets:

- method docs and form labels into `FormArgumentsMeta`;
- field docs, labels, descriptions, widgets, placeholders, and constraints into
  `FormFieldNode`;
- return docs into result metadata where paths can be matched.

The existing visitor output remains the source for runtime shape, defaults, Zod
schemas, hydration helpers, and display/result resolution. The generated overlay
adds author-provided docs and rendering hints that are lost when Candid is
compiled into `IDL.Service(...)`.

Runtime `MetadataReactor` may optionally call `parseDid` itself when raw Candid
source is available and no generated overlay is provided, but Start and codegen
should prefer generated overlays for deterministic app builds.

## V4: Method Manifest And App Helpers

Use the richer schema and metadata overlay to generate app-level helpers.

Potential outputs:

```text
declarations/
  backend.ts
  backend.metadata.ts
index.generated.ts
queries.generated.ts
forms.generated.ts
api.generated.md
llms.generated.txt
```

Recommended first app-level helpers:

- `queries.generated.ts`: typed query/mutation factories for common route usage.
- `api.generated.md`: human-readable canister API docs.
- `llms.generated.txt`: compact AI context for the canister interface.

Avoid generating UI components in the compiler layer. UI belongs in
`@ic-reactor/start` templates or app-specific packages.

## V5: API Diff And Contract Checks

Add API contract safety checks for generated `.did` changes.

CLI shape:

```bash
ic-reactor did diff backend/backend.did
ic-reactor generate --check-api
ic-reactor generate --write-api-snapshot
```

Detect and report:

- removed methods
- renamed methods
- query/update mode changes
- argument count changes
- argument type changes
- return type changes
- variant field removals
- record field removals or type changes

Severity defaults:

- breaking: fail in `--check-api`
- additive: warn
- formatting-only: ignore

This is especially important for `@ic-reactor/start`, where Motoko source can
regenerate `backend.did`; the user should see when a backend edit changes the
public API.

## V6: Start Integration

For `@ic-reactor/start`, standardize this workflow:

```bash
pnpm backend:did
pnpm codegen
pnpm build
icp deploy
```

Where:

- `backend:did` generates `.did` from Motoko or Rust.
- `codegen` runs IC Reactor generation from `.did`.
- generated hooks/factories consume TypeScript IDL factory output.
- generated metadata overlay powers route examples, forms, docs, and AI context.
- API diff checks warn when backend changes break the frontend contract.

Default Start behavior:

- Motoko template checks in `backend.did`.
- `pnpm codegen` regenerates TypeScript factories, service types, metadata
  overlays, and hooks.
- `pnpm build` runs `backend:did` before frontend build.
- docs explain that `.did` is the source-controlled API contract.

## Implementation Notes

- Start in `packages/parser` and `packages/codegen`; do not implement compiler
  behavior in `packages/start`.
- Keep existing `didToJs` and `didToTs` parser APIs working.
- Move `@ic-reactor/codegen` generated declaration output to TypeScript-only.
- Avoid introducing parser output formats that depend on React.
- Keep `core` framework-agnostic.
- Add snapshot tests for every generated output format.
- Prefer small additive parser APIs over replacing `didToJs`/`didToTs`
  immediately.
- Do not hand-edit generated app artifacts. Regenerate examples only when a
  focused verification path requires it.

## Test Plan

- Parser tests for simple services, records, variants, opts, vecs, principals,
  blobs, recursive types, service imports, init args, and doc comments.
- Parser tests for method/type/field docs and conservative doc tag parsing.
- Codegen snapshot tests for TypeScript IDL factory output, metadata overlay,
  and generated reactor imports.
- Round-trip tests that generated `idlFactory` can be imported and called.
- `@ic-reactor/codegen` pipeline tests for TypeScript-only declaration output.
- `@ic-reactor/candid` tests for applying generated metadata overlays to
  existing `MetadataReactor` form metadata.
- `@ic-reactor/vite-plugin` tests to confirm generated outputs refresh on `.did`
  changes.
- `@ic-reactor/start` scaffold test to confirm Motoko `.did` generation feeds
  codegen and frontend build.
- API diff fixtures covering additive and breaking changes.

## Acceptance Criteria

- Existing examples continue to build after regeneration to TypeScript-only
  declaration output.
- New `@ic-reactor/start` examples use TypeScript IDL factory output by default.
- Generated metadata overlay is stable, typed, and covered by snapshots.
- `.did` remains the source contract but is not copied into generated frontend
  declaration folders by default.
- API diff command can fail CI for breaking canister interface changes.
- No React dependency is introduced into `@ic-reactor/parser`,
  `@ic-reactor/codegen`, or `@ic-reactor/core`.
