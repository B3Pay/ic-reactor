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

Codegen now writes two files per canister, three with `factories: true`: a managed `index.generated.ts` implementation that is regenerated on every run (and the managed `index.factories.generated.ts`), and an `index.ts` entry wrapper. The wrapper is created once, then preserved unless it still matches the default generated wrapper or an older generated scaffold that can be migrated automatically. A scaffold that carries any export the old generator never wrote counts as user-owned and is left alone; one that is migrated is copied to `index.ts.bak` first. When Prettier resolves from `projectRoot`, `runCanisterPipeline` formats `index.generated.ts`, `index.factories.generated.ts` and the wrapper it writes with the project's config, as it does the declarations.

Each canister needs its own `outDir`. Codegen writes a `.ic-reactor-owner` marker naming the canister that owns the directory, and a run whose canister does not match that marker fails rather than overwriting it — every run leaves `declarations/` holding only its own files. The marker is written by `generateDeclarations`, so the guard also covers `--bindgen-only` runs, which skip `index.generated.ts` but still write `declarations/`. Directories generated before the marker existed fall back to the canister name recorded inside `index.generated.ts`.

Set `generateReactor: false` if you only want the bindgen/declaration output and
need to skip `index.generated.ts`, `index.factories.generated.ts` and `index.ts`.

`runCanisterPipeline` resolves with `{ canisterName, success, files, error?,
warnings? }`. `warnings` lists what a successful run could not fix for you,
such as an `index.ts` of your own that does not re-export the factories.

## Query and Mutation Factories

Set `canisterConfig.factories: true` to also write a managed
`index.factories.generated.ts`: one object per method of the service, bound to
the generated reactor and chosen by the method's annotation in the `.did`.

| Method                                       | Factory              | Export name        |
| :------------------------------------------- | :------------------- | :----------------- |
| `query` or `composite_query`, no arguments   | `createQuery`        | `<method>Query`    |
| `query` or `composite_query`, with arguments | `createQueryFactory` | `<method>Query`    |
| update (no annotation) or `oneway`           | `createMutation`     | `<method>Mutation` |

An update method is never generated as a query. `<method>` is the method name
in camelCase (`get_message` gives `getMessageQuery`). A name that would begin
with a digit gets a leading `_`, and methods take their names in Candid's
order (by name): a name an earlier method took, or one `index.generated.ts`
exports (such as the hook `useBackendQuery`), gets `_` appended until it is
free. `getFactoryExportNames(canisterName, methods)` returns the names. A
method added later can therefore take a name an existing method had, when it
sorts first; each export's doc comment names the method it calls.

Each call is annotated `/* @__PURE__ */`, so a bundler leaves out the factories
an app does not import, although the wrapper re-exports them all. Like the
reactor they are bound to, they are module-scope objects: fine for a
client-only app, while a server-rendered one builds its reactor per request.

```typescript
import { getMessageQuery, setMessageMutation } from "./declarations/backend"

const { data } = getMessageQuery.useQuery() // in a component
await setMessageMutation.execute(["hello"]) // anywhere
```

The default `index.ts` wrapper re-exports the file. Switching `factories` off
removes it (only while it still carries codegen's header) and restores the
plain wrapper if nobody edited it. It needs `target: "react"`: with
`target: "core"`, `assertSafeCanisterConfig` throws a `CodegenConfigError` and
the run fails before it writes anything.

## Generators

You can also use individual generators if you need more granular control:

- **`generateDeclarations`**: Writes `declarations/<did-basename>.js` (factory), `.d.ts` (types), and a `.did` copy. Nothing is written until every file has been generated, so a `.did` that fails to parse leaves the previous declarations untouched, and a file whose content has not changed is not rewritten. A `.did` that parses but declares no `service` is rejected — it would produce no `idlFactory` and no `_SERVICE`. It also writes the `.ic-reactor-owner` marker into `outDir`, which is what stops a second canister generating over the first one's declarations. Pass `projectRoot` and, if Prettier resolves from that directory, the generator formats the `.js` and `.d.ts` with it, using the config Prettier resolves for each file's final path. Configured plugins given by package name are resolved from `projectRoot` too. Without a resolvable Prettier, or when formatting throws, it writes the Candid parser's output followed by a newline. The `.did` copy is a byte copy of the source and is never formatted. `runCanisterPipeline` always passes its own `projectRoot`.
- **`generateReactorFile`**: Generates the managed `index.generated.ts` implementation using any `ReactorClassName` — `Reactor`, `DisplayReactor` (default), `CandidReactor`, `CandidDisplayReactor`, or `MetadataDisplayReactor`. With `target: "react"` it also emits the six `createActorHooks` exports (`use<Canister>Query`, `use<Canister>SuspenseQuery`, `use<Canister>InfiniteQuery`, `use<Canister>SuspenseInfiniteQuery`, `use<Canister>Mutation`, `use<Canister>Method`). The query and mutation objects come from `generateFactoriesFile`.
- **`generateFactoriesFile`**: Generates the managed `index.factories.generated.ts` from `{ canisterName, methods, reactorClass }`, where `methods` is `parseDid(source).service.methods` or any list of `{ name, mode, args }` (`FactoryMethod`). It imports only the factories it calls, so it compiles under `noUnusedLocals`, and for the three `@ic-reactor/candid` classes it passes each call the service, transform and method name as type arguments.
- **`generateReactorEntryFile`**: Generates the stable `index.ts` wrapper that re-exports from `index.generated.ts`, and with `{ factories: true }` from `index.factories.generated.ts` too.
- **`generateClientFile`**: Generates a `ClientManager` boilerplate file that
  imports `ClientManager` from `@ic-reactor/react`.

## Utilities

- **`toPascalCase` / `getReactorName` / `getServiceTypeName`**: Naming helpers.
- **`getFactoryExportNames`**: The export name of each method's generated factory, keyed by method name.
- **`assertSafeCanisterConfig` and friends**: Validate a canister config before generating; the pipeline runs these itself.
- **`findSharedOutDirs` / `sharedOutDirMessage`**: Find the configured entries that would generate into a directory an earlier entry already uses — two entries with the same `name` under the global `outDir`, say, which the pipeline's owner marker cannot tell apart — and word the error the CLI and the Vite plugin report for them. Directories are compared by their real location on disk.

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
