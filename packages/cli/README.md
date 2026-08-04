# @ic-reactor/cli

Command-line code generation for IC Reactor. It uses the shared
`@ic-reactor/codegen` pipeline to generate declarations and typed reactor entry
files from your `.did` files, with optional React hook exports.

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
- an optional shared `ClientManager` helper resolved from `clientManagerPath`

## Example Config

```json
{
  "$schema": "./node_modules/@ic-reactor/cli/schema.json",
  "outDir": "src/declarations",
  "clientManagerPath": "../../clients",
  "target": "react",
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
  -o, --out-dir <path>   Output directory (only applied together with -y;
                         the interactive flow prompts for it instead)
```

### `generate` / `g`

```bash
pnpm exec ic-reactor generate [options]

Options:
  -c, --canister <name>  Generate only one configured canister
  --bindgen-only         Generate only the declarations/ files
```

The `declarations/` directory is removed and rewritten on every run, so there is
no separate clean step.

Malformed `ic-reactor.json` files now fail with a parse error instead of being
silently ignored.

## Generated Output

For each canister, the CLI writes into `<outDir>/<canister>/`:

- `declarations/<did-basename>.did` copy
- `declarations/<did-basename>.d.ts` TypeScript service types
- `declarations/<did-basename>.js` IDL factory module
- `index.generated.ts` managed reactor implementation, with optional typed hook exports
- `index.ts` user-facing entrypoint

`<did-basename>` is the file name of the `.did` source without its extension —
it matches the canister name only when the two happen to be the same.

With `target: "react"`, `index.generated.ts` exports the reactor plus six hooks
named after the canister — `use<Canister>Query`, `use<Canister>SuspenseQuery`,
`use<Canister>InfiniteQuery`, `use<Canister>SuspenseInfiniteQuery`,
`use<Canister>Mutation` and `use<Canister>Method`. Query and mutation _objects_
(`createQuery` / `createMutation`) are never generated; write those by hand over
the generated reactor when you need imperative access outside React.

The CLI regenerates `index.generated.ts` on every run. It creates `index.ts`
once, then preserves it unless the file is still the default wrapper or an
older generated scaffold that can be migrated automatically.

When `init` creates the shared client helper, it resolves `clientManagerPath`
relative to the generated canister entry directory. If no canister is
configured yet, the fallback remains `src/clients.ts`.

Set `target` to choose the generated runtime:

- `react` (default): generates the reactor plus bound React hooks
- `core`: generates only the typed reactor exports with no React dependency

Use `--bindgen-only` when you only want the generated declaration files. In
that mode, the CLI skips `index.generated.ts` and `index.ts` entirely and
leaves any existing reactor files untouched.

You can define `target` globally or per canister in `ic-reactor.json`.

## When To Use The CLI

- non-Vite apps
- CI or explicit build pipelines
- projects that want manual control over when generation runs

Use `@ic-reactor/vite-plugin` instead when you want watch-mode regeneration
inside a Vite app.

## Requirements

- Node.js 18+
- TypeScript 5+
- `@ic-reactor/react` in the consuming app if you use `target: "react"` with
  `Reactor` or `DisplayReactor`
- `@ic-reactor/core` in the consuming app if you use `target: "core"` with
  `Reactor` or `DisplayReactor`
- `@ic-reactor/candid` in the consuming app whenever `mode` is `CandidReactor`,
  `CandidDisplayReactor` or `MetadataDisplayReactor` — those three always import
  from `@ic-reactor/candid`, regardless of `target`. With `target: "react"` the
  generated file also imports `createActorHooks` from `@ic-reactor/react`, so
  both packages are needed.

## See Also

- Docs: https://ic-reactor.b3pay.net/v3/packages/cli
- `@ic-reactor/codegen`: ../codegen/README.md
- `@ic-reactor/vite-plugin`: ../vite-plugin/README.md
