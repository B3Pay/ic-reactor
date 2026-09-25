# @ic-reactor/cli

> **AI coding agents:** read [`llms.txt`](./llms.txt) in this package
> (`node_modules/@ic-reactor/cli/llms.txt`) before writing code with it. It
> is written for the installed version and lists the patterns to use and the
> mistakes to avoid.

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

`init` always writes to the current directory. A config in a parent directory
belongs to a different project and is never modified — running `init` in a
monorepo package creates that package's own config.

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
      "didFile": "./backend/backend.did",
      "canisterId": "rrkah-fqaaa-aaaaa-aaaaq-cai"
    }
  }
}
```

Each canister takes `name` and `didFile` (required), and optionally `outDir`,
`clientManagerPath`, `target`, `mode`, `canisterId` and `factories`.

Set `canisterId` for any build that is not served from a local replica. It is
written into `index.generated.ts`. Without it the generated reactor looks its id
up in the `ic_env` cookie, which a `ClientManager` trusts only on a local
replica unless it sets `allowEnvConfig: true`, so importing the generated module
throws `canisterId is required for "backend"` in Node, during SSR and on a
deployed origin. Leave it out only for local development where an `ic_env`
cookie carries the id, such as the one the Vite plugin sets.

## Commands

### `init`

```bash
pnpm exec ic-reactor init [options]

Options:
  -y, --yes              Skip prompts and use defaults
  -o, --out-dir <path>   Output directory (only applied together with -y;
                         the interactive flow prompts for it instead)
```

`-y` is fully non-interactive: it asks nothing, so it is safe to run with stdin
closed in CI. If `ic-reactor.json` already exists in the current directory, `-y`
leaves it exactly as it is and exits 0 — delete the file, or run `init` without
`-y` and confirm the overwrite, to reconfigure.

Cancelling any prompt (Ctrl+C) aborts before anything is written.

### `generate` / `g`

```bash
pnpm exec ic-reactor generate [options]

Options:
  -c, --canister <name>  Generate only one configured canister
  --clean                Remove generated output for canisters that are no
                         longer configured
  --bindgen-only         Generate only the declarations/ files
```

Every run brings `declarations/` up to date, so configured canisters never need
cleaning. What no run updates is the directory of a canister that was renamed
or dropped from the config: `--clean` removes those, and only those. It leaves
the output of configured canisters alone — including the `index.ts` you own —
and never deletes a directory that carries no generated file, since `outDir`
usually holds hand-written code as well. It is skipped for `--canister <name>`
runs, which cannot tell stale output from another canister's current output.

A malformed `ic-reactor.json` fails the command with an error naming the file
and the offending field, rather than a stack trace or a silent skip.

## Generated Output

For each canister, the CLI writes into `<outDir>/<canister>/`:

- `declarations/<did-basename>.did` copy
- `declarations/<did-basename>.d.ts` TypeScript service types
- `declarations/<did-basename>.js` IDL factory module
- `index.generated.ts` managed reactor implementation, with optional typed hook exports
- `index.factories.generated.ts` managed query and mutation factories, only for
  a canister that sets `factories: true`
- `index.ts` user-facing entrypoint

`<did-basename>` is the file name of the `.did` source without its extension —
it matches the canister name only when the two happen to be the same.

A file whose content has not changed is not rewritten, so regenerating from an
unchanged `.did` and config leaves every file untouched.

If Prettier resolves from the directory holding `ic-reactor.json`, the CLI
formats the `.js`, `.d.ts`, `index.generated.ts`, `index.factories.generated.ts`
and the `index.ts` wrapper it writes with it and your Prettier config, so
regenerating leaves formatted,
committed output unchanged. Without Prettier the declarations hold the Candid
parser's output followed by a newline.

With `target: "react"`, `index.generated.ts` exports the reactor plus six hooks
named after the canister — `use<Canister>Query`, `use<Canister>SuspenseQuery`,
`use<Canister>InfiniteQuery`, `use<Canister>SuspenseInfiniteQuery`,
`use<Canister>Mutation` and `use<Canister>Method`.

Set `"factories": true` on a canister for query and mutation _objects_ as
well, which work in components and outside React. The CLI then writes
`index.factories.generated.ts` with one per method, bound to the generated
reactor: `createQuery` for a query method without arguments,
`createQueryFactory` for one with arguments, and `createMutation` for an
update or oneway method, named `<method>Query` or `<method>Mutation` with the
method name in camelCase (`get_message` gives `getMessageQuery`). An update
method is never generated as a query. The default `index.ts` wrapper
re-exports the file; an `index.ts` you have edited is left alone, and the CLI
prints a warning until it re-exports the factories. Switching the option off
removes the file. It needs `target: "react"`. The naming rule for any method
name is in the codegen docs:
https://ic-reactor.b3pay.net/v3/packages/codegen#query-and-mutation-factories

The CLI regenerates `index.generated.ts` on every run. It creates `index.ts`
once, then preserves it unless the file is still the default wrapper or an
older generated scaffold that can be migrated automatically.

When `init` creates the shared client helper, it resolves `clientManagerPath`
relative to the generated canister entry directory. If no canister is
configured yet, the helper goes to `src/clients.ts`. The default import,
`../../clients`, reaches that file only when `outDir` sits directly inside
`src/`, so for any other `--out-dir`, `init -y` also writes the
`clientManagerPath` that does: `--out-dir lib/canisters` gets
`"../../../src/clients"`.

Set `target` to choose the generated runtime:

- `react` (default): generates the reactor plus bound React hooks
- `core`: generates only the typed reactor exports with no React dependency

Use `--bindgen-only` when you only want the generated declaration files. In
that mode, the CLI skips `index.generated.ts`, `index.factories.generated.ts`
and `index.ts` entirely and leaves any existing reactor files untouched.

You can define `target` globally or per canister in `ic-reactor.json`.

## When To Use The CLI

- non-Vite apps
- CI or explicit build pipelines
- projects that want manual control over when generation runs

Use `@ic-reactor/vite-plugin` instead when you want watch-mode regeneration
inside a Vite app.

## Requirements

- Node.js 22.12+ (the floor `commander@15` requires; `@clack/prompts` requires 20.12+)
- TypeScript 5.7+ in the consuming app: the generated code imports IC Reactor,
  whose declarations use generic typed arrays (`Uint8Array<ArrayBuffer>`), which
  TypeScript 5.7 introduced
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
