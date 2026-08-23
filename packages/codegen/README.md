# @ic-reactor/codegen

> shared code generation pipeline and utilities for IC Reactor.

This package contains the core machinery for generating TypeScript declarations, reactor instances, and client managers from Candid files. It is primarily used by:

- **`@ic-reactor/cli`**: For manual/CLI-based generation
- **`@ic-reactor/vite-plugin`**: For automatic build-time generation

## API

The main entry point is the `runCanisterPipeline` function, which orchestrates the generation process.

```typescript
import { runCanisterPipeline } from "@ic-reactor/codegen"

await runCanisterPipeline({
  canisterConfig: {
    name: "backend",
    mode: "DisplayReactor",
    didFile: "./backend.did",
  },
  projectRoot: process.cwd(),
  globalConfig: {
    outDir: "src/declarations",
    clientManagerPath: "../../clients",
    target: "react",
  },
  generateReactor: true,
})
```

## Reactor Class Configuration

Set `canisterConfig.mode` to choose the generated reactor class:

- `DisplayReactor` (default)
- `Reactor`
- `CandidReactor`
- `CandidDisplayReactor`
- `MetadataDisplayReactor`

Set `target` to control whether generated files include React hooks:

- `react` (default): generates the reactor plus bound `createActorHooks` exports
- `core`: generates only the typed reactor exports with no `@ic-reactor/react` dependency

Codegen now writes two files per canister: a managed `index.generated.ts` implementation that is regenerated on every run, and an `index.ts` entry wrapper. The wrapper is created once, then preserved unless it still matches the default generated wrapper or an older generated scaffold that can be migrated automatically. A scaffold that carries any export the old generator never wrote counts as user-owned and is left alone; one that is migrated is copied to `index.ts.bak` first.

Each canister needs its own `outDir`. Codegen writes a `.ic-reactor-owner` marker naming the canister that owns the directory, and a run whose canister does not match that marker fails rather than overwriting it — every run replaces `declarations/` wholesale. The marker is written by `generateDeclarations`, so the guard also covers `--bindgen-only` runs, which skip `index.generated.ts` but still replace `declarations/`. Directories generated before the marker existed fall back to the canister name recorded inside `index.generated.ts`.

Set `generateReactor: false` if you only want the bindgen/declaration output and
need to skip `index.generated.ts` and `index.ts`.

## Generators

You can also use individual generators if you need more granular control:

- **`generateDeclarations`**: Writes `declarations/<did-basename>.js` (factory), `.d.ts` (types), and a `.did` copy. Generation runs in a staging directory that replaces `declarations/` only once every file is written, so a `.did` that fails to parse leaves the previous declarations untouched. A `.did` that parses but declares no `service` is rejected — it would produce no `idlFactory` and no `_SERVICE`. It also writes the `.ic-reactor-owner` marker into `outDir`, which is what stops a second canister generating over the first one's declarations.
- **`generateReactorFile`**: Generates the managed `index.generated.ts` implementation using any `ReactorClassName` — `Reactor`, `DisplayReactor` (default), `CandidReactor`, `CandidDisplayReactor`, or `MetadataDisplayReactor`. With `target: "react"` it also emits the six `createActorHooks` exports (`use<Canister>Query`, `use<Canister>SuspenseQuery`, `use<Canister>InfiniteQuery`, `use<Canister>SuspenseInfiniteQuery`, `use<Canister>Mutation`, `use<Canister>Method`). No `createQuery` / `createMutation` objects are generated.
- **`generateReactorEntryFile`**: Generates the stable `index.ts` wrapper that re-exports from `index.generated.ts`.
- **`generateClientFile`**: Generates a `ClientManager` boilerplate file that
  imports `ClientManager` from `@ic-reactor/react`.

## Utilities

- **`toPascalCase` / `getReactorName` / `getServiceTypeName`**: Naming helpers.
- **`assertSafeCanisterConfig` and friends**: Validate a canister config before generating; the pipeline runs these itself.

`parseDIDFile` / `extractMethods` (and the `MethodInfo` / `MethodType` types)
have been removed. They regex-scraped the pretty-printed JS from
`didToJs`, which silently returned no methods for any service whose first
method took an inline record, dropped every method whose signature wrapped over
80 columns, and reported `composite_query` as a mutation. Read a `.did` with
[`parseDid()`](https://ic-reactor.b3pay.net/v3/packages/parser) from
`@ic-reactor/parser` instead — it returns `{ name, mode, args, returns }` per
method, straight from the Rust parser.

## License

MIT
