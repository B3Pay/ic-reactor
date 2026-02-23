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
    didFile: "./backend.did",
  },
  projectRoot: process.cwd(),
  globalConfig: {
    outDir: "src/declarations",
    clientManagerPath: "../../clients",
    reactor: {
      defaultMode: "display",
      canisters: {
        workflow_engine: "raw",
      },
    },
  },
})
```

## Reactor Mode Configuration

`reactor.defaultMode` controls whether generated default hook exports use:

- `display` → `DisplayReactor` (current/default behavior)
- `raw` → `Reactor` (raw Candid shapes)

`reactor.canisters` lets you override specific canisters without editing generated files.

## Generated File Layout (Stable Wrapper)

Each canister now generates:

- `index.generated.ts` (regenerated on every run)
- `index.ts` (created only if missing; not overwritten)

The stable wrapper defaults to:

```ts
export * from "./index.generated"
```

This lets applications customize exports once and keep them across regenerations.

## Generated Output Examples

Display default:

```ts
export function createBackendRawReactor() {
  /* ... */
}
export function createBackendDisplayReactor() {
  /* ... */
}
export const backendReactor = createBackendDisplayReactor()
export const BackendReactorMode = "display" as const
```

Raw default:

```ts
export function createWorkflowEngineRawReactor() {
  /* ... */
}
export function createWorkflowEngineDisplayReactor() {
  /* ... */
}
export const workflowEngineReactor = createWorkflowEngineRawReactor()
export const WorkflowEngineReactorMode = "raw" as const
```

## Generators

You can also use individual generators if you need more granular control:

- **`generateDeclarations`**: Generates `.js` (factory), `.d.ts` (types), and `.did` copy.
- **`generateReactorFile`**: Generates the `index.generated.ts` implementation with raw/display factories and typed hooks.
- **`generateReactorWrapperFile`**: Generates the stable `index.ts` wrapper (create-once, preserve-on-regenerate).
- **`generateClientFile`**: Generates a `ClientManager` boilerplate file.

## Utilities

- **`parseDIDFile`**: Parses a `.did` file and extracts method signatures.
- **`toPascalCase` / `toCamelCase`**: Naming helpers.

## License

MIT
