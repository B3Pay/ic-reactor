# @ic-reactor/cli

Command-line code generation for IC Reactor. It uses the shared
`@ic-reactor/codegen` pipeline to generate declarations and typed reactor entry
files from your `.did` files.

## Install

```bash
pnpm add -D @ic-reactor/cli
```

After installation, the local executable is `ic-reactor`.

## Quick Start

```bash
pnpm exec ic-reactor init
pnpm exec ic-reactor generate
```

If you prefer one-off usage without installing first:

```bash
pnpm dlx @ic-reactor/cli init
pnpm dlx @ic-reactor/cli generate
```

## What `init` Creates

- an `ic-reactor.json` config file
- an optional `src/clients.ts` helper with a shared `ClientManager`

## Example Config

```json
{
  "$schema": "./node_modules/@ic-reactor/cli/schema.json",
  "outDir": "src/declarations",
  "clientManagerPath": "../../clients",
  "canisters": {
    "backend": {
      "name": "backend",
      "didFile": "./backend/backend.did"
    }
  }
}
```

## Commands

### `init`

```bash
pnpm exec ic-reactor init [options]

Options:
  -y, --yes              Skip prompts and use defaults
  -o, --out-dir <path>   Output directory for generated files
```

### `generate` / `g`

```bash
pnpm exec ic-reactor generate [options]

Options:
  -c, --canister <name>  Generate only one configured canister
  --clean                Clean the output directory before generation
```

## Generated Output

For each canister, the CLI generates:

- `<canister>.did` copy
- `<canister>.did.d.ts` TypeScript service types
- `<canister>.js` IDL factory module
- `index.ts` reactor and typed hook entrypoint

The generated `index.ts` is only overwritten while it still contains the
generator marker. If you replace it with a custom module, later runs leave it
alone.

## When To Use The CLI

- non-Vite apps
- CI or explicit build pipelines
- projects that want manual control over when generation runs

Use `@ic-reactor/vite-plugin` instead when you want watch-mode regeneration
inside a Vite app.

## Requirements

- Node.js 18+
- TypeScript 5+
- `@ic-reactor/react` in the consuming app if you plan to use generated React
  hooks

## See Also

- Docs: https://ic-reactor.b3pay.net/v3/packages/cli
- `@ic-reactor/codegen`: ../codegen/README.md
- `@ic-reactor/vite-plugin`: ../vite-plugin/README.md
