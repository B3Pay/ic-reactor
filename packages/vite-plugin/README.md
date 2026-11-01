# @ic-reactor/vite-plugin

> **This is the plugin of ic-reactor 4.** It replaces the 0.15 plugin of the
> 3.x line, which generates reactor bindings with `@ic-reactor/codegen`, is
> documented at https://ic-reactor.b3pay.net/v3/packages/vite-plugin, and takes
> security fixes until 90 days after the 4.0 release.

A Vite plugin for an app built on a module that `candid-core-cli gen` generates
from a `.did` file. It does two things, and exports only `icReactor` and the
type `IcReactorPluginOptions`:

- **Generation.** It runs `candid-core-cli gen` on each configured `.did` file
  when a build or the dev server starts, and again when that file changes. The
  generated module is candid-core's, as the generator wrote it: the plugin
  adds no wrapper files, hooks or reactors. A `.did` that is not on disk yet
  can be fetched from the live canister first (see "Fetch a .did from a live
  canister").
- **Environment.** Under `vite dev` and `vite preview` it sets the `ic_env`
  cookie and proxies `/api` to the local IC network, so the app finds its
  canister IDs and the replica's root key without configuration.

The docs site's [Vite plugin guide](https://ic-reactor.b3pay.net/v4/guides/vite-plugin/)
covers the same ground, and
[Getting started](https://ic-reactor.b3pay.net/v4/guides/getting-started/)
uses the plugin in a new app.

## Install

The plugin runs the `@candid-core/cli` your app installs, and that CLI has to
pair with the `@candid-core/schema` runtime the generated modules import. Both
are pinned to one exact release, as candid-core asks of every release before
1.0, and so is the plugin's peer on the CLI:

```sh
npm install --save-exact @candid-core/schema@0.4.0
npm install --save-dev --save-exact @candid-core/cli@0.3.0
npm install --save-dev @ic-reactor/vite-plugin
```

Install the CLI at the version above: `npm install --save-dev @candid-core/cli`
without one installs the newest CLI, which pairs with another schema, and npm
stops with `ERESOLVE`.

`@icp-sdk/core` 6.1 or later is an optional peer: the plugin loads it only to
fetch a `.did` from a live canister, and an app on `@ic-reactor/core` has it
installed already.

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
after the `.did` file, its name without the final `.did`, not after the key in
`canisters`, and it reads only a file whose name ends in `.did`.

The first line the plugin logs says where an agent reads how to use the
library: `ic-reactor: agent guide at node_modules/@ic-reactor/core/llms.txt`.

## Options

| Option              | Default                              | Meaning                                                                           |
| ------------------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| `canisters`         | `{}`                                 | The app's canisters, by their name in the `icp` project; see below                |
| `injectEnvironment` | `true`                               | Set the cookie and the `/api` proxy under `vite dev` and `vite preview`           |
| `failOnError`       | build and Vitest `true`, dev `false` | Abort the Vite run when a canister fails to generate; see "When generation fails" |
| `onGenerated`       | none                                 | Called after each generated module; see "After each generation"                   |

Each entry of `canisters` takes:

| Field        | Default           | Meaning                                                                                                                |
| ------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `didFile`    | none              | The canister's Candid file, relative to the Vite root. Without it nothing is generated                                 |
| `outDir`     | `"src/canisters"` | Where the generator writes, relative to the Vite root                                                                  |
| `canisterId` | none              | A fixed ID for the cookie, which wins over the one `icp` reports, and the canister a missing `didFile` is fetched from |
| `network`    | `"ic"`            | Where that canister is, for the fetch: `"ic"`, `"local"` or `{ host }`                                                 |
| `methods`    | none              | The methods the app calls: a fetched `didFile` is written as the projection of the interface to them                   |
| `verify`     | none              | `"live"` checks the `didFile` against the live canister at each build and dev server start                             |

Every value given is checked when the plugin is made, on every canister (one
without a `didFile` included) and whether or not a build would use it: only an
omitted field is one not given. A canister whose entry is not a plain object,
or whose field holds a value that is not one (a `didFile` or `outDir` that is
not a path, a `canisterId` that is not the text of a principal, a `network`,
`methods` or `verify` that is none of the values above, or a getter that
throws) fails, under `failOnError`, with a message that quotes the value as
given, whatever its kind. The plugin fetches, writes, runs and requests
nothing to generate it, nor fetches a `didFile` it shares with other
canisters, and the others build as they would. So does a canister whose
module a canister before it writes (below), and one that `IC_REACTOR_FETCH` or
`IC_REACTOR_VERIFY` names but that has no `canisterId`. Under `vite dev`, a
save of its file, and the file's deletion, leave it failed for the same reason
and run nothing for it. Such a canister is still named in the `ic_env` cookie,
as every entry is (but one whose name the cookie cannot carry, below), and
under `vite dev` `icp` is still asked for its ID: the app may still call it. A
`canisters`, `injectEnvironment` or `failOnError` that is not one, `null`
included, throws when the config loads: only an omitted option takes its
default.

Every key is checked too, whatever its value, `undefined` included. A key of
an entry that is none of the fields above (a misspelled `didfile` or
`canisterID`), or a key of a `network` of `{ host }` other than `host`, fails
its canister, and a key of the options that is none of `canisters`,
`injectEnvironment`, `failOnError` and `onGenerated` throws when the config loads. The
message names the option the key may misspell. Never read, a misspelled key
would leave a canister ungenerated, or generated without its ID, without a
word.

The options, `canisters`, each entry and a `network` of `{ host }` are plain
objects: written `{ … }`, or made by `JSON.parse`, `Object.fromEntries` or
`Object.create(null)`. A `Map`, a `Promise` (a loader that was not awaited),
an instance of a class or an object that inherits from another is refused as
any other value that is not one: read for its keys, it would be read as none.

An entry's key is the canister's name in the `icp` project, kept as given:
`__proto__` or `constructor` (from a JSON config, or a computed key) names a
canister as any other name does, and so does a name that begins with `-`. The
cookie joins its entries with `&` and each name to its ID with `=`, as the
asset canister writes it, so a name that holds either, which no name `icp`
gives a canister does, is left out of the cookie, with a warning under
`vite dev`; such a canister is generated as any other.

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
`b/ledger.did` both mean `ledger.ts`. The entry later in `canisters` fails,
with a message naming both, at the start of each build and dev server and
before anything is fetched, run or written for it, and a save of its file
does not generate it either. Give one an `outDir` of its own. Names that
differ only in case (`Ledger.did` and `ledger.did`) collide only where the
filesystem of the `outDir` ignores case, as macOS and Windows do by default:
the plugin checks the filesystem and does not refuse them where it tells them
apart.

## Fetch a .did from a live canister

Give an entry a `canisterId`, and a `didFile` that is not on disk is written
from the live canister's `candid:service` metadata, read from certified state
with `HttpAgent.readState`, before it is generated:

```ts
// vite.config.ts
import { defineConfig } from "vite"
import { icReactor } from "@ic-reactor/vite-plugin"

export default defineConfig({
  plugins: [
    icReactor({
      canisters: {
        ledger: {
          didFile: "did/icp_ledger.did", // written when missing: commit it
          canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
          network: "ic",
        },
      },
    }),
  ],
})
```

- A `didFile` on disk is generated with no network request, under `vite build`
  and `vite dev`. Commit the file the plugin writes, and builds stay
  reproducible and work offline.
- It is fetched again only on request: `IC_REACTOR_FETCH=ledger vite build`
  (names separated by commas, or `all`). A build without it never rewrites a
  `didFile`.
- `network` is `"ic"` (mainnet, checked against the mainnet root key; the
  default), `"local"` (icp-cli's local network on `http://127.0.0.1:8000`,
  whose root key is fetched from it), or `{ host }`, whose root key is fetched
  only when the host is local (`localhost`, `*.localhost` or a loopback
  address) and is mainnet's otherwise, as `createClient` decides.
- An unreachable network, a refused read (the canister keeps its interface
  private), a canister that publishes no `candid:service`, a canister that
  does not exist on that network, a certificate that does not verify against
  the root key (the message names the key), and a network that does not answer
  within 30 seconds each fail with a message of their own, naming the canister
  and what to do next. A `didFile` that cannot be written fails only the
  canisters that name it. A failed fetch follows `failOnError` as a failed
  generation does, and is tried again at the next build.
- Canisters that name one `didFile` (under any path to it: through a
  symlinked directory, or in another case where the filesystem ignores case)
  share one fetch. When they name different canisters or networks to fetch it
  from, none is fetched and each fails, naming them and the file: give each
  its own `didFile`, or write the file yourself. A `didFile` on disk is shared
  whatever their `canisterId`s. A `didFile` that is a symlink is written
  through, to the file it links to. Only the fetch is shared: the generator
  (`@candid-core/cli` 0.3.0) reads a `didFile` only by its exact name on disk,
  and not through a symlink to a file, so an entry that names it either way
  fails with `did_source_not_found`. Name the file as it is on disk in each
  entry.
- `canisterId` is also the ID the `ic_env` cookie carries under `vite dev`.

### Only the methods the app calls

With `methods`, the fetched `didFile` holds only those methods and every type
they reach: the projection of the live interface, written by
`candid-core-cli project`, so the generated module has only them.

```ts
// vite.config.ts
import { defineConfig } from "vite"
import { icReactor } from "@ic-reactor/vite-plugin"

export default defineConfig({
  plugins: [
    icReactor({
      canisters: {
        ledger: {
          didFile: "did/icp_ledger.did", // the projection: commit it
          canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
          methods: ["icrc1_balance_of", "icrc1_fee", "icrc1_transfer"],
        },
      },
    }),
  ],
})
```

- A name the live interface does not have fails the canister, naming it and
  listing the methods the canister has, and nothing is written.
- A `didFile` on disk is not fetched again when `methods` changes. The plugin
  compares the two with no network access: a name of `methods` that the file
  does not hold fails the canister, and a method the file holds that `methods`
  does not name is a warning. Both say to fetch the file again with
  `IC_REACTOR_FETCH=<name>`, which writes the projection to the new list. A
  file whose methods cannot be listed (it does not compile, or
  `candid-core-cli` fails) fails the canister. A file saved after its methods
  were listed, before its module is generated, is not taken by that run (see
  [Generation](#generation)).
- Canisters that name one `didFile` to be fetched must name one list to share
  its fetch, and an entry with no `canisterId` counts too, since it generates
  from the same file: its `methods`, or the whole interface when it names
  none. With different lists, or when one of them fails for a value of its
  own (a list that cannot be projected to, say), nothing is fetched and no
  request is made: each fails with one message naming the entries and the
  file, and their lists when they differ, or the reasons of the one that
  fails. A `didFile` on disk that is not fetched again is read by them all,
  and compared with the list of each as above.
- Only an omitted `methods` is the whole interface. Any other value given
  that is not a list of method names (`null`, `false`, `""`, an empty list,
  or a name with a comma) fails the canister before any request. Likewise
  only an omitted `canisterId` is none: one given as `""` or `null`, or as
  text with a letter wrong (its checksum tells) or of more than 63
  characters (a principal of the IC is at most 29 bytes), fails the canister,
  whether or not a fetch or a check would use it, and is left out of the
  `ic_env` cookie with a warning (see [Options](#options)).

### The live check

`verify: "live"` on an entry, or `IC_REACTOR_VERIFY=1 vite build` (or `true`,
`all`, or canister names separated by commas) for every entry with a
`canisterId`, checks the `didFile` on disk against the live canister's
certified interface with `candid-core-cli check`, at the start of each build
and dev server. Each check is a network request, so `verify: "live"` makes
every build need the network; `IC_REACTOR_VERIFY=1` in CI keeps other builds
offline. `IC_REACTOR_VERIFY=0` (or `false`) turns the check off for a run,
over `verify: "live"`.

- A method of the file that the canister no longer has (`method_missing`),
  whose mode changed (`mode_changed`), or whose types are no longer compatible
  (`method_incompatible`, with the path into the type) fails the canister,
  which is not generated, and the failure follows `failOnError`.
- A compatible change is a warning, and the canister generates: one Candid
  accepts only by reading a value as `null` (`special_opt_rule`), and one that
  changed the types of the file's methods compatibly. Methods the file does
  not hold are not checked.
- A check that cannot read the canister (the network, a private interface)
  fails the canister too, and says to build with `IC_REACTOR_VERIFY=0`: a
  check that was asked for and did not run does not pass.
- A file the build just fetched is the live interface: it is not checked,
  and passes as fetched. Within one build or dev server, a check that passed
  is not repeated for the same text by a rebuild (`vite build --watch`) or by
  another Vite environment, until a check of that canister fails or cannot be
  made, or a fetch of its file fails or reads another interface: restoring a
  text that passed earlier then checks it again. The check of a file saved
  before the check is done (even saved back) counts for nothing, passed or
  failed: it records no pass, neither sets nor clears a failure that stands,
  and that run does not take the file: a build fails it, and `vite dev`
  queues it again as a save, which makes no request (see
  [Generation](#generation)). Each build
  and each start of the dev server, a restart included, checks every
  canister again, so a restart finds a canister that changed since its last
  check.
- A save under `vite dev` never makes a request. So a canister whose check
  failed (or could not be made, as with the network down) stays failed after
  a save, whatever the save changed, and is not generated, until a start
  checks it again and the check passes, fetches the file again
  (`IC_REACTOR_FETCH`), or runs with the check off: restart the dev server
  (`r` and Enter in its terminal) to check again.
- `verify` takes only `"live"`: any other value, `true` or `false` included,
  fails the canister before anything is fetched for it, and so does `"live"`
  with no `canisterId`. Remove `verify` for no check.

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
  a generator of that server that is still running and drops its runs still
  waiting, so none outlives the server it belonged to or runs beside the next
  one. A server restarted with the same plugin object (an inline config, which
  `server.restart()` keeps) has runs of its own: Vite starts it before it
  closes the old one, and the old server's close does not stop them. Its
  overlay starts as the old one's, and its runs change it.
- A declaration the generator cannot represent is left out of the module, and
  the plugin logs each one as a warning, for example
  `ic-reactor: ledger: omitted declaration Bad (reserved_field_name)`.
- Editing a `.did` regenerates only the canisters that name it. Saves that
  arrive while it runs collapse into one more run. `vite build --watch`
  regenerates a canister only when its `.did` text changed, or its module or
  envelope is missing.
- A run (the start of a build or dev server, or a save's regeneration) reads
  each `didFile` once, and again after each step that runs `candid-core-cli`
  on it (listing its methods, the live check, generation), since each of those
  reads the file itself. A file written before the run is done with it (even
  saved back) is not taken: the run does not generate it, reports nothing its
  steps found of it, and puts back a module the generator wrote while the file
  was written. Under `vite build` the canister fails for that reason alone
  (`did/ledger.did changed during the build, after the build read it: … Build again.`);
  under `vite dev` the file is queued again, as a save is, and until that run
  reports it the overlay is left as it was. Only the `didFile` is read again,
  not a `.did` it imports from its directory.
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
- Under Vitest (mode `test`) the run fails at startup, as a build does: tests
  that pass against the modules left over from the last good run prove
  nothing.
- `failOnError` overrides each default. It takes `true` or `false`: any
  other value (`null`, `0`, `"false"`) throws when the config loads, as does
  one for `injectEnvironment`.

### After each generation

`onGenerated` is called once for each module a run generated, after the
generator wrote or checked it and its envelope, under `vite build` and
`vite dev` alike. Use it for a step that reads the generated output and must
run after every generation:

```ts
import { readFile } from "node:fs/promises"
import { icReactor } from "@ic-reactor/vite-plugin"

icReactor({
  canisters: { ledger: { didFile: "did/ledger.did" } },
  onGenerated: async ({ names, envelope, status }) => {
    const text = await readFile(envelope, "utf-8")
    // check it, or write derived files; throw to fail the run
    console.log(names, status, text.length)
  },
})
```

- It is handed `names` (canisters that share a `didFile` and an `outDir`
  share one module and one call), the absolute paths `didFile`, `module` and
  `envelope`, `status` (`"written"`, or `"unchanged"` when the module on disk
  was already what the generator would write), and a `signal` that aborts
  when the build or dev server closes. A close stops waiting for the hook,
  and the next run generates the module again and calls the hook again.
- It runs inside the plugin's one queue of runs: it never overlaps a
  generation, and `buildStart` waits for it, so under `vite build` a hook
  that never settles holds the build.
- It is not called for a canister that failed or was refused, nor for a run
  that does not generate the module again (the second `buildStart` of
  Vite 6 and later, a `vite build --watch` rebuild not caused by a `.did`
  or by a missing module or envelope).
  A save under `vite dev` always generates again, so saving the same text
  calls it with `"unchanged"`.
- A throw or a rejection fails the module's canisters as a failed generation
  does: the build or the Vitest run fails unless `failOnError` is `false`, and
  otherwise the failure is logged and, under `vite dev`, shown in the error
  overlay. The
  next run generates them again and calls the hook again.
- A value that is not a function throws when the config loads.

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

If a canister has a `canisterId` set in the plugin config, that value is used
for it, and `icp` is not asked for its ID. `internet_identity` is asked for
even then: what `icp` reports decides whether the cookie also names icp-cli's
built-in Internet Identity.

Set the `ICP_ENVIRONMENT` environment variable to target a non-default network
(defaults to `"local"`).

If environment detection fails, the plugin falls back to proxying `/api` to
icp-cli's local network, `http://127.0.0.1:8000`, and sets no cookie (a page
load clears one the browser kept), or with no canisters configured one that
names only icp-cli's built-in Internet Identity. It warns when that happens with canisters configured, and when a
configured canister has no ID, because the failure is otherwise
indistinguishable from success until the app breaks on an undefined canister
id. Run with `DEBUG=ic-reactor` to see the `icp` output
behind the warning.

Detection is complete once `icp` reports the network and every configured
canister has an ID. Until then the plugin asks `icp` again on each page load,
and that page gets the answer: start `vite dev` first, then run
`icp network start` and `icp deploy`, and reload the page. The `/api` proxy
moves to the network `icp` reports, the fallback included. Once detection is
complete, page loads run no further `icp` commands, so any network restart
(`icp network stop`, then `start` and `icp deploy`) needs a dev server
restart, even when the root key stays the same. icp-cli 1.2.0's managed
network kept its root key across starts while a new deploy gave the names
other canister IDs.

While it serves, the plugin holds a connection to the detected network, so it
notices the network stop when it stops, whether or not a request reaches it.
From then on it no longer vouches for the IDs it detected, which a network
started again may have given to other canisters. It warns once, page loads get
the cookie without those IDs and that root key (with canisters configured, no
cookie at all), and `vite dev` reloads the pages it has open so that they drop
the old cookie. `{ name }` canisters then reject `canister_id_unresolved`
instead of reaching another canister, until the dev server restarts. Under
`vite preview`, which has no HMR connection, reload open pages yourself.

A configured canister you never deploy locally keeps detection
incomplete, so every page load runs `icp` for it; set its `canisterId` and it
counts as resolved. If you never run a local network, set
`injectEnvironment: false` and page loads run no `icp`.

If your Vite config or another plugin sets `server.proxy["/api"]`, the plugin
leaves that entry alone, whether detection succeeds or not, and that proxy does
not follow detection.

## Tests

Vitest runs the plugin in mode `test`. There the plugin injects no environment
and never runs `icp`, whatever `injectEnvironment` says. Generation is not an
environment concern and still runs, so the modules a test imports exist. A
canister that fails to generate fails the run at startup, unless `failOnError`
is `false`: a `.did` that does not parse, a fetch that fails, a live check
(`verify: "live"`, `IC_REACTOR_VERIFY`) that fails or cannot reach the
network, an `onGenerated` that throws. For an offline test run with the live
check on, set `IC_REACTOR_VERIFY=0`. A `.did` that stops generating after
startup, in watch mode, is logged, as under `vite dev`. A Vitest run in
another mode (`--mode`, `test.mode`) keeps the dev default, and a Vitest
config that does not load the plugin generates nothing.
