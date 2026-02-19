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
  },
})
```

## Generators

You can also use individual generators if you need more granular control:

- **`generateDeclarations`**: Generates `.js` (factory), `.d.ts` (types), and `.did` copy.
- **`generateReactorFile`**: Generates the `index.ts` file with `DisplayReactor` and hooks.
- **`generateClientFile`**: Generates a `ClientManager` boilerplate file.

## Utilities

- **`parseDIDFile`**: Parses a `.did` file and extracts method signatures.
- **`toPascalCase` / `toCamelCase`**: Naming helpers.

## License

MIT
