/**
 * @ic-reactor/vite-plugin
 *
 * Vite plugin for an app built on a candid-core generated module.
 *
 * - Generation: at the start of a build or dev server, and when a `.did` file
 *   changes, it runs `candid-core-cli gen` in a child process (see
 *   generate.ts) and leaves candid-core's module as the generator wrote it. No
 *   wrapper files, hooks or reactors are generated.
 * - Fetching: a `didFile` that is not on disk is written from the live
 *   canister's certified `candid:service` before it is generated, when the
 *   canister names a `canisterId` (see fetch.ts), projected to its `methods`
 *   when it names some (see interface.ts). Nothing is fetched for a
 *   `didFile` that exists, unless `IC_REACTOR_FETCH` asks for it.
 * - The live check: with `verify: "live"` or `IC_REACTOR_VERIFY`, a `didFile`
 *   on disk is checked against the live canister's interface (interface.ts).
 * - Environment: under `vite dev` and `vite preview` it sets the `ic_env`
 *   cookie and proxies `/api` to the local IC network (see dev-environment.ts).
 */

import fs from "node:fs"
import path from "node:path"
import type {
  Logger,
  Plugin,
  ProxyOptions,
  ResolvedConfig,
  UserConfig,
  ViteDevServer,
} from "vite"
import { describeError } from "./describe-value.js"
import {
  createLocalEnvironment,
  icEnvMiddleware,
  type LocalEnvironment,
  type LocalEnvironmentState,
} from "./dev-environment.js"
import { fetchCandid, resolveNetwork, writeDid } from "./fetch.js"
import { cachedFoldsCase, fileIdentity, realFile } from "./file-identity.js"
import {
  GENERATE_TIMEOUT_MS,
  foldsCase,
  generate,
  moduleCollisions,
  resolveCliBin,
  type GenerateCanister,
} from "./generate.js"
import {
  check,
  describeFinding,
  firstLines,
  listMethods,
  project,
  type CliContext,
  type Projection,
} from "./interface.js"
import { readOptions, type Generated, type Refused } from "./options.js"

const PLUGIN_NAME = "ic-reactor-plugin"

/** The first line the plugin logs: where an agent reads how to use the library. */
const GUIDE_LINE =
  "ic-reactor: agent guide at node_modules/@ic-reactor/core/llms.txt"

/**
 * The options of {@link icReactor}. Every one is optional: with none, the
 * plugin generates nothing and, under `vite dev`, only injects the local IC
 * environment, for no canister of the app's.
 */
export interface IcReactorPluginOptions {
  /**
   * The app's canisters, by name: the canister's name in the `icp` project,
   * which is also the name the `ic_env` cookie carries its ID under.
   *
   * - `didFile`: the canister's Candid interface, relative to the Vite root.
   *   The plugin runs `candid-core-cli gen` on it at the start of a build or
   *   dev server and again each time the file changes, regenerating only the
   *   canisters that name the file that changed. The generator names its
   *   output after the file, so `didFile: "../backend/ledger.did"` writes `ledger.ts` (the
   *   module: it exports `actor` and the type `Actor`) and
   *   `ledger.envelope.json` into `outDir`. Canisters that name the same
   *   `didFile` and `outDir` share that one module, which is generated once.
   *   Different `.did` files that would write the same module are refused:
   *   the canister later in `canisters` fails at the start of each run,
   *   before anything is fetched, run or written for it, and a save of its
   *   file does not generate it either. Give one an `outDir` of its own. A
   *   canister without a `didFile` generates nothing and is only named in
   *   the cookie, its other options checked all the same. A run (the start of
   *   a build or dev server, or a save's regeneration) reads each `didFile`
   *   once, and takes nothing of one written before it is done with it, even
   *   saved back as it was: the methods comparison, the live check and
   *   generation read the file again, and might each read another text. The
   *   run does not generate such a canister, reports none of the failures
   *   its steps found for it, and puts back a module the generator wrote
   *   while the file was written. A build fails it, for that reason alone
   *   ("changed during the build"); under `vite dev` it is queued again, as a
   *   save is, and that run reports it.
   * - `outDir`: where the generator writes, relative to the Vite root.
   *   Default: `"src/canisters"`.
   * - `canisterId`: the canister's ID. Under `vite dev` and `vite preview` the
   *   cookie carries it, and it wins over the ID `icp` reports for the
   *   canister. With a `didFile` that is not on disk, the build first reads
   *   the canister's `candid:service` from certified state on `network` and
   *   writes it to `didFile`, which is then generated as any other and
   *   committed with the app. A `didFile` on disk is never fetched or
   *   rewritten: the build reads it with no network access. To fetch it again,
   *   run the build or dev server with `IC_REACTOR_FETCH=<name>` (several
   *   names separated by commas, or `all`). A fetch that fails (the network
   *   cannot be reached, the canister keeps its interface private or publishes
   *   none) fails the canister as a generation does, under `failOnError`.
   *   Canisters that name one file, under any path to it, share one fetch;
   *   when they name different canisters (or networks) to fetch it from, none
   *   is fetched and each fails, since whose interface it is cannot be told.
   *   Only an omitted `canisterId` is none: any other value that is not the
   *   text of a principal (`""`, `null` from a JavaScript config, or text
   *   with a letter wrong, which its checksum tells) fails the canister when
   *   the plugin is made, and is left out of the cookie with a warning.
   * - `network`: where the canister to fetch is. `"ic"`, mainnet, checked
   *   against the mainnet root key; `"local"`, icp-cli's local network on
   *   `http://127.0.0.1:8000`, whose root key is fetched from it; or
   *   `{ host }`, any other replica, whose root key is fetched only when the
   *   host is local (`localhost`, `*.localhost` or a loopback address) and is
   *   mainnet's otherwise. Only a fetch and the live check use it, but any
   *   other value fails the canister. Default: `"ic"`.
   * - `methods`: the methods of the canister the app calls. A `didFile`
   *   fetched from `canisterId` is written as the projection of the live
   *   interface to these methods and every type they reach
   *   (`candid-core-cli project`), so its module has only them. A name the
   *   live interface lacks fails the canister and writes nothing. A
   *   `didFile` on disk is not fetched again for a change of `methods`: one
   *   that lacks a name of `methods` fails the canister, and one that holds a
   *   method `methods` does not name is generated with a warning. Both say to
   *   fetch it again with `IC_REACTOR_FETCH`. Canisters that name one
   *   `didFile` to be fetched must name one list, those with no `canisterId`
   *   included (no `methods` is the whole interface): otherwise none is
   *   fetched and each fails, before any request. Only an omitted `methods`
   *   is the whole interface: any other value that is not a list of method
   *   names (`null`, `false`, `""`) fails the canister.
   * - `verify`: `"live"` checks the `didFile` on disk against the live
   *   canister's certified interface at the start of each build and dev
   *   server (`candid-core-cli check`). `IC_REACTOR_VERIFY=1` (or `true`,
   *   `all`, or canister names separated by commas) does the same for the
   *   canisters with a `canisterId`, and `IC_REACTOR_VERIFY=0` (or `false`)
   *   turns the check off for the run, `verify: "live"` included. A method
   *   of the file that the canister no longer has, whose mode changed, or
   *   whose types are no longer compatible fails the canister, under
   *   `failOnError`; a compatible change is logged as a warning. A check that
   *   cannot read the canister fails it too. Within one build or dev server,
   *   a rebuild or another Vite environment does not check a text that passed
   *   again, nor a file it just fetched, until a check or a fetch of that
   *   canister fails or reads another interface. The check of a file saved
   *   before the check was done (even saved back) counts for nothing: it
   *   records no pass, and neither sets nor clears a failed check (see
   *   `didFile` for the rest of that run). Each new build or dev server, a
   *   restart included, checks again. Any value other than `"live"`, `false`
   *   included, fails the canister, and so does `"live"` with no
   *   `canisterId`: remove `verify` for no check.
   *
   * Every value given is checked when the plugin is made, on every canister,
   * one without a `didFile` included, and whether or not a run would use it:
   * only an omitted option is one not given. A canister whose options hold a
   * value that is not one (a `didFile` or `outDir` that is not a path, any of
   * the values above, or an option whose getter throws) is refused: each run
   * fails it with every reason, under `failOnError`, before the run does
   * anything for it. Nothing is fetched, written, run or requested for it,
   * nor fetched for a `didFile` it shares with other canisters, and the
   * others run as they would. The same holds for a canister whose module a
   * canister before it writes (see `didFile`), and for one that
   * `IC_REACTOR_FETCH` or `IC_REACTOR_VERIFY` names but that has no
   * `canisterId`. A refused canister is still named in the cookie, as every
   * entry is: under `vite dev`, `icp` is asked for its ID, since the app may
   * still call it. Messages quote each value as it was given, whatever its
   * kind (a bigint, a symbol, an object that holds itself).
   *
   * The generator is the `@candid-core/cli` the app has installed, run as a
   * child process so that a failure on one `.did` stops that process and not
   * the dev server.
   */
  canisters?: Record<
    string,
    {
      didFile?: string
      outDir?: string
      canisterId?: string
      network?: "ic" | "local" | { host: string }
      methods?: readonly string[]
      verify?: "live"
    }
  >
  /**
   * Inject the local IC environment under `vite dev` and `vite preview`: set
   * the `ic_env` cookie on each response and proxy `/api` to the network the
   * `icp` CLI reports.
   *
   * Until `icp` reports a network and every configured canister has an ID
   * (a configured `canisterId` counts), each page load asks `icp` again, so a
   * deploy after the server started needs only a reload. Once detection is
   * complete, page loads run no `icp` command, and a redeploy into a fresh
   * network needs a restart. An `/api` proxy that the Vite config or another
   * plugin sets is left alone.
   *
   * Never injected in mode `"test"` (Vitest's), where `icp` is not run at all.
   *
   * Default: true. Any value given other than `true` or `false` (`null`,
   * `0`, `"false"`) throws when the config loads.
   */
  injectEnvironment?: boolean
  /**
   * Abort the Vite run when a canister fails to generate.
   *
   * Default: `true` under `vite build`, `false` under `vite dev`. A build that
   * silently ships the bindings left over from the last successful run is
   * worse than no build at all, while a dev server has to survive the broken
   * intermediate states of a `.did` file being edited: there the failure is
   * logged and shown in the browser's error overlay, and the server keeps
   * serving. Any value given other than `true` or `false` (`null`, `0`,
   * `"false"`) throws when the config loads.
   */
  failOnError?: boolean
}

/** The environment variable that asks for a `didFile` to be fetched again. */
const FETCH_VARIABLE = "IC_REACTOR_FETCH"

/** The environment variable that asks for the live check. */
const VERIFY_VARIABLE = "IC_REACTOR_VERIFY"

/** The values of `IC_REACTOR_VERIFY` that check every canister. */
const VERIFY_ALL = ["1", "true", "all"]

/** The values of `IC_REACTOR_VERIFY` that check none, over `verify`. */
const VERIFY_OFF = ["0", "false"]

/** `methods` once each, in name order (code point), as `project` lists them. */
function methodList(methods: readonly string[]): string[] {
  return [...new Set(methods)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/** `a, b and 3 more`: names as messages list them, at most `max` of them. */
function listNames(names: readonly string[], max = 30): string {
  if (names.length === 0) return "none"
  const shown = names.slice(0, max).join(", ")
  return names.length > max ? `${shown} and ${names.length - max} more` : shown
}

/** The names an environment variable lists, and whether it says `all`. */
function namesIn(
  variable: string,
  all: string[]
): {
  names: string[]
  all: boolean
} {
  const names = (process.env[variable] ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
  return {
    names,
    all: names.some((name) => all.includes(name)),
  }
}

/** A canister that did not generate, and why. */
interface Failure {
  canister: Generated | Refused
  message: string
}

/**
 * What `IC_REACTOR_FETCH` and `IC_REACTOR_VERIFY` ask of one run, read once
 * when its steps start.
 */
interface Requests {
  /** Whether `IC_REACTOR_FETCH` asks for the canister's `didFile` again. */
  fetches: (canister: { name: string }) => boolean
  /**
   * Whether the canister's live check runs: by `verify: "live"`, or by
   * `IC_REACTOR_VERIFY`. `"off"` when `IC_REACTOR_VERIFY` turns it off.
   */
  checks: ((canister: Generated) => boolean) | "off"
  /** The canisters a variable names that cannot do what it asks. */
  failures: Failure[]
}

/**
 * What one build or one dev server works with, from the moment Vite resolves
 * its config (`configResolved`) to its close (`closeBundle`). A dev server
 * restarted with the same plugin object (`server.restart()`, or `r` and
 * Enter, of an inline config) is a new lifetime. Vite resolves the new
 * config, and may start the new server, before it closes the old one: each
 * lifetime holds the state of its own runs, so that the old server's close
 * stops only its own and leaves the new server's alone.
 */
interface Lifetime {
  command: ResolvedConfig["command"]
  /** The dev server, once `configureServer` hands it over. */
  server: ViteDevServer | null
  /**
   * Aborted when this build or dev server ends (`closeBundle`), which kills
   * the generator processes it runs and drops its runs still queued. A
   * fresh controller follows each abort: Vite 6 and later run the next
   * environment's build in the same lifetime, and `vite build --watch` its
   * next rebuild.
   */
  stopper: AbortController
  /** The `.did` files waiting for a run that has not started, by `identify`. */
  queued: Set<string>
  /**
   * The text this plugin last wrote to each `.did` it fetched under this dev
   * server, by `identify`, until the server's watcher reports that write.
   */
  justFetched: Map<string, string>
  /**
   * The text of each `didFile` the live check passed, by canister name. The
   * next `buildStart` of the lifetime (a rebuild of `vite build --watch`, or
   * another Vite environment's) checks it again only when the text changed.
   * A new lifetime starts with none: Vite resolves the config again for each
   * build and each dev server, a restart (`r` and Enter, or
   * `server.restart()`) included, so a restart checks every canister again,
   * and finds a canister that changed since.
   *
   * A file the lifetime fetched is the live interface, and passes as
   * fetched. A check that failed, or could not be made, and a fetch that
   * failed, drop the canister's entry: a text that passed before is checked
   * again, so restoring it cannot stand in for a check that passes now.
   *
   * What passes is the text that was checked: the text the run read (see
   * {@link Run}), and only if the file still holds it, unwritten, once the
   * check is done. A file written since the run read it (even saved back) is
   * not recorded, and its next `buildStart` checks it again. A fetched file
   * passes as the text the fetch wrote, not as the file read again.
   */
  verified: Map<string, string>
  /**
   * The failure of each canister whose last live check failed (or could not
   * be made), by canister name. Only a `buildStart` checks: a save under
   * `vite dev` makes no request, so it cannot tell that the file matches the
   * canister again, and it leaves the canister failed, in the log and the
   * overlay, and not generated, whatever the save changed.
   *
   * A new lifetime starts with a copy of the failures of the one before it.
   * Its `buildStart` (a restart's, which keeps the plugin object for an inline
   * config) clears one when it checks the canister and the check passes, when
   * it fetched the file, or when the check is off for it
   * (`IC_REACTOR_VERIFY=0`); a canister it fails before its check keeps the
   * failure. A pass from before the failure cannot clear it: the failure
   * dropped it, and a new lifetime starts with none. What the old lifetime
   * finds after the copy is its own.
   *
   * Only a check of the text the run read counts, failed or passed: one
   * whose file was written before the check was done (even saved back) may
   * have read another text, so it neither sets nor clears a failure here (see
   * `verifyLive`'s `unsure`). A check that read the run's text keeps its
   * verdict when the file is written after it, as for a save made just after
   * the run.
   */
  liveFailures: Map<string, Failure>
  /**
   * The failures not yet fixed, by canister name, which this dev server shows
   * in its overlay and hands each browser that connects. A new lifetime starts
   * with a copy of the one before it: a restart leaves the overlay as it was
   * until one of its own runs reports a canister, as a run that took nothing
   * of a file written while it read it does not (see `writtenSince`).
   */
  unfixed: Map<string, Failure>
}

/** A line to log, held until it is known to be of the text a run read. */
interface Note {
  level: "info" | "warn"
  message: string
}

/** A `.did` as one read found it: its text, and a stamp of the write that made it. */
interface Snapshot {
  text: string
  stamp: string
}

/**
 * One run's reading of the `didFile`s it works on. A run is a `buildStart`,
 * from the end of its fetch, or the regeneration a save starts. It reads each
 * file once, when its steps start, and takes the file's text from that
 * reading wherever it compares or records one: the methods it listed, the text
 * the live check passed, the text it generated. The steps that run
 * candid-core-cli (the methods listing, the live check, generation) read the
 * file themselves, later, so what one of them found is of the run's text only
 * while the file is still as the run read it.
 */
interface Run {
  /** The text the run read, `undefined` when the file was missing. */
  textOf(canister: Generated): string | undefined
  /**
   * Whether the file is still as the run read it: the same text and the same
   * stamp, or still missing.
   */
  asRead(canister: Generated): boolean
}

type PluginLog = Pick<Logger, "info" | "warn" | "error">

/** What the hooks log through before Vite hands over its logger. */
const consoleLog: PluginLog = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(message),
  error: (message) => console.error(message),
}

/**
 * The Vite plugin for an app built on a candid-core generated module.
 *
 * It does three things:
 *
 * - **Fetches a missing `.did`.** A canister with a `canisterId` whose
 *   `didFile` is not on disk has it written from the live canister's
 *   certified `candid:service` first. A `didFile` on disk costs no network
 *   request. See {@link IcReactorPluginOptions.canisters}.
 * - **Generates the module.** When a build or the dev server starts, and
 *   when a configured `.did` changes, it runs the app's `candid-core-cli gen`
 *   on each `didFile` and leaves the module as the generator wrote it: no
 *   wrapper files, hooks or reactors. The generator is WebAssembly, so it runs
 *   in a child process (the running Node binary on the CLI's bin script, never
 *   through a shell, killed after 60 seconds). A trap, a crash or a hang on a
 *   bad `.did` then ends that process and not the dev server: under
 *   `vite build` it fails the build with the CLI's own message, and under
 *   `vite dev` it is logged and shown in the error overlay while the server
 *   keeps serving. See {@link IcReactorPluginOptions.failOnError}.
 * - **Injects the local IC environment.** Under `vite dev` and `vite preview`
 *   it sets the `ic_env` cookie, which carries the replica's root key and the
 *   canister IDs, and proxies `/api` to the local replica, so the app needs no
 *   configuration to find them. It asks the `icp` CLI for both, and is off in
 *   mode `"test"` (Vitest's), where `icp` is never run.
 *
 * The first thing it logs names where an agent reads how to use the library:
 * `ic-reactor: agent guide at node_modules/@ic-reactor/core/llms.txt`.
 *
 * The plugin needs `@candid-core/cli`, at the exact release that pairs with
 * the `@candid-core/schema` the generated modules import, installed in the
 * app. It imports neither, and no `@ic-reactor` runtime package. To fetch a
 * missing `didFile` from a live canister it imports `@icp-sdk/core`, an
 * optional peer that every app on `@ic-reactor/core` has installed; an app
 * whose `.did` files are all on disk never loads it.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * export default defineConfig({
 *   plugins: [
 *     icReactor({
 *       canisters: {
 *         backend: { didFile: "../backend/backend.did" },
 *         // Written from mainnet's ledger when missing; commit it.
 *         ledger: {
 *           didFile: "did/icp_ledger.did",
 *           canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
 *         },
 *       },
 *     }),
 *   ],
 * })
 * ```
 */
export function icReactor(options: IcReactorPluginOptions = {}): Plugin {
  // Every option read once, and every value checked, before anything else
  // (see options.ts). An option of the whole plugin that is not one throws
  // here, so that the config does not load.
  const {
    injectEnvironment,
    failOnError,
    names,
    configuredCanisterIds,
    notCanisterIds,
    generated,
    refused,
  } = readOptions(options)

  /** Each refused canister's failure, which every run reports first. */
  const refusals: Failure[] = refused.map((canister) => ({
    canister,
    message: canister.problem,
  }))

  /** Every canister with a `didFile`, refused or not: what a run reports on. */
  const configured: Array<Generated | Refused> = [...generated, ...refused]

  // Vite resolves relative project paths against the resolved `config.root`,
  // which only equals the process cwd when vite happens to be started from the
  // project directory, not for `root: "frontend"` and not when the root is
  // passed positionally (`vite build apps/web`). `configResolved` overwrites
  // this before any hook that resolves a path runs; the cwd is only Vite's own
  // default root. A restart of an inline config resolves the same root.
  let projectRoot = process.cwd()

  let log: PluginLog = consoleLog
  let announced = false

  /**
   * The local IC environment `vite dev` and `vite preview` inject. The
   * `config` hook creates it when `injectEnvironment` is on, for the server
   * whose config it resolves.
   */
  let localEnvironment: LocalEnvironment | undefined

  // ── Lifetimes ───────────────────────────────────────────────────────────

  /**
   * A new lifetime (see {@link Lifetime}), after `previous`: its stopper, its
   * queue, the fetched writes its watcher is to skip and its passes its own,
   * and copies of the failed live checks and the overlay of the one before,
   * which only its own runs change.
   */
  const lifetimeAfter = (
    previous: Lifetime | undefined,
    command: ResolvedConfig["command"]
  ): Lifetime => ({
    command,
    server: null,
    stopper: new AbortController(),
    queued: new Set(),
    justFetched: new Map(),
    verified: new Map(),
    liveFailures: new Map(previous?.liveFailures),
    unfixed: new Map(previous?.unfixed),
  })

  /**
   * The newest lifetime: the one `configResolved` made last. A hook that runs
   * before any `configResolved` runs in one of its own, as a build, the safer
   * default: `vite build` and `vite dev` want opposite failure behaviour.
   */
  let current = lifetimeAfter(undefined, "build")

  /** The lifetime of each config `configResolved` was handed. */
  const byConfig = new WeakMap<object, Lifetime>()

  /**
   * The lifetimes that started (`configureServer` or `buildStart`) and have
   * not closed, oldest first.
   */
  const open = new Set<Lifetime>()

  /**
   * The lifetime a hook runs in, when its context names one: Vite 6 and
   * later hand each hook the environment it runs for, and the environment
   * its config, which is the one `configResolved` was handed. Vite 4 and 5
   * have no environments. Never throws.
   */
  const lifetimeOf = (context: unknown): Lifetime | undefined => {
    try {
      const environment = (context as { environment?: unknown } | undefined)
        ?.environment as { getTopLevelConfig?: () => unknown } | undefined
      const config = environment?.getTopLevelConfig?.()
      return typeof config === "object" && config !== null
        ? byConfig.get(config)
        : undefined
    } catch {
      return undefined
    }
  }

  // ── Generation ──────────────────────────────────────────────────────────

  const didPath = (canister: { didFile: string }) =>
    path.resolve(projectRoot, canister.didFile)
  const relativeToRoot = (file: string) =>
    path.relative(projectRoot, file) || "."

  /**
   * The file a path names, as a key: equal for every spelling of one file,
   * through a symlinked directory or, where the filesystem ignores case, in
   * another case. See file-identity.ts. Fetches, the files fetched and the
   * watcher's events are all matched by it, never by the path as written.
   */
  const foldsCaseOnce = cachedFoldsCase(foldsCase)
  const identify = (file: string) => fileIdentity(file, foldsCaseOnce)

  /**
   * The `.did` text each canister last generated from. A rebuild that finds
   * the text unchanged skips the canister, which is every rebuild of
   * `vite build --watch` that was not caused by a `.did`, and the second
   * `buildStart` Vite 6 and later run for another environment. It is the
   * plugin's, not a lifetime's: it says what is on disk, which a restart
   * keeps.
   */
  const generatedFrom = new Map<string, string>()

  // Generation runs one job after another, whichever lifetime asked for it.
  // Two `buildStart`s (one per Vite 6+ environment), a save during a run, or
  // the runs of a restarted server and of the old one before it closes,
  // would otherwise start two generator processes that write the same files.
  let tail: Promise<unknown> = Promise.resolve()
  const serially = <T>(job: () => Promise<T>): Promise<T> => {
    const result = tail.then(job)
    tail = result.catch(() => undefined)
    return result
  }

  /**
   * The `.did` of `canister` as it is now: its text, and a stamp of the write
   * that made it, or `undefined` when it cannot be read. Two snapshots with
   * one text and one stamp are of a file nobody wrote between them: the text
   * alone cannot tell a file saved and saved back.
   */
  const snapshot = (canister: Generated): Snapshot | undefined => {
    try {
      const file = didPath(canister)
      const { mtimeMs, ctimeMs, size, ino } = fs.statSync(file)
      return {
        stamp: `${mtimeMs}:${ctimeMs}:${size}:${ino}`,
        text: fs.readFileSync(file, "utf-8"),
      }
    } catch {
      return undefined
    }
  }

  /**
   * Read the `didFile` of each of `canisters` once, for one run. See
   * {@link Run}.
   */
  const startRun = (canisters: Generated[]): Run => {
    const keys = new Map<Generated, string>()
    const read = new Map<string, Snapshot | undefined>()
    for (const canister of canisters) {
      const key = identify(didPath(canister))
      keys.set(canister, key)
      if (!read.has(key)) read.set(key, snapshot(canister))
    }
    const first = (canister: Generated) =>
      read.get(keys.get(canister) ?? identify(didPath(canister)))
    return {
      textOf: (canister) => first(canister)?.text,
      asRead: (canister) => {
        const was = first(canister)
        const now = snapshot(canister)
        return was === undefined || now === undefined
          ? was === now
          : now.text === was.text && now.stamp === was.stamp
      },
    }
  }

  /**
   * The canisters of `canisters` whose `didFile` was written since `run`
   * read it: what the run's steps compared, checked and generated of it may
   * not be one text, so the run takes none of it. It reports neither the
   * failures its steps found for such a canister nor a success: a build fails
   * it as changed during the build, and a dev server queues it again. Asked
   * when the run is done with the files, after generation, the last step
   * that reads them.
   */
  const writtenSince = (run: Run, canisters: Generated[]): Generated[] =>
    canisters.filter((canister) => !run.asRead(canister))

  /** `canister` as the generator is given it: its paths resolved against the root. */
  const generationOf = (canister: Generated): GenerateCanister => ({
    name: canister.name,
    didFile: didPath(canister),
    outDir: path.resolve(projectRoot, canister.outDir),
  })

  /**
   * Each canister whose module a canister before it in the options writes,
   * with why it cannot be generated. The generator names a module after its
   * `.did`, so `a/ping.did` and `b/ping.did` in one `outDir` write one
   * `ping.ts`, and so do `Ping.did` and `ping.did` where the filesystem of the
   * `outDir` ignores case: the first canister keeps the module.
   *
   * Asked at the start of each run, of every canister with valid options, so
   * that the answer is the same whichever canisters the run generates: it
   * depends on the Vite root and on the filesystem, so it cannot be told when
   * the plugin is made. Such a canister fails as a refused one does, before
   * the run fetches, writes, runs or requests anything for it, and a save of
   * its file generates nothing for it. `generate` refuses one among the
   * canisters of one run too, which is the check of last resort. Never throws.
   */
  const collisions = (): Map<Generated, string> => {
    const byName = moduleCollisions(generated.map(generationOf), projectRoot)
    return new Map(
      generated.flatMap((canister) => {
        const failure = byName.get(canister.name)
        return failure === undefined ? [] : [[canister, failure] as const]
      })
    )
  }

  /** The files `gen` writes for `canister`: its module and its envelope. */
  const outputsOf = (canister: Generated): string[] => {
    const outDir = path.resolve(projectRoot, canister.outDir)
    const stem = path.basename(didPath(canister), ".did")
    return [
      path.join(outDir, `${stem}.ts`),
      path.join(outDir, `${stem}.envelope.json`),
    ]
  }

  const readBytes = (file: string): Buffer | undefined => {
    try {
      return fs.readFileSync(file)
    } catch {
      return undefined
    }
  }

  /**
   * Put `files` back as `before` holds them: rewritten, or removed where
   * there was none. A file that holds what it held is not touched.
   */
  const putBack = (
    before: Map<string, Buffer | undefined>,
    files: string[]
  ): void => {
    for (const file of files) {
      const was = before.get(file)
      const now = readBytes(file)
      if (was === undefined ? now === undefined : now?.equals(was)) continue
      if (was === undefined) fs.rmSync(file, { force: true })
      else fs.writeFileSync(file, was)
    }
  }

  /**
   * Generate `wanted`, in one generator process for each output directory, and
   * report what the generator said. Never rejects: an unexpected error fails
   * the canisters, since a rejection from a watcher callback could end the dev
   * server.
   *
   * Resolves `undefined` when `signal` was aborted before it finished: the
   * server it belonged to is gone, so nothing is recorded, logged or shown.
   *
   * Only a canister whose file is still as `run` read it is generated, and its
   * module is taken only if the file is still so once the generator read it.
   * One written while the generator ran is neither recorded nor reported
   * here, and its module and envelope are put back as they were: the run
   * takes nothing of it (see `writtenSince`).
   *
   * @param force - Generate even a canister whose `.did` text is unchanged.
   * @param signal - The signal of the run's lifetime when the run was asked
   * for: its server's close aborts it.
   */
  const generateNow = async (
    wanted: Generated[],
    force: boolean,
    run: Run,
    signal: AbortSignal
  ): Promise<Failure[] | undefined> => {
    if (signal.aborted) return undefined
    try {
      const ready = wanted.filter((canister) => run.asRead(canister))
      const stale = ready.filter((canister) => {
        const source = run.textOf(canister)
        return (
          force ||
          source === undefined ||
          generatedFrom.get(canister.name) !== source
        )
      })
      if (stale.length === 0) return []

      let cli: string
      try {
        cli = resolveCliBin(projectRoot)
      } catch (error) {
        return stale.map((canister) => ({ canister, message: describe(error) }))
      }

      // Each module and envelope as it is before the generator writes it.
      const before = new Map<string, Buffer | undefined>()
      for (const canister of stale) {
        for (const file of outputsOf(canister)) {
          if (!before.has(file)) before.set(file, readBytes(file))
        }
      }

      const result = await generate({
        cli,
        root: projectRoot,
        timeoutMs: GENERATE_TIMEOUT_MS,
        signal,
        // Shown as it arrives: a run that takes long, or is killed at the
        // timeout, would otherwise say nothing until it is over.
        onStderr: (line, didFiles) => {
          if (signal.aborted) return
          log.warn(
            `ic-reactor: candid-core-cli (${didFiles.map((file) => relativeToRoot(file)).join(", ")}): ${line}`
          )
        },
        canisters: stale.map(generationOf),
      })

      if (signal.aborted) return undefined

      const failures: Failure[] = []
      for (const outcome of result.outcomes) {
        // The names of one outcome share a `.did`, so they succeed or fail
        // together and are reported once.
        const members = stale.filter(({ name }) => outcome.names.includes(name))
        // They share one file: written while the generator ran, it may have
        // been read as another text than the run's.
        if (members.length > 0 && !run.asRead(members[0])) {
          putBack(before, outputsOf(members[0]))
          continue
        }
        const names = members.map(({ name }) => name).join(", ")
        if (outcome.status === "failed") {
          for (const canister of members) {
            generatedFrom.delete(canister.name)
            failures.push({ canister, message: outcome.failure ?? "" })
          }
          continue
        }
        for (const canister of members) {
          const source = run.textOf(canister)
          if (source !== undefined) generatedFrom.set(canister.name, source)
        }
        if (outcome.status === "written" && outcome.module) {
          log.info(
            `ic-reactor: generated ${names} into ${relativeToRoot(outcome.module)}`
          )
        }
        for (const { kind, name: what, reason, via } of outcome.omitted) {
          log.warn(
            `ic-reactor: ${names}: omitted ${kind} ${what} (${reason}${via ? ` via ${via}` : ""})`
          )
        }
      }
      return failures
    } catch (error) {
      if (signal.aborted) return undefined
      return wanted.map((canister) => ({ canister, message: describe(error) }))
    }
  }

  /**
   * The `.did` files `IC_REACTOR_FETCH` has had fetched again, by
   * `identify`. A request is served once in the life of the plugin: the second
   * `buildStart` of Vite 6 and later, and each rebuild of
   * `vite build --watch`, read the file it wrote. A file is recorded only once
   * its fetch succeeded and the file on disk holds what was fetched, so a
   * fetch or a write that failed is tried again on the next `buildStart`.
   */
  const refetched = new Set<string>()

  /** Whether `canister` gave a `canisterId`, of any value. */
  const givesCanisterId = (canister: Generated | Refused): boolean =>
    "problem" in canister
      ? canister.givesCanisterId
      : canister.canisterId !== undefined

  /**
   * Why the canisters that name one file (`members`) cannot have it fetched,
   * or `undefined` when they can. Asked only when the file is to be fetched,
   * and before any request: a file on disk that nobody asked to fetch again
   * is read by them all, whatever their `canisterId`s and `methods` (two
   * ICRC-1 ledgers on one `icrc1.did`), and `compareMethods` compares it with
   * the list of each.
   *
   * In this order: a member cannot be run (`blocked`: its options hold a
   * value that is not one, or a variable asks of it what it cannot do), so
   * which canister or which list the file is for cannot be told either; the
   * members that name a `canisterId` name different canisters, or one
   * canister on different networks, so whose interface the file is cannot be
   * told; or the members name different projections (no `methods` is the
   * whole interface), so which one the file holds cannot be told. Every
   * member generates from the one file, so a member with no `canisterId`
   * counts as much as the one it is fetched for.
   */
  const conflictOf = (
    members: Array<Generated | Refused>,
    blocked: Map<Generated | Refused, string>
  ): string | undefined => {
    const spellings = [
      ...new Set(
        members.map((canister) =>
          relativeToRoot(didPath(canister as Generated))
        )
      ),
    ]
    const file =
      spellings.length === 1
        ? spellings[0]
        : `${spellings.join(" and ")}, which are one file,`
    const names = quoteNames(members.map(({ name }) => name))

    // Refused before any request, as the member is.
    const reasons = members.flatMap((canister) => {
      const reason = blocked.get(canister)
      return reason === undefined ? [] : [{ canister, reason }]
    })
    if (reasons.length > 0) {
      if (members.length === 1) return reasons[0].reason
      return (
        `${names} name ${file}, which is not fetched, since ` +
        `${quoteNames(reasons.map(({ canister }) => canister.name))} cannot be generated ` +
        `(${reasons.map(({ canister, reason }) => `${canister.name}: ${reason}`).join("; ")}). ` +
        `Correct ${reasons.length === 1 ? "it" : "them"} and build again.`
      )
    }
    // Every member's options are values: refused ones are blocked.
    const usable = members as Generated[]
    const fetchable = usable.filter(
      ({ canisterId }) => canisterId !== undefined
    )

    const sourceOf = ({ canisterId, network }: Generated) => {
      // Every network given was checked when the plugin was made.
      const resolved = resolveNetwork(network)
      return typeof resolved === "string"
        ? { key: `${canisterId}\0${resolved}`, label: resolved }
        : {
            key: `${canisterId}\0${resolved.host}\0${resolved.fetchRootKey}`,
            label: resolved.label,
          }
    }
    const sources = new Set(fetchable.map((canister) => sourceOf(canister).key))
    if (sources.size > 1) {
      const fetches = fetchable
        .map(
          (canister) =>
            `${canister.name}: ${canister.canisterId} on ${sourceOf(canister).label}`
        )
        .join("; ")
      return (
        `${names} name ${file} but not one canister to fetch it from ` +
        `(${fetches}): which one's interface the file holds cannot be told, so it is not fetched. ` +
        `Give each canister a didFile of its own, or write ${spellings[0]} yourself and the plugin reads it instead of fetching.`
      )
    }

    // One file holds one projection, read by every member: the lists of the
    // members with no canisterId count too.
    const projectionOf = ({ methods }: Generated) =>
      methods !== undefined
        ? {
            key: JSON.stringify(methodList(methods)),
            label: listNames(methodList(methods)),
          }
        : { key: "", label: "no methods, the whole interface" }
    const projections = new Set(
      usable.map((canister) => projectionOf(canister).key)
    )
    if (projections.size < 2) return undefined
    const lists = usable
      .map((canister) => `${canister.name}: ${projectionOf(canister).label}`)
      .join("; ")
    return (
      `${names} name ${file} but not one list of methods to project it to (${lists}): ` +
      `the file holds one projection, which every one of them generates from, so it is not fetched. ` +
      `Give them one list, or give each list a didFile of its own.`
    )
  }

  /** `failures` with each canister once, for the first reason it failed. */
  const dedupe = (failures: Failure[]): Failure[] =>
    failures.filter(
      (failure, index) =>
        failures.findIndex(({ canister }) => canister === failure.canister) ===
        index
    )

  /**
   * Write each `didFile` that a canister names a `canisterId` for and that is
   * not on disk, from the live canister's certified `candid:service`, and
   * each one `IC_REACTOR_FETCH` names (`fetches`). Canisters that name one
   * `.did`, under any spelling of it, share one fetch when they name one
   * canister on one network and one list of `methods`, and fail with no
   * request when they name more, or when one of them is `blocked` (see
   * `conflictOf`). A `didFile` on disk that nobody asked to fetch again costs
   * no network request, and `@icp-sdk/core` is not even loaded.
   *
   * A fetch that failed is not remembered: the next `buildStart` (a rebuild
   * of `vite build --watch`, or another Vite environment's) tries it again,
   * so a network that comes back is used without restarting Vite.
   *
   * A canister with `methods` has the projection of the live interface to
   * them written instead of the whole interface. A name of `methods` that the
   * interface lacks fails its canisters, and nothing is written.
   *
   * A file written under a dev server is recorded in the `lifetime`'s
   * `justFetched`, so that its watcher's event for the write starts no second
   * run: the run that fetched the file generates it.
   *
   * Resolves with the canisters that cannot be generated, since their fetch
   * failed or was refused, and the files (by `identify`) this run wrote or
   * found matching the canister, each with the text it fetched, or
   * `undefined` when `signal` was aborted first. Never rejects.
   */
  const fetchMissing = async (
    lifetime: Lifetime,
    blocked: Map<Generated | Refused, string>,
    fetches: Requests["fetches"],
    signal: AbortSignal
  ): Promise<
    { failures: Failure[]; fetched: Map<string, string> } | undefined
  > => {
    if (signal.aborted) return undefined
    const failures: Failure[] = []
    const fetched = new Map<string, string>()
    try {
      // By the file, not by its spelling: two spellings of one file (through
      // a symlinked directory, or in another case where the filesystem
      // ignores case) are one fetch and one write. Fetched once for each
      // spelling, the last write would win, and every canister would generate
      // from the interface of whichever canister was fetched last. A refused
      // canister that names a path counts: it shares the file.
      const byFile = new Map<string, Array<Generated | Refused>>()
      for (const canister of configured) {
        if (canister.didFile === undefined) continue
        const key = identify(didPath(canister as Generated))
        byFile.set(key, [...(byFile.get(key) ?? []), canister])
      }

      const jobs = [...byFile].flatMap(([key, members]) => {
        // Named in messages by the first spelling.
        const file = didPath(members[0] as Generated)
        // Any canisterId given makes the file one to fetch, a refused
        // canister's included: `conflictOf` then refuses the fetch.
        const fetchable = members.filter(givesCanisterId)
        const again = refetched.has(key)
          ? undefined
          : fetchable.find((canister) => fetches(canister))
        const source = again ?? (fs.existsSync(file) ? undefined : fetchable[0])
        if (!source) return []
        const conflict = conflictOf(members, blocked)
        if (conflict) {
          for (const canister of members) {
            failures.push({ canister, message: conflict })
          }
          return []
        }
        // Not blocked, so not refused.
        return [
          { key, file, members, source: source as Generated, again: !!again },
        ]
      })
      if (jobs.length === 0) return { failures: dedupe(failures), fetched }

      const results = await Promise.all(
        jobs.map(async (job) => ({
          ...job,
          result: await fetchProjected(job.source, job.file, signal),
        }))
      )
      if (signal.aborted) return undefined

      for (const { key, file, members, again, result } of results) {
        if (!result.ok) {
          for (const canister of members) {
            failures.push({ canister, message: result.message })
          }
          continue
        }
        const { from } = result
        // Read and written through every symlink: a write to a symlinked
        // spelling would replace the symlink with a file of its own, and leave
        // the target, which the other spellings read, as it was.
        const target = realFile(file)
        let before: string | undefined
        try {
          before = fs.readFileSync(target, "utf-8")
        } catch {
          before = undefined
        }
        if (before === result.did) {
          log.info(`ic-reactor: ${relativeToRoot(file)} matches ${from}`)
          if (again) refetched.add(key)
          fetched.set(key, result.did)
          continue
        }
        // Only a dev server's watcher reports the write and clears the entry.
        if (lifetime.server) lifetime.justFetched.set(key, result.did)
        try {
          writeDid(target, result.did)
        } catch (writeError) {
          // Only the canisters of this file fail: the others generate.
          lifetime.justFetched.delete(key)
          for (const canister of members) {
            failures.push({
              canister,
              message:
                `fetched ${from}, but could not write it to ${relativeToRoot(file)}: ${describe(writeError)}. ` +
                `Make its directory writable and build again.`,
            })
          }
          continue
        }
        // Recorded only now: a fetch or a write that failed is tried again.
        if (again) refetched.add(key)
        fetched.set(key, result.did)
        log.info(
          `ic-reactor: ${before === undefined ? "wrote" : "rewrote"} ${relativeToRoot(file)} from ${from} ` +
            `(${Buffer.byteLength(result.did)} bytes): commit it with the app`
        )
      }
      return { failures: dedupe(failures), fetched }
    } catch (error) {
      if (signal.aborted) return undefined
      const failed = new Set(failures.map(({ canister }) => canister))
      return {
        failures: [
          ...failures,
          ...generated
            .filter(
              (canister) => !failed.has(canister) && !blocked.has(canister)
            )
            .map((canister) => ({ canister, message: describe(error) })),
        ],
        fetched,
      }
    }
  }

  /** The CLI's context for `project` and `check`, or why there is none. */
  const cliContext = (signal: AbortSignal): CliContext | string => {
    try {
      return { cli: resolveCliBin(projectRoot), root: projectRoot, signal }
    } catch (error) {
      return describe(error)
    }
  }

  /**
   * The certified `candid:service` of `source`'s canister, projected to its
   * `methods` when it names some, with how the log names where it came from.
   * Never rejects.
   */
  const fetchProjected = async (
    source: Generated,
    file: string,
    signal: AbortSignal
  ): Promise<
    { ok: true; did: string; from: string } | { ok: false; message: string }
  > => {
    const didFile = relativeToRoot(file)
    const result = await fetchCandid({
      canisterId: source.canisterId as string,
      network: source.network,
      didFile,
      signal,
    })
    if (!result.ok) return result
    const where = `${source.canisterId} on ${result.network}`
    const from = `the certified candid:service of ${where}`
    if (source.methods === undefined) return { ok: true, did: result.did, from }

    const context = cliContext(signal)
    if (typeof context === "string") {
      return {
        ok: false,
        message: `fetched ${from}, but cannot project it to methods: ${context}`,
      }
    }
    const asked = methodList(source.methods)
    const projection = await project(context, { text: result.did }, asked)
    if (projection.ok) {
      return {
        ok: true,
        did: projection.did,
        from: `${from}, projected to ${listNames(projection.methods)}`,
      }
    }
    return {
      ok: false,
      message: describeProjectionFailure(projection, asked, where, didFile),
    }
  }

  /** Why the live interface of `where` could not be projected to `asked`. */
  const describeProjectionFailure = (
    projection: Extract<Projection, { ok: false }>,
    asked: string[],
    where: string,
    didFile: string
  ): string => {
    const [first] = projection.diagnostics ?? []
    if (first?.code === "unknown_method" && Array.isArray(first.notes)) {
      const has = first.notes.map(String)
      const lacking = asked.filter((name) => !has.includes(name))
      return (
        `methods names ${listNames(lacking)}, which the live interface of ${where} does not have, ` +
        `so ${didFile} is not written. It has ${has.length} method${has.length === 1 ? "" : "s"}: ` +
        `${listNames(has)}. Correct methods and build again.`
      )
    }
    return (
      `the certified candid:service of ${where} could not be projected to methods, ` +
      `so ${didFile} is not written: ${projection.message}`
    )
  }

  /**
   * The outcome of comparing each `methods` canister's `didFile` with its
   * `methods`, by canister name, for the text and the list it compared: the
   * file is compared again only when either changes, and a mismatch that is
   * only a warning is logged once.
   */
  const comparedMethods = new Map<
    string,
    { text: string; methods: string; failure?: string }
  >()

  /**
   * Compare the `didFile` of each canister of `wanted` that names `methods`
   * with them, with no network access: a file that lacks a name of `methods`
   * fails the canister, since its module would lack the method, and a file
   * that holds a method `methods` does not name is generated, with a warning.
   * Either way the file was written for other methods, and the message says to
   * fetch it again. A file is never fetched for it: only `IC_REACTOR_FETCH`
   * fetches a file on disk. A file this run just fetched is compared too: a
   * canister that shares it may name another list.
   *
   * A file whose methods cannot be listed (it does not compile, or the CLI
   * failed) fails the canister: a comparison that did not run must not pass
   * for one that did. Resolves with the canisters that cannot be generated,
   * or `undefined` when `signal` was aborted first. Never rejects.
   *
   * The comparison is of the text `run` read, and only when the file is still
   * as the run read it once the CLI listed it: the CLI reads the file itself,
   * so after a save before or while it ran, what it listed may be another
   * text's. Such a listing is neither recorded, nor reported, nor warned
   * about. The canister fails here only so that no later step of the run
   * (the live check, generation) reads the file: the end of the run takes
   * nothing of it, that failure included (see `writtenSince`).
   */
  const compareMethods = async (
    wanted: Generated[],
    run: Run,
    signal: AbortSignal
  ): Promise<Failure[] | undefined> => {
    const failures: Failure[] = []
    const jobs = wanted.flatMap((canister) => {
      // A list given that is not one refused the canister when the plugin
      // was made (options.ts): only an omitted list is the whole interface.
      if (canister.methods === undefined) return []
      const text = run.textOf(canister)
      // A missing file is the generator's to report.
      if (text === undefined) return []
      const methods = methodList(canister.methods)
      const key = JSON.stringify(methods)
      const known = comparedMethods.get(canister.name)
      if (known && known.text === text && known.methods === key) {
        if (known.failure) failures.push({ canister, message: known.failure })
        return []
      }
      return [{ canister, text, methods, key }]
    })
    if (jobs.length === 0) return failures

    const context = cliContext(signal)
    // No CLI: the generator's run says so for every canister.
    if (typeof context === "string") return failures
    const results = await Promise.all(
      jobs.map(async (job) => ({
        ...job,
        listed: await listMethods(context, { file: didPath(job.canister) }),
      }))
    )
    if (signal.aborted) return undefined

    for (const { canister, text, methods, key, listed } of results) {
      const file = relativeToRoot(didPath(canister))
      const ofText = run.asRead(canister)
      if (!ofText) {
        failures.push({
          canister,
          message: `${file} was written while its methods were listed`,
        })
        continue
      }
      if (!listed.ok) {
        // Not remembered: the next save or buildStart lists it again.
        failures.push({
          canister,
          message: `methods cannot be compared with ${file}, whose methods could not be listed:\n${listed.message}`,
        })
        continue
      }
      const lacking = methods.filter((name) => !listed.methods.includes(name))
      const extra = listed.methods.filter((name) => !methods.includes(name))
      const fix =
        canister.canisterId !== undefined
          ? `Fetch it again with ${FETCH_VARIABLE}=${canister.name} to write the projection to methods`
          : `Write the projection to methods with candid-core-cli project, or give the canister a canisterId to fetch it from`
      let failure: string | undefined
      if (lacking.length > 0) {
        failure =
          `methods names ${listNames(lacking)}, which ${file} does not hold (it holds ${listNames(listed.methods)}): ` +
          `the file was written for other methods, and its module would lack ${lacking.length === 1 ? "it" : "them"}. ` +
          `${fix}, or take ${lacking.length === 1 ? "the name" : "the names"} out of methods.`
      } else if (extra.length > 0) {
        log.warn(
          `ic-reactor: ${canister.name}: ${file} also holds ${listNames(extra)}, which methods does not name, ` +
            `so its module has ${extra.length === 1 ? "it" : "them"} too. ${fix}.`
        )
      }
      comparedMethods.set(canister.name, { text, methods: key, failure })
      if (failure) failures.push({ canister, message: failure })
    }
    return failures
  }

  /**
   * The live check: fetch the certified interface of each canister of
   * `wanted` that asks for it (`checks`: `verify: "live"`, or
   * `IC_REACTOR_VERIFY`) and check its `didFile` against it with
   * `candid-core-cli check`. Canisters that name one file and one canister on
   * one network share one fetch and one check. A `verify` that is not
   * `"live"`, `"live"` with no `canisterId`, and a canister
   * `IC_REACTOR_VERIFY` names with no `canisterId` were refused before the
   * run did anything: `wanted` holds none of them.
   *
   * - A written method that the live canister no longer has, whose mode
   *   changed, or whose types are no longer compatible fails the canister,
   *   which is not generated, as one whose fetch failed: the failure follows
   *   `failOnError`.
   * - A compatible change is logged as a warning, and the canister generates:
   *   one that Candid accepts only by reading a value as `null`
   *   (`special_opt_rule`), and one that changed the types of the file's
   *   methods compatibly (the projections of the two interfaces to the file's
   *   methods have other identities).
   * - A check that cannot be made (the network, the canister, a side that does
   *   not compile) fails the canister: a check that was asked for and did not
   *   run must not pass for one that did.
   *
   * Files `fetched` (by `identify`) were just read from the live canister, and
   * are not checked while `run` read the text fetched. `passed` is the
   * lifetime's `verified`, read and written.
   *
   * The CLI reads the file itself, after the fetch, so a check is of the
   * run's text only if the file is still as the run read it once the check is
   * done. A canister whose file was written before that is `unsure`, whether
   * its check passed or failed: what the check found may be of another text.
   * Its pass is not recorded, and its verdict neither sets nor clears a
   * failure that stands (see the lifetime's `liveFailures`).
   *
   * Resolves with the canisters that cannot be generated, and the `unsure`
   * ones, or `undefined` when `signal` was aborted first. Never rejects.
   */
  const verifyLive = async (
    wanted: Generated[],
    checks: Requests["checks"],
    fetched: Map<string, string>,
    passed: Map<string, string>,
    run: Run,
    signal: AbortSignal
  ): Promise<{ failures: Failure[]; unsure: Set<Generated> } | undefined> => {
    const failures: Failure[] = []
    const unsure = new Set<Generated>()
    // A canister that fails here passed no check now: what passed before is
    // checked again.
    const forget = (failed: Failure[]) => {
      for (const { canister } of failed) passed.delete(canister.name)
      return { failures: failed, unsure }
    }
    // `0` turns the check off for the run, over `verify: "live"`: a project
    // that checks every build can still build offline.
    if (checks === "off") return { failures, unsure }

    const byTarget = new Map<string, Generated[]>()
    for (const canister of wanted) {
      // `IC_REACTOR_VERIFY=1` passes over a canister with no canisterId.
      if (!checks(canister) || canister.canisterId === undefined) continue
      const key = identify(didPath(canister))
      const text = run.textOf(canister)
      // A file just fetched is the live interface, until it is saved; one
      // that is missing is the generator's to report.
      if (text === undefined || fetched.get(key) === text) continue
      if (passed.get(canister.name) === text) continue
      const target = JSON.stringify([
        key,
        canister.canisterId,
        resolveNetwork(canister.network),
      ])
      byTarget.set(target, [...(byTarget.get(target) ?? []), canister])
    }
    if (byTarget.size === 0) return forget(failures)

    const outcomes = await Promise.all(
      [...byTarget.values()].map(async (members) => {
        const outcome = await checkLive(members[0], run, signal)
        // Read again as soon as this check is done.
        return { members, outcome, ofText: run.asRead(members[0]) }
      })
    )
    if (signal.aborted) return undefined
    for (const { members, outcome, ofText } of outcomes) {
      // What a check of another text found is not logged either.
      if (outcome.ok && ofText) {
        for (const { level, message } of outcome.notes) log[level](message)
      }
      for (const canister of members) {
        if (!ofText) unsure.add(canister)
        if (!outcome.ok) {
          failures.push({ canister, message: outcome.message })
          continue
        }
        // Not recorded for a file written while it was checked: the next
        // buildStart checks it again.
        const text = run.textOf(canister)
        if (ofText && text !== undefined) passed.set(canister.name, text)
        else passed.delete(canister.name)
      }
    }
    return forget(failures)
  }

  /**
   * The live check of one canister: whether it passed, with the lines it has
   * to log (a compatible change, or a match), or what failed. Whether what the
   * CLI read is the text `run` read is for the caller to tell, once the check
   * is done, so the lines are only returned. Never rejects.
   */
  const checkLive = async (
    canister: Generated,
    run: Run,
    signal: AbortSignal
  ): Promise<{ ok: true; notes: Note[] } | { ok: false; message: string }> => {
    const notes: Note[] = []
    try {
      const file = didPath(canister)
      const didFile = relativeToRoot(file)
      if (run.textOf(canister) === undefined)
        return { ok: false, message: `${didFile} is gone` }
      const live = await fetchCandid({
        canisterId: canister.canisterId as string,
        network: canister.network,
        didFile,
        signal,
        verify: true,
      })
      if (!live.ok) return live
      const where = `${canister.canisterId} on ${live.network}`
      const fetchAgain = `fetch ${didFile} again with ${FETCH_VARIABLE}=${canister.name}`

      const context = cliContext(signal)
      if (typeof context === "string") {
        return {
          ok: false,
          message: `the live check of ${didFile} cannot run: ${context}`,
        }
      }
      const report = await check(context, file, live.did)
      if (!report.ok) {
        const side =
          report.input === "live"
            ? `the live interface of ${where} does not compile`
            : report.input === "written"
              ? `${didFile} does not compile`
              : `candid-core-cli check failed`
        return {
          ok: false,
          message: `the live check of ${didFile} against ${where} could not run: ${side}:\n${report.message}`,
        }
      }
      const errors = report.diagnostics.filter(
        ({ severity }) => severity !== "warning"
      )
      const warnings = report.diagnostics.filter(
        ({ severity }) => severity === "warning"
      )
      if (!report.compatible || errors.length > 0) {
        const count = errors.length
        return {
          ok: false,
          message:
            `the live check found ${where} incompatible with ${didFile} ` +
            `(${count} error${count === 1 ? "" : "s"}):\n` +
            firstLines(errors.map(describeFinding)).join("\n") +
            `\nThe generated module no longer matches the canister for these methods: ` +
            `${fetchAgain}, regenerate, and fix the calls the type checker then reports.`,
        }
      }
      const label = `ic-reactor: ${canister.name}:`
      if (warnings.length > 0) {
        const count = warnings.length
        notes.push({
          level: "warn",
          message:
            `${label} ${where} is compatible with ${didFile}, with ${count} warning${count === 1 ? "" : "s"} ` +
            `(a value at each path now decodes as null):\n` +
            firstLines(warnings.map(describeFinding))
              .map((line) => `  ${line}`)
              .join("\n") +
            `\nTo take the change, ${fetchAgain}.`,
        })
        return { ok: true, notes }
      }

      // Compatible with no finding: unchanged for the file's methods, or
      // changed compatibly (an added optional field, an added variant arm in
      // an argument). The projections of both sides to the file's methods have
      // one identity exactly when the methods are unchanged.
      const changed = await changedFor(context, file, live.did)
      if (signal.aborted) return { ok: false, message: "was stopped" }
      if (changed === true) {
        notes.push({
          level: "warn",
          message:
            `${label} ${where} changed compatibly for the methods of ${didFile}: its module still works. ` +
            `To take the change, ${fetchAgain}.`,
        })
      } else if (changed === false) {
        notes.push({
          level: "info",
          message: `${label} ${didFile} matches the live interface of ${where}`,
        })
      } else {
        notes.push({
          level: "info",
          message: `${label} ${didFile} is compatible with the live interface of ${where}`,
        })
      }
      return { ok: true, notes }
    } catch (error) {
      return { ok: false, message: describe(error) }
    }
  }

  /**
   * Whether the live interface `live` differs from the `.did` at `file` for
   * the methods the file holds, `undefined` when that cannot be told.
   */
  const changedFor = async (
    context: CliContext,
    file: string,
    live: string
  ): Promise<boolean | undefined> => {
    const listed = await listMethods(context, { file })
    if (
      !listed.ok ||
      listed.methods.length === 0 ||
      listed.methods.some((name) => name.includes(","))
    ) {
      return undefined
    }
    const [written, current] = await Promise.all([
      project(context, { file }, listed.methods),
      project(context, { text: live }, listed.methods),
    ])
    if (!written.ok || !current.ok) return undefined
    return written.projection.interface_id !== current.projection.interface_id
  }

  /**
   * The error text for failed canisters. Canisters that failed for the same
   * reason (no CLI installed, one crash) are listed under it once.
   */
  const describeFailures = (failures: Failure[]): string => {
    const byMessage = new Map<string, string[]>()
    for (const { canister, message } of failures) {
      // A refused canister whose didFile is not a path is named alone.
      const label =
        canister.didFile === undefined
          ? canister.name
          : `${canister.name} (${relativeToRoot(didPath(canister as Generated))})`
      byMessage.set(message, [...(byMessage.get(message) ?? []), label])
    }
    return (
      `ic-reactor: could not generate ${failures.length} of ${configured.length} canisters:\n` +
      [...byMessage]
        .map(
          ([message, labels]) =>
            `  - ${labels.join(", ")}: ${message.replace(/\n/g, "\n    ")}`
        )
        .join("\n")
    )
  }

  /**
   * Report the outcome of a run that does not end the Vite run (a save, or a
   * build with `failOnError` off): log a failure and put every unfixed one in
   * the error overlay of the `lifetime`'s browsers. When a canister is fixed,
   * the overlay is replaced by one that lists only the canisters still
   * failing, or cleared once there are none.
   */
  const publish = (
    lifetime: Lifetime,
    attempted: Array<Generated | Refused>,
    failures: Failure[]
  ): void => {
    // Every attempted canister leaves `unfixed`, not just the first one found
    // there: a save regenerates all the canisters that name the `.did`, and
    // `some` would stop at the first, leaving the others listed in an overlay
    // nothing clears.
    let wasFailing = false
    for (const { name } of attempted) {
      if (lifetime.unfixed.delete(name)) wasFailing = true
    }
    for (const failure of failures) {
      lifetime.unfixed.set(failure.canister.name, failure)
    }
    if (failures.length > 0) {
      log.error(describeFailures(failures))
      showOverlay(lifetime)
    } else if (wasFailing && lifetime.unfixed.size > 0) {
      // The open overlay still lists the canister that was just fixed.
      showOverlay(lifetime)
    } else if (wasFailing) {
      // Nothing may have changed on disk when a canister is fixed back to what
      // it generated before, so the page has nothing else to reload it.
      lifetime.server?.ws.send({ type: "full-reload" })
    }
  }

  /**
   * Put the `lifetime`'s unfixed failures in the error overlay: of the
   * browser that just connected when the WebSocket hands it over
   * (`ws.on("connection")` does), and of every browser of its server
   * otherwise. Vite's client clears the overlay on every hot update it
   * applies, and nothing here sends it again, so the overlay can go while a
   * canister is still broken. The terminal log keeps the error, and the
   * replay on connection shows it after the next full reload.
   */
  const showOverlay = (
    lifetime: Lifetime,
    client?: { send?: (data: string) => void }
  ): void => {
    if (lifetime.unfixed.size === 0) return
    const payload = {
      type: "error" as const,
      err: {
        message: describeFailures([...lifetime.unfixed.values()]),
        stack: "",
        plugin: PLUGIN_NAME,
      },
    }
    if (typeof client?.send === "function") {
      try {
        client.send(JSON.stringify(payload))
      } catch {
        // A browser that is already gone has no use for the overlay, and a
        // listener must not throw into the WebSocket server.
      }
      return
    }
    lifetime.server?.ws.send(payload)
  }

  /**
   * A `.did` file was saved, as the watcher of the `lifetime`'s server
   * reports: regenerate the canisters that name it, and only those. Canisters
   * with one interface share its file and its run. Saves that arrive while it
   * runs collapse into one run after it, so the last saved file wins without
   * runs piling up.
   */
  const onDidSaved = (lifetime: Lifetime, file: string): void => {
    const saved = path.normalize(file)
    // By the file: the watcher may report it under any of its spellings.
    const key = identify(saved)
    const affected = generated.filter(
      (canister) => identify(didPath(canister)) === key
    )
    if (affected.length === 0 || lifetime.queued.has(key)) return
    // The plugin's own write of a fetched file, which the run that fetched it
    // generates.
    const fetched = lifetime.justFetched.get(key)
    if (fetched !== undefined) {
      lifetime.justFetched.delete(key)
      try {
        if (fs.readFileSync(saved, "utf-8") === fetched) return
      } catch {
        // Gone again: regenerate, which reports it.
      }
    }
    regenerate(lifetime, saved, key, affected)
  }

  /**
   * Regenerate `affected`, the canisters that name the `.did` at `saved`
   * (`key`, by `identify`), in a run of the `lifetime` after the one in
   * flight. See `onDidSaved`.
   *
   * The run reads the file once, when it starts (see {@link Run}). A file
   * written again before it is done is queued once more, and this run takes
   * nothing of it: it publishes nothing, neither a failure nor that a
   * canister is fixed, and the run after it reports the file as it is then.
   *
   * Only the close of the `lifetime`'s own server stops it: a restart starts
   * the new server, whose runs these may be, before it closes the old one.
   */
  const regenerate = (
    lifetime: Lifetime,
    saved: string,
    key: string,
    affected: Generated[]
  ): void => {
    lifetime.queued.add(key)
    const { signal } = lifetime.stopper
    void serially(async () => {
      lifetime.queued.delete(key)
      // Dropped when the server closed while it waited.
      if (signal.aborted) return
      // No live check here: a save is never a network request. So a canister
      // whose live check failed stays failed, and is not generated, until a
      // start checks it again (see `liveFailures`). Read here, in the job, and
      // not when the save is queued: a check in flight may still set it.
      const standing: Failure[] = []
      const open: Generated[] = []
      // A canister whose module another writes is not generated by a save
      // either, which would write that module over the other's: the run of
      // one file sees only the canisters that name it.
      const collided = collisions()
      for (const canister of affected) {
        const collision = collided.get(canister)
        if (collision !== undefined) {
          standing.push({ canister, message: collision })
          continue
        }
        const failure = lifetime.liveFailures.get(canister.name)
        if (!failure) {
          open.push(canister)
          continue
        }
        standing.push({
          canister,
          message:
            `${failure.message}\n${relativeToRoot(saved)} was saved, and a save makes no request: ` +
            `this stands until a live check passes, which runs when the dev server restarts.`,
        })
      }
      if (open.length > 0) {
        log.info(
          `ic-reactor: ${relativeToRoot(saved)} changed, regenerating ${open.map(({ name }) => name).join(", ")}`
        )
      }
      const run = startRun(open)
      const mismatched = await compareMethods(open, run, signal)
      if (!mismatched) return
      const failed = new Set(mismatched.map(({ canister }) => canister))
      const failures = await generateNow(
        open.filter((canister) => !failed.has(canister)),
        true,
        run,
        signal
      )
      if (!failures) return
      const written = writtenSince(run, open)
      if (written.length > 0) {
        requeue(lifetime, written)
        return
      }
      publish(lifetime, affected, [...standing, ...mismatched, ...failures])
    })
  }

  /**
   * Queue the `didFile` of each of `canisters` again in the `lifetime`, as a
   * save of it does, unless a run is queued for it already: a run under a dev
   * server took nothing of it, since the file was written while the run read
   * it (see `writtenSince`).
   */
  const requeue = (lifetime: Lifetime, canisters: Generated[]): void => {
    for (const canister of canisters) {
      const key = identify(didPath(canister))
      if (lifetime.queued.has(key)) continue
      regenerate(
        lifetime,
        didPath(canister),
        key,
        generated.filter((other) => identify(didPath(other)) === key)
      )
    }
  }

  /**
   * A `.did` file was deleted, as the watcher of the `lifetime`'s server
   * reports: fail the canisters that name it, in the log and the overlay,
   * until it comes back (an `add` regenerates them). The module generated
   * from it is still on disk and would otherwise go on looking current. No
   * generator runs, since there is nothing to read.
   *
   * It waits behind the run in flight, so that run cannot report the file as
   * generated after this has reported it gone.
   */
  const onDidRemoved = (lifetime: Lifetime, file: string): void => {
    const removed = path.normalize(file)
    const key = identify(removed)
    const affected = generated.filter(
      (canister) => identify(didPath(canister)) === key
    )
    if (affected.length === 0) return
    const { signal } = lifetime.stopper
    void serially(async () => {
      try {
        // Back already, and the run its `add` queued regenerates it.
        if (signal.aborted || fs.existsSync(removed)) return
        for (const { name } of affected) generatedFrom.delete(name)
        // A canister whose module another writes keeps that reason: the file
        // coming back would not generate it either.
        const collided = collisions()
        publish(
          lifetime,
          affected,
          affected.map((canister) => ({
            canister,
            message:
              collided.get(canister) ??
              "the .did file was deleted; its module is not regenerated until the file comes back" +
                (canister.canisterId !== undefined
                  ? `, or until the dev server restarts and fetches it from ${canister.canisterId}`
                  : ""),
          }))
        )
      } catch (error) {
        // A listener must not throw into the watcher.
        log.error(`ic-reactor: ${describe(error)}`)
      }
    })
  }

  /**
   * What `IC_REACTOR_FETCH` and `IC_REACTOR_VERIFY` ask of this run, read
   * when its steps start, and the canisters they name that cannot do it: one
   * with no `canisterId` cannot be fetched or checked. Such a canister fails
   * as a refused one does, before the run does anything for it. A name that
   * is no canister with a `didFile` is warned about.
   */
  const readRequests = (): Requests => {
    const failures: Failure[] = []
    const named = (variable: string, name: string): Generated | undefined => {
      const canister = generated.find((entry) => entry.name === name)
      // A refused canister fails for its options already.
      if (!canister && !refused.some((entry) => entry.name === name)) {
        log.warn(
          `ic-reactor: ${variable} names "${name}", which is not a canister with a didFile in this plugin's options`
        )
      }
      return canister
    }

    const fetch = namesIn(FETCH_VARIABLE, ["all"])
    for (const name of fetch.all ? [] : fetch.names) {
      const canister = named(FETCH_VARIABLE, name)
      if (canister && canister.canisterId === undefined) {
        failures.push({
          canister,
          message: `${FETCH_VARIABLE} asks to fetch its didFile again, but it names no canisterId to fetch it from`,
        })
      }
    }

    const verify = namesIn(VERIFY_VARIABLE, VERIFY_ALL)
    // `0` turns the check off for the run, over `verify: "live"`: a project
    // that checks every build can still build offline.
    const off = verify.names.find((name) => VERIFY_OFF.includes(name))
    if (off !== undefined && verify.names.length > 1) {
      log.warn(
        `ic-reactor: ${VERIFY_VARIABLE} is "${verify.names.join(",")}", and ${off} turns the live check off: no canister is checked`
      )
    }
    for (const name of off !== undefined || verify.all ? [] : verify.names) {
      const canister = named(VERIFY_VARIABLE, name)
      if (canister && canister.canisterId === undefined) {
        failures.push({
          canister,
          message: `${VERIFY_VARIABLE} asks for its live check, but it names no canisterId to check its didFile against`,
        })
      }
    }

    return {
      fetches: (canister) => fetch.all || fetch.names.includes(canister.name),
      checks:
        off !== undefined
          ? "off"
          : (canister) =>
              canister.verify === "live" ||
              (verify.all && canister.canisterId !== undefined) ||
              verify.names.includes(canister.name),
      failures,
    }
  }

  /** Log the guide line once, before anything else the plugin says. */
  const announceGuide = (userConfig: UserConfig): void => {
    if (announced) return
    announced = true
    if (userConfig.customLogger) {
      userConfig.customLogger.info(GUIDE_LINE)
    } else if (
      !["silent", "error", "warn"].includes(userConfig.logLevel ?? "")
    ) {
      console.log(GUIDE_LINE)
    }
  }

  const plugin: Plugin = {
    name: PLUGIN_NAME,
    enforce: "pre", // Run before other plugins

    async config(userConfig, { command: viteCommand, mode }) {
      announceGuide(userConfig)

      // Vitest runs the plugin with the `serve` command and mode `test`, and
      // a test run has no use for a cookie or a proxy, or for asking `icp`
      // about a network.
      if (viteCommand !== "serve" || mode === "test" || !injectEnvironment) {
        return {}
      }

      // ── Local Development Proxy & Cookies ────────────────────────────────

      if (notCanisterIds.length > 0) {
        console.warn(
          `[ic-reactor] canisterId is not a canister ID (${notCanisterIds.join("; ")}), ` +
            `so the ic_env cookie takes the ID of ${notCanisterIds.length === 1 ? "that canister" : "those canisters"} from icp. ` +
            `Give the canister's principal as text, or remove canisterId.`
        )
      }

      // The plugin's own `/api` entry, unless the Vite config has one.
      const ownsApiProxy = !userConfig.server?.proxy?.["/api"]

      // The options of this server's `/api` proxy, as Vite hands them over:
      // this config's, so that the detection of another server (the one a
      // restart replaces) never moves this one's proxy.
      const apiProxyOptions = new Set<ProxyOptions>()

      const environment = createLocalEnvironment({
        canisterNames: names,
        configuredCanisterIds,
        // `configResolved` has not run yet, so resolve the root the way Vite
        // will. icp finds the project from the directory it starts in, and
        // with `vite apps/web` or a `root` option that is not the process cwd.
        projectRoot: path.resolve(userConfig.root ?? process.cwd()),
        onDiagnostic: debugLog,
        onUpdate: (previous, next) => {
          for (const proxyOptions of apiProxyOptions) {
            proxyOptions.target = next.proxyTarget
          }
          if (previous) {
            // Only a proxy the plugin kept following moves with detection.
            reportDetectionProgress(previous, next, apiProxyOptions.size > 0)
          }
        },
      })
      localEnvironment = environment

      const state = await environment.detect()
      warnAboutIncompleteDetection(state, names.length > 0, ownsApiProxy)

      return {
        server: {
          // The cookie is not a static `server.headers` entry: the middleware
          // that configureServer adds sets it per response, from the latest
          // detection. See dev-environment.ts.
          proxy: apiProxy(userConfig, state.proxyTarget, (proxyOptions) => {
            // A plugin whose config hook runs after this one can proxy /api
            // as well. Vite merges its entry over the one returned here and
            // keeps this `configure`, so a target other than the one returned
            // here is that plugin's, and it stays where that plugin put it.
            if (proxyOptions.target !== state.proxyTarget) {
              debugLog(
                "Another plugin changed the target of the /api proxy, so the plugin leaves that proxy alone."
              )
              return
            }
            // Vite hands the proxy these options on every request, so a new
            // target set here takes effect on the next one.
            apiProxyOptions.add(proxyOptions)
            proxyOptions.target =
              environment.state?.proxyTarget ?? state.proxyTarget
          }),
        },
      }
    },

    configResolved(config) {
      // Everything the plugin resolves, `didFile` and `outDir`, is documented
      // as relative to the project root, so it has to be Vite's resolved root
      // and not wherever the process started.
      projectRoot = config.root
      log = config.logger
      // A new lifetime: a build, or a dev server, a restart's included. Its
      // live checks start again (see `Lifetime`).
      current = lifetimeAfter(current, config.command)
      byConfig.set(config, current)
    },

    configureServer(server) {
      // The server's own lifetime: its watcher's saves, its overlay and its
      // close are its own, whatever server the restart that made it closes.
      const lifetime = byConfig.get(server.config) ?? current
      lifetime.server = server
      open.add(lifetime)

      // Added here rather than returned as a post hook, so it runs before
      // Vite's own middlewares, which serve the page.
      if (localEnvironment) {
        server.middlewares.use(icEnvMiddleware(localEnvironment))
      }

      if (configured.length === 0) return

      // Hand each browser that connects the failures not yet fixed. Guarded:
      // the peer range spans several Vite majors and `ws.on` is not present on
      // every one of them. Losing the replay is acceptable; throwing out of
      // configureServer is not.
      server.ws.on?.(
        "connection",
        (client?: { send?: (data: string) => void }) =>
          showOverlay(lifetime, client)
      )

      if (generated.length === 0) return
      // `.did` files are not in the module graph, so the watcher is told about
      // them. Regenerate from its own events and not from `handleHotUpdate`,
      // which Vite calls only for a file changed in place and only while HMR
      // is on: a `.did` created after startup, or written again by a build
      // tool or `git checkout`, arrives as an `add` event, and a deleted one
      // as `unlink`.
      server.watcher.add(generated.map(didPath))
      server.watcher.on("change", (file: string) => onDidSaved(lifetime, file))
      server.watcher.on("add", (file: string) => onDidSaved(lifetime, file))
      server.watcher.on("unlink", (file: string) =>
        onDidRemoved(lifetime, file)
      )
    },

    // `vite preview` resolves the config with the `serve` command too, and
    // used to inherit the cookie from `server.headers`.
    configurePreviewServer(server) {
      if (localEnvironment) {
        server.middlewares.use(icEnvMiddleware(localEnvironment))
      }
    },

    async buildStart() {
      if (configured.length === 0) return
      // The lifetime of the build or server this start is for.
      const lifetime = lifetimeOf(this) ?? current
      open.add(lifetime)

      // `vite build --watch` rebuilds when a file it watches changes, and a
      // `.did` file is never part of the module graph. Registered here, a save
      // starts a rebuild, and the rebuild's buildStart regenerates.
      for (const canister of generated) this.addWatchFile(didPath(canister))

      const { signal } = lifetime.stopper
      // This lifetime's passes: a restart starts another lifetime before the
      // old server closes, so a fetch or a check of this run that ends after
      // it writes only to this lifetime's map.
      const passed = lifetime.verified
      const outcome = await serially(async () => {
        // Every canister that cannot be run fails first, before the run
        // fetches, writes, runs or requests anything for it: one whose
        // options hold a value that is not one, one whose module another
        // canister writes (see `collisions`), and one that a variable asks of
        // what it cannot do (see `readRequests`).
        const requests = readRequests()
        const problems = [
          ...refusals,
          ...[...collisions()].map(([canister, message]) => ({
            canister,
            message,
          })),
          ...requests.failures,
        ]
        const blocked = new Map<Generated | Refused, string>()
        for (const { canister, message } of problems) {
          if (!blocked.has(canister)) blocked.set(canister, message)
        }
        // A canister whose `.did` could not be fetched has nothing to
        // generate from: it fails with the reason, and the others generate.
        // So does one whose file lacks a name of its `methods`, and one that
        // failed its live check.
        const fetchedNow = await fetchMissing(
          lifetime,
          blocked,
          requests.fetches,
          signal
        )
        if (!fetchedNow) return undefined
        const { fetched } = fetchedNow
        // A refused fetch names every canister of its file, so it goes first.
        const failures = [...fetchedNow.failures, ...problems]
        // A file just fetched is the live interface: the text fetched passes
        // for the canisters that name it, and not the file read again, which
        // may have been saved since. A fetch that failed (or was refused) read
        // nothing, so what passed before is checked again: restoring it
        // cannot stand in for a fetch that showed another interface, or for
        // a check that cannot be made.
        for (const canister of generated) {
          const did = fetched.get(identify(didPath(canister)))
          if (did !== undefined) passed.set(canister.name, did)
        }
        for (const { canister } of failures) passed.delete(canister.name)
        // From here on, one reading of each file the run works on (see
        // `Run`): not of a blocked canister's, which it does nothing for.
        const working = generated.filter((canister) => !blocked.has(canister))
        const run = startRun(working)
        const remaining = () => {
          const failed = new Set(failures.map(({ canister }) => canister))
          return working.filter((canister) => !failed.has(canister))
        }
        const mismatched = await compareMethods(remaining(), run, signal)
        if (!mismatched) return undefined
        failures.push(...mismatched)
        const checking = remaining()
        const live = await verifyLive(
          checking,
          requests.checks,
          fetched,
          passed,
          run,
          signal
        )
        if (!live) return undefined
        // Only a check of the text the run read sets or clears a failure
        // that stands, whether it passed or failed (see `liveFailures`).
        for (const canister of checking) {
          if (!live.unsure.has(canister)) {
            lifetime.liveFailures.delete(canister.name)
          }
        }
        for (const failure of live.failures) {
          if (!live.unsure.has(failure.canister as Generated)) {
            lifetime.liveFailures.set(failure.canister.name, failure)
          }
        }
        failures.push(...live.failures)
        const generation = await generateNow(remaining(), false, run, signal)
        if (!generation) return undefined
        return {
          failures: dedupe([...failures, ...generation]),
          written: writtenSince(run, working),
        }
      })
      if (!outcome) return
      // A canister whose file was written while this run read it takes
      // nothing of the run (see `writtenSince`): none of the failures its
      // steps found, which may be of another text, and no success.
      const { written } = outcome
      const wasWritten = new Set<Generated | Refused>(written)
      const taken = configured.filter((canister) => !wasWritten.has(canister))
      let failures = outcome.failures.filter(
        ({ canister }) => !wasWritten.has(canister)
      )
      if (lifetime.server) {
        // Queued again, as a save is: that run reports it.
        requeue(lifetime, written)
      } else {
        // A build fails it, for this reason alone.
        failures = [
          ...failures,
          ...written.map((canister) => ({
            canister,
            message:
              `${relativeToRoot(didPath(canister))} changed during the build, after the build read it: ` +
              `the steps that read it (listing its methods, the live check, generation) may each have read ` +
              `another text, so the build takes none of them. Build again.`,
          })),
        ]
      }
      if (
        failures.length > 0 &&
        (failOnError ?? lifetime.command === "build")
      ) {
        // A build that exits 0 would ship whatever stale bindings are still on
        // disk, which no longer match the canister.
        this.error(describeFailures(failures))
      }
      // Under a dev server, nothing is said of a written canister here, not
      // even that it is fixed: the run queued for it reports it.
      publish(lifetime, lifetime.server ? taken : configured, failures)
    },

    // The end of a build, and the close of a dev server, which Vite reports
    // here once for each of its environments: it stops the runs of that
    // build or server, and only those.
    closeBundle() {
      // In Vite 6 and later the environment names its config. Vite 4 and 5
      // have none, but call this once for a server's close, and a restart
      // closes the old server after the new one started: the lifetime that
      // closes is the oldest still open.
      const lifetime = lifetimeOf(this) ?? open.values().next().value ?? current
      open.delete(lifetime)
      lifetime.stopper.abort()
      lifetime.stopper = new AbortController()
    },
  }

  return plugin
}

/** One readable line for whatever was thrown. Never throws. */
function describe(error: unknown): string {
  return describeError(error)
}

/**
 * The `server.proxy` entry that sends `/api` to `target`, or nothing when the
 * user's Vite config already proxies `/api`.
 *
 * Vite deep-merges the object a `config` hook returns over the user's config,
 * so an `/api` entry returned here replaced the user's own. A project that
 * pointed `/api` at its own replica (dfx's 4943, say) got the plugin's
 * fallback instead, and nothing reported the swap. Vite's merge skips an
 * undefined value, so returning nothing leaves the user's entry in place.
 *
 * `configure` receives the options object Vite builds the proxy from. Every
 * supported Vite major copies it for each request, so the target can follow
 * detection while the server runs.
 */
function apiProxy(
  userConfig: UserConfig,
  target: string,
  configure: (options: ProxyOptions) => void
): Record<string, ProxyOptions> | undefined {
  if (userConfig.server?.proxy?.["/api"]) {
    debugLog(
      `The Vite config already proxies /api, so the plugin keeps that proxy instead of sending /api to ${target}.`
    )
    return undefined
  }

  return {
    "/api": {
      target,
      changeOrigin: true,
      configure: (_proxy, options) => configure(options),
    },
  }
}

/** `"a"`, or `"a", "b"`: canister names as the warnings quote them. */
function quoteNames(names: string[]): string {
  return names.map((name) => `"${name}"`).join(", ")
}

/**
 * Warn at startup when detection is incomplete, and say what the plugin does
 * about it: it asks `icp` again on each page load until detection completes.
 *
 * Failing detection used to be indistinguishable from success: no cookie was
 * set, no warning was printed, and the app only broke later on an undefined
 * canister id.
 */
function warnAboutIncompleteDetection(
  state: LocalEnvironmentState,
  hasCanisters: boolean,
  ownsApiProxy: boolean
): void {
  if (!state.environment) {
    // Env-only mode (no canisters configured) has nothing to inject.
    if (!hasCanisters) return
    const proxyNote = ownsApiProxy
      ? ` and /api goes to ${state.proxyTarget} for now`
      : ""
    console.warn(
      `[ic-reactor] Could not detect the local IC environment, so no ic_env cookie is set${proxyNote}. ` +
        `Is the local network running? The plugin asks \`icp\` again on each page load until it answers` +
        `${ownsApiProxy ? ", then sends /api to the network it reports" : ""}: start the network ` +
        `(\`icp network start\`) and reload the page. Re-run with DEBUG=ic-reactor to see the \`icp\` output.`
    )
    return
  }

  // The network can be up while a configured canister has never been
  // deployed. Every `icp canister status <name>` then fails and that id is
  // absent, so the cookie carries a root key and no PUBLIC_CANISTER_ID for it,
  // which is the same silent failure. Only configured canisters count, and one
  // with a configured `canisterId` is resolved.
  const missing = state.missingCanisterIds
  if (missing.length > 0) {
    const it = missing.length === 1 ? "it" : "them"
    console.warn(
      `[ic-reactor] The local replica is running, but no canister ID could be resolved for ${quoteNames(missing)}. ` +
        `Until one is, the ic_env cookie carries no PUBLIC_CANISTER_ID for ${it} and the app will see an ` +
        `undefined canister id. Deploy ${it} (\`icp deploy\`) and reload the page: the plugin asks \`icp\` ` +
        `again on each page load until every configured canister has an ID. ` +
        `Re-run with DEBUG=ic-reactor to see the \`icp\` output.`
    )
  }
}

/**
 * Report what a detection after startup found that the one before had not.
 *
 * @param followsApiProxy - Whether the `/api` proxy moves with detection. It
 * does not when the Vite config or another plugin set its target.
 */
function reportDetectionProgress(
  previous: LocalEnvironmentState,
  next: LocalEnvironmentState,
  followsApiProxy: boolean
): void {
  if (!previous.environment && next.environment) {
    console.log(
      `[ic-reactor] Detected the local IC network: the ic_env cookie now carries its root key` +
        (followsApiProxy ? ` and /api goes to ${next.proxyTarget}.` : ".")
    )
  }

  const resolved = previous.missingCanisterIds.filter(
    (name) => !next.missingCanisterIds.includes(name)
  )
  if (next.environment && resolved.length > 0) {
    console.log(
      `[ic-reactor] The ic_env cookie now carries the canister ID${
        resolved.length === 1 ? "" : "s"
      } for ${quoteNames(resolved)}.`
    )
  }

  if (next.complete && !previous.complete) {
    console.log(
      "[ic-reactor] Every configured canister has an ID, so page loads no longer run `icp`. " +
        "Restart the dev server after redeploying into a fresh network."
    )
  }
}

/**
 * `icp` failing to answer is routine — no local replica, or a canister that has
 * never been deployed — so its stderr is noise until someone is actually
 * debugging. Gate it the way Vite gates its own debug output.
 */
function debugLog(message: string): void {
  const enabled = (process.env.DEBUG ?? "").split(",").some((entry) => {
    const scope = entry.trim()
    return (
      scope === "*" || scope === "ic-reactor" || scope.startsWith("ic-reactor:")
    )
  })

  if (enabled) {
    console.debug(`[ic-reactor:debug] ${message}`)
  }
}
