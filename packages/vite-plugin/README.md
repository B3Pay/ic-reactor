# @ic-reactor/vite-plugin

> **ic-reactor 4 is a prerelease.** `4.0.0-beta.1` is published under npm's
> `beta` dist-tag, and `latest` stays the 0.15 plugin of the 3.x line until 4.0
> GA. That plugin, which generates reactor bindings with `@ic-reactor/codegen`,
> is documented at https://ic-reactor.b3pay.net/v3/packages/vite-plugin.

A Vite plugin for an app built on a module that `candid-core-cli gen` generates
from a `.did` file. It does two things, and exports only `icReactor` and the
type `IcReactorPluginOptions`:

- **Generation.** It runs `candid-core-cli gen` on each configured `.did` file
  when a build or the dev server starts, and again when that file changes. The
  generated module is candid-core's, as the generator wrote it: the plugin
  adds no wrapper files, hooks or reactors.
- **Environment.** Under `vite dev` and `vite preview` it sets the `ic_env`
  cookie and proxies `/api` to the local IC network, so the app finds its
  canister IDs and the replica's root key without configuration.

## Install

The plugin runs the `@candid-core/cli` your app installs, and that CLI has to
pair with the `@candid-core/schema` runtime the generated modules import. Both
are pinned to one exact release while they are betas, and so is the plugin's
peer on the CLI:

```sh
npm install --save-exact @candid-core/schema@0.3.0-beta.1
npm install --save-dev --save-exact @candid-core/cli@0.2.0-beta.1
npm install --save-dev @ic-reactor/vite-plugin@beta
```

## Quick Start

```ts
// vite.config.ts
import { defineConfig } from "vite"
import { icReactor } from "@ic-reactor/vite-plugin"

export default defineConfig({
  plugins: [
    icReactor({
      canisters: {
        ledger: { didFile: "../backend/ledger.did" },
      },
    }),
  ],
})
```

On `vite dev` and `vite build` this writes `src/canisters/ledger.ts`, the
generated module (it exports `actor` and the type `Actor`), and
`src/canisters/ledger.envelope.json` next to it. The generator names its output
after the `.did` file, not after the key in `canisters`.

The first line the plugin logs says where an agent reads how to use the
library: `ic-reactor: agent guide at node_modules/@ic-reactor/core/llms.txt`.

## Options

| Option              | Default                   | Meaning                                                                           |
| ------------------- | ------------------------- | --------------------------------------------------------------------------------- |
| `canisters`         | `{}`                      | The app's canisters, by their name in the `icp` project; see below                |
| `injectEnvironment` | `true`                    | Set the cookie and the `/api` proxy under `vite dev` and `vite preview`           |
| `failOnError`       | build `true`, dev `false` | Abort the Vite run when a canister fails to generate; see "When generation fails" |

Each entry of `canisters` takes:

| Field        | Default           | Meaning                                                                                |
| ------------ | ----------------- | -------------------------------------------------------------------------------------- |
| `didFile`    | none              | The canister's Candid file, relative to the Vite root. Without it nothing is generated |
| `outDir`     | `"src/canisters"` | Where the generator writes, relative to the Vite root                                  |
| `canisterId` | none              | A fixed ID for the cookie, which wins over the one `icp` reports                       |

Canisters that share one interface share one module. An ICP ledger and a ckBTC
ledger both on `icrc1.did` are two entries, so that the `ic_env` cookie carries
each ID, and one generated module:

```ts
// vite.config.ts
import { defineConfig } from "vite"
import { icReactor } from "@ic-reactor/vite-plugin"

export default defineConfig({
  plugins: [
    icReactor({
      canisters: {
        icp_ledger: { didFile: "did/icrc1.did" },
        ckbtc_ledger: { didFile: "did/icrc1.did" },
      },
    }),
  ],
})
```

The generator is given `icrc1.did` once, writes `src/canisters/icrc1.ts` once,
and a save of the file regenerates it once. (Naming a canister without a
`didFile` is the same thing when only the cookie is wanted.) Different `.did`
files that name the same module cannot share an `outDir`: `a/ledger.did` and
`b/ledger.did` both mean `ledger.ts`, and the second is refused with a message
naming both. Give one an `outDir` of its own. Names that differ only in case
(`Ledger.did` and `ledger.did`) collide only where the filesystem of the
`outDir` ignores case, as macOS and Windows do by default: the plugin checks
the filesystem and does not refuse them where it tells them apart.

## Generation

The generator is WebAssembly, so the plugin does not load it: it runs the bin
script of the `@candid-core/cli` installed for your app (resolved from the Vite
root, so a monorepo's hoisted copy is found) with the running Node binary, in a
child process and not through a shell. A trap, a crash or a runaway loop on a
bad `.did` ends that process and the plugin reports it. The dev server is not
affected.

- Canisters that write into one `outDir` share one process, and each `outDir`
  has its own. A process that dies without a report is run again, one
  canister at a time and side by side, so the failure lands on the canister
  that caused it.
- A process that runs longer than 60 seconds is killed, and counts as one that
  died: when it was generating several canisters, each is run again alone and
  only the one that hangs fails. A hang therefore costs up to two timeouts
  (120 seconds) before the others are generated.
- What the generator writes to stderr is logged as a warning, a line at a time
  and as it arrives, naming the `.did` files its process is generating. With
  `--json` the generator reports in its JSON document, so what shows up here
  is a crash's output or a warning from the runtime. When a process fails, its
  stderr is also in the error message, so that text appears twice. Past 200
  lines from one process the rest is not logged, so a runaway generator does
  not flood the terminal.
- Closing the dev server (or restarting it, as a `vite.config` edit does) kills
  a generator that is still running and drops the runs still waiting, so none
  outlives the server it belonged to or runs beside the next one.
- A declaration the generator cannot represent is left out of the module, and
  the plugin logs each one as a warning, for example
  `ic-reactor: ledger: omitted declaration Bad (reserved_field_name)`.
- Editing a `.did` regenerates only the canisters that name it. Saves that
  arrive while it runs collapse into one more run. `vite build --watch`
  regenerates a canister only when its `.did` text changed.
- Deleting a `.did` under `vite dev` fails the canisters that name it at once,
  in the log and the overlay: the module it generated is still on disk, and
  would otherwise look current. Putting the file back regenerates them.

### When generation fails

A failed canister costs that canister, and nothing else:

- Under `vite build` the build fails, with the generator's diagnostics (or its
  stderr, if it crashed) in the error message. A build that exits 0 would ship
  the bindings left over from the last good run.
- Under `vite dev` the failure is logged and shown in the browser's error
  overlay, and the server keeps serving. The overlay lists the canisters that
  are still broken: fixing one of several updates it, and fixing the last
  clears it. Vite's client clears an error overlay whenever it applies a hot
  update, as it does for Vite's own errors, so a canister that is still broken
  can drop out of the browser's overlay after you save some other file. Its
  error stays in the terminal log, and a full reload shows the overlay again.
- `failOnError` overrides either default.

### In CI

`candid-core-cli gen --check` compares the generated files with the ones on
disk, writes nothing, and exits 1 on any difference. Run it with the same
arguments the plugin uses to fail a pipeline when committed output is stale:

```json
{
  "scripts": {
    "gen:check": "candid-core-cli gen ../backend/ledger.did -o src/canisters --check"
  }
}
```

## Local Development Behavior

When `injectEnvironment` is enabled during `vite dev` or `vite preview`, the
plugin:

1. asks `icp` for the local network status
2. resolves canister IDs: the keys of `canisters`, and `internet_identity`,
   which is added automatically if not already listed
3. sets the `ic_env` cookie on each response
4. proxies `/api` to the local replica

If a canister has a `canisterId` set in the plugin config, that value overrides
the auto-detected ID for that canister.

Set the `ICP_ENVIRONMENT` environment variable to target a non-default network
(defaults to `"local"`).

If environment detection fails, the plugin falls back to proxying `/api` to
`http://127.0.0.1:4943`, and sets no cookie, or with no canisters configured one
that names only icp-cli's built-in Internet Identity. It warns when that happens
with canisters configured, and when a configured canister has no ID, because
the failure is otherwise indistinguishable from success until the app breaks on
an undefined canister id. Run with `DEBUG=ic-reactor` to see the `icp` output
behind the warning.

Detection is complete once `icp` reports the network and every configured
canister has an ID. Until then the plugin asks `icp` again on each page load,
and that page gets the answer: start `vite dev` first, then run
`icp network start` and `icp deploy`, and reload the page. The `/api` proxy
moves to the network `icp` reports, the fallback included. Once detection is
complete, page loads run no further `icp` commands, so redeploying into a
fresh network, with new canister IDs and a new root key, needs a dev server
restart. A configured canister you never deploy locally keeps detection
incomplete, so every page load runs `icp` for it; set its `canisterId` and it
counts as resolved. If you never run a local network, set
`injectEnvironment: false` and page loads run no `icp`.

If your Vite config or another plugin sets `server.proxy["/api"]`, the plugin
leaves that entry alone, whether detection succeeds or not, and that proxy does
not follow detection.

## Tests

Vitest runs the plugin in mode `test`. There the plugin injects no environment
and never runs `icp`, whatever `injectEnvironment` says. Generation is not an
environment concern and still runs, so the modules a test imports exist.
