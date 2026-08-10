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

Codegen now writes two files per canister: a managed `index.generated.ts` implementation that is regenerated on every run, and an `index.ts` entry wrapper. The wrapper is created once, then preserved unless it still matches the default generated wrapper or an older generated scaffold that can be migrated automatically.

Set `generateReactor: false` if you only want the bindgen/declaration output and
need to skip `index.generated.ts` and `index.ts`.

## Generators

You can also use individual generators if you need more granular control:

- **`generateDeclarations`**: Writes `declarations/<did-basename>.js` (factory), `.d.ts` (types), and a `.did` copy. The `declarations/` directory is wiped and recreated on every run.
- **`generateReactorFile`**: Generates the managed `index.generated.ts` implementation using any `ReactorClassName` — `Reactor`, `DisplayReactor` (default), `CandidReactor`, `CandidDisplayReactor`, or `MetadataDisplayReactor`. With `target: "react"` it also emits the six `createActorHooks` exports (`use<Canister>Query`, `use<Canister>SuspenseQuery`, `use<Canister>InfiniteQuery`, `use<Canister>SuspenseInfiniteQuery`, `use<Canister>Mutation`, `use<Canister>Method`). No `createQuery` / `createMutation` objects are generated.
- **`generateReactorEntryFile`**: Generates the stable `index.ts` wrapper that re-exports from `index.generated.ts`.
- **`generateClientFile`**: Generates a `ClientManager` boilerplate file that
  imports `ClientManager` from `@ic-reactor/react`.

## Utilities

- **`parseDIDFile` / `extractMethods`**: Parse a `.did` file and extract method signatures.
- **`toPascalCase` / `getReactorName` / `getServiceTypeName`**: Naming helpers.

## License

MIT
