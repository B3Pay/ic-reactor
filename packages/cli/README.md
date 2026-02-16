# @ic-reactor/cli

> 🔧 Command-line tool for generating IC reactor hooks and declarations.

The `@ic-reactor/cli` helps you generate TypeScript declarations and React hooks from your Candid files. It provides a simple way to keep your frontend types and interactions in sync with your backend canisters.

## Installation

```bash
pnpm add -D @ic-reactor/cli
```

## Quick Start

### 1. Initialize your project

```bash
npx @ic-reactor/cli init
```

This creates an `ic-reactor.json` configuration file in your project root.

### 2. Configure your canisters

Update `ic-reactor.json` with the paths to your Candid files:

```json
{
  "outDir": "./src/canisters",
  "canisters": {
    "backend": {
      "didFile": "src/declarations/backend.did"
    }
  }
}
```

### 3. Sync hooks and declarations

```bash
npx @ic-reactor/cli sync
```

This command will:

1. Regenerate TypeScript declarations for your canisters.
2. Create an `index.ts` file for each canister with fully typed hooks.

### 4. Use the generated hooks

Import the hooks directly from the generated output folder:

```tsx
import { useActorQuery } from "./canisters/backend"

function MyComponent() {
  const { data, isPending } = useActorQuery({
    functionName: "get_message",
  })

  return <p>{isPending ? "Loading..." : data}</p>
}
```

## Commands

### `init`

Initialize the configuration file (`ic-reactor.json`).

```bash
npx @ic-reactor/cli init [options]

Options:
  -y, --yes              Skip prompts and use defaults
  -o, --out-dir <path>   Output directory for generated hooks
```

### `sync`

Regenerate hooks and declarations based on your configuration and DID files.

```bash
npx @ic-reactor/cli sync [options]

Options:
  -c, --canister <name>   Sync only a specific canister
```

### `list`

List all available methods from a canister's Candid definition.

```bash
npx @ic-reactor/cli list -c <canister_name>
```

## Configuration

The `ic-reactor.json` file supports the following options:

| Option              | Type                             | Description                                |
| :------------------ | :------------------------------- | :----------------------------------------- |
| `outDir`            | `string`                         | Base output directory for generated files. |
| `canisters`         | `Record<string, CanisterConfig>` | Map of canister names to configurations.   |
| `clientManagerPath` | `string`                         | Path to a custom `ClientManager` instance. |

### Canister Config

| Option              | Type      | Description                                         |
| :------------------ | :-------- | :-------------------------------------------------- |
| `didFile`           | `string`  | Path to the `.did` file.                            |
| `outDir`            | `string`  | Override output directory for this canister.        |
| `useDisplayReactor` | `boolean` | Use `DisplayReactor` instead of standard `Reactor`. |
| `clientManagerPath` | `string`  | Override client manager path.                       |

## Requirements

- Node.js 18+
- @ic-reactor/react 3.x
- TypeScript 5.0+

## License

MIT
