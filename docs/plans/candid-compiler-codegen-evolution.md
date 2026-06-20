# Candid Compiler And Codegen Evolution Plan

## Summary

Evolve IC Reactor's Candid compiler/codegen path into a richer, cleaner pipeline
for modern ICP apps.

The goal is to keep `.did` as the stable public API contract while improving
what IC Reactor can produce from it: typed IDL factories, service types, method
metadata, API diffs, better generated hooks, and app-friendly outputs for
`@ic-reactor/start`.

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
  -> typed IDL factory + service types + method manifest
  -> generated reactors/hooks/query objects/docs/AI context
```

## Core Decisions

- Keep `.did` as the source contract for frontend bindings.
- Do not generate React hooks directly from Motoko or Rust source.
- Add richer compiler output in `@ic-reactor/parser`, then consume it from
  `@ic-reactor/codegen`.
- Keep `@ic-reactor/codegen` as the only declaration/reactor generation pipeline
  used by CLI, Vite plugin, and Start.
- Keep generated files clearly marked and preserve stable user-owned wrappers.
- Prefer structured compiler data over string manipulation for new features.

## V0: Cleaner Declaration Generation

Improve current declaration generation without changing the public workflow.

### Parser Output

Keep existing parser APIs:

```ts
didToJs(candid: string): string
didToTs(candid: string): string
```

Add a generation option layer in `@ic-reactor/codegen`:

```ts
type DeclarationFormat = "js+dts" | "ts"
```

Default remains `js+dts` for compatibility. New apps may opt into `ts`.

### TypeScript IDL Factory Output

Add a TypeScript-first factory format:

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
- No parallel JS implementation plus `.d.ts` declaration for new projects.

### Codegen Integration

Update declaration generation to support:

- legacy `declarations/<name>.js`
- legacy `declarations/<name>.d.ts`
- copied `declarations/<name>.did`
- optional `declarations/<name>.ts`

Use `ts` output by default for `@ic-reactor/start` templates only after it is
verified with Vite, tsup, package builds, and generated hook imports.

## V1: Method Manifest

Generate a structured method manifest next to the IDL factory.

Example output:

```ts
export const canisterMethods = {
  greet: {
    kind: "query",
    args: [{ name: "arg0", candid: "text" }],
    returns: [{ candid: "text" }],
  },
  create_post: {
    kind: "update",
    args: [{ name: "title", candid: "text" }],
    returns: [{ candid: "nat" }],
  },
} as const
```

Use this manifest to improve:

- generated query/mutation factory names
- route loader examples
- form generation
- docs and API tables
- AI-readable project context
- `@ic-reactor/start` first-screen demos

The manifest should be generated from the Candid compiler output, not hand-built
from the generated factory string.

## V2: Structured Candid Schema

Add a structured compiler API in `@ic-reactor/parser`:

```ts
parseDid(candid: string): CandidSchema
```

Initial schema shape:

```ts
interface CandidSchema {
  service: CandidService
  types: Record<string, CandidType>
  init: CandidType[]
}

interface CandidService {
  methods: CandidMethod[]
}

interface CandidMethod {
  name: string
  mode: "query" | "update" | "composite_query"
  args: CandidArgument[]
  returns: CandidType[]
}
```

Use the schema as the shared source for:

- IDL factory rendering
- TypeScript service rendering
- method manifest rendering
- API diff checks
- docs generation
- future form/schema helpers

Keep `didToJs` and `didToTs` as compatibility wrappers over the structured
schema once the schema renderer is mature.

## V3: API Diff And Contract Checks

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

## V4: Modern App Outputs

Use the richer compiler data to generate app-level helpers.

Potential outputs:

```text
declarations/
  backend.ts
  backend.did
  backend.methods.ts
  backend.schema.json
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

## V5: Start Integration

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
- generated hooks/factories consume typed IDL factory output.
- generated method manifest powers route examples and docs.
- API diff checks warn when backend changes break the frontend contract.

Default Start behavior:

- Motoko template checks in `backend.did`.
- `pnpm codegen` regenerates factories, types, manifest, and hooks.
- `pnpm build` runs `backend:did` before frontend build.
- docs explain that `.did` is the source-controlled API contract.

## Implementation Notes

- Start in `packages/parser` and `packages/codegen`; do not implement compiler
  behavior in `packages/start`.
- Keep existing `js+dts` output working until all examples and docs migrate.
- Avoid introducing parser output formats that depend on React.
- Keep `core` framework-agnostic.
- Add snapshot tests for every generated output format.
- Prefer small additive APIs over replacing `didToJs`/`didToTs` immediately.

## Test Plan

- Parser tests for simple services, records, variants, opts, vecs, principals,
  blobs, recursive types, service imports, and init args.
- Codegen snapshot tests for `js+dts`, `ts`, method manifest, and generated
  reactor imports.
- Round-trip tests that generated `idlFactory` can be imported and called.
- `@ic-reactor/codegen` pipeline tests for legacy and new declaration formats.
- `@ic-reactor/vite-plugin` tests to confirm generated outputs refresh on `.did`
  changes.
- `@ic-reactor/start` scaffold test to confirm Motoko `.did` generation feeds
  codegen and frontend build.
- API diff fixtures covering additive and breaking changes.

## Acceptance Criteria

- Existing examples continue to build with legacy declaration output.
- New `@ic-reactor/start` examples can opt into TypeScript IDL factory output.
- Generated method manifest is stable, typed, and covered by snapshots.
- API diff command can fail CI for breaking canister interface changes.
- No React dependency is introduced into `@ic-reactor/parser`,
  `@ic-reactor/codegen`, or `@ic-reactor/core`.
