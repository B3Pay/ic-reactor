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
  },
})
```

## Reactor Class Configuration

Set `canisterConfig.mode` to choose the generated reactor class:

- `DisplayReactor` (default)
- `Reactor`

Codegen writes a single `index.ts`. It overwrites that file only while it is still recognized as a generated file; if you replace it with your own file, regeneration leaves it untouched.

## Generators

You can also use individual generators if you need more granular control:

- **`generateDeclarations`**: Generates `.js` (factory), `.d.ts` (types), and `.did` copy.
- **`generateReactorFile`**: Generates the `index.ts` file using either `DisplayReactor` or `Reactor`.
- **`generateClientFile`**: Generates a `ClientManager` boilerplate file.

## Utilities

- **`parseDIDFile`**: Parses a `.did` file and extracts method signatures.
- **`toPascalCase` / `toCamelCase`**: Naming helpers.

## License

MIT
