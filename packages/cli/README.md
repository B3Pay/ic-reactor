# @ic-reactor/cli

> 🔧 Command-line tool for generating type-safe React hooks for ICP canisters.

The `@ic-reactor/cli` helps you generate TypeScript declarations and React hooks from your Candid files. It uses the shared `@ic-reactor/codegen` pipeline to ensure consistency with the Vite plugin.

## Installation

```bash
pnpm add -D @ic-reactor/cli
```

## Quick Start

### 1. Initialize your project

```bash
npx ic-reactor init
```

This creates an `ic-reactor.json` configuration file in your project root and optionally sets up a default `ClientManager` at `src/clients.ts`.

### 2. Configure your canisters

Update `ic-reactor.json` with the paths to your Candid files:

```json
{
  "outDir": "src/declarations",
  "clientManagerPath": "../../clients",
  "canisters": {
    "backend": {
      "didFile": "src/backend/backend.did"
    }
  }
}
```

### 3. Generate hooks

```bash
npx ic-reactor generate
```

This command will:

1. Generate TypeScript declarations (`.d.ts`, `.js`, `.did`) for each canister.
2. Create an `index.ts` reactor file for each canister with fully typed hooks.

### 4. Use the generated hooks

Import the hooks directly from the generated output folder:

```tsx
import { useBackendQuery } from "./declarations/backend"

function MyComponent() {
  const { data, isPending } = useBackendQuery({
    functionName: "get_message",
  })

  return <p>{isPending ? "Loading..." : data}</p>
}
```

## Commands

### `init`

Initialize the configuration file (`ic-reactor.json`).

```bash
npx ic-reactor init [options]

Options:
  -y, --yes              Skip prompts and use defaults
  -o, --out-dir <path>   Output directory for generated hooks
```

### `generate` (alias: `g`)

Generate hooks and declarations based on your configuration and DID files.

```bash
npx ic-reactor generate [options]

Options:
  -c, --canister <name>   Generate only for a specific canister
  --clean                 Clean output directory before generating
```

## Configuration

The `ic-reactor.json` file schema:

```typescript
interface CodegenConfig {
  /** Default output directory (relative to project root) */
  outDir: string
  /** Default import path for the client manager */
  clientManagerPath?: string
  /** Canister configurations */
  canisters: Record<string, CanisterConfig>
}

interface CanisterConfig {
  /** Canister name (required) */
  name: string
  /** Path to the .did file (required) */
  didFile: string
  /** Override output directory for this canister */
  outDir?: string
  /** Override client manager import path */
  clientManagerPath?: string
  /** Optional fixed canister ID */
  canisterId?: string
}
```

## Requirements

- Node.js 18+
- @ic-reactor/react 3.x
- TypeScript 5.0+

## License

MIT
