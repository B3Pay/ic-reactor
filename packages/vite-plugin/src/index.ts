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
import {
  createLocalEnvironment,
  icEnvMiddleware,
  type LocalEnvironment,
  type LocalEnvironmentState,
} from "./dev-environment.js"
import {
  fetchCandid,
  resolveNetwork,
  writeDid,
  type CanisterNetwork,
} from "./fetch.js"
import { cachedFoldsCase, fileIdentity, realFile } from "./file-identity.js"
import {
  GENERATE_TIMEOUT_MS,
  foldsCase,
  generate,
  resolveCliBin,
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

const PLUGIN_NAME = "ic-reactor-plugin"

/** Where a canister's module goes when it sets no `outDir`. */
const DEFAULT_OUT_DIR = "src/canisters"

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
   *   give one an `outDir` of its own. A canister without a `didFile`
   *   generates nothing and is only named in the cookie. A run (the start of
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
   *   Only an omitted `canisterId` is none: any other value that is not a
   *   canister ID (`""`, or `null` from a JavaScript config) fails the fetch
   *   or check that would use it, and is left out of the cookie with a
   *   warning.
   * - `network`: where the canister to fetch is. `"ic"`, mainnet, checked
   *   against the mainnet root key; `"local"`, icp-cli's local network on
   *   `http://127.0.0.1:8000`, whose root key is fetched from it; or
   *   `{ host }`, any other replica, whose root key is fetched only when the
   *   host is local (`localhost`, `*.localhost` or a loopback address) and is
   *   mainnet's otherwise. Only a fetch reads it. Default: `"ic"`.
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
   *   included, fails the canister: remove `verify` for no check.
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

/** A canister with a `.did` to generate from. */
interface Generated {
  name: string
  didFile: string
  outDir: string
  /** The live canister its `didFile` is fetched from when it is not on disk. */
  canisterId?: string
  network?: CanisterNetwork
  /** The methods a fetched `didFile` is projected to. */
  methods?: readonly string[]
  verify?: "live"
}

/** The environment variable that asks for a `didFile` to be fetched again. */
const FETCH_VARIABLE = "IC_REACTOR_FETCH"

/** The environment variable that asks for the live check. */
const VERIFY_VARIABLE = "IC_REACTOR_VERIFY"

/** The values of `IC_REACTOR_VERIFY` that check every canister. */
const VERIFY_ALL = ["1", "true", "all"]

/** The values of `IC_REACTOR_VERIFY` that check none, over `verify`. */
const VERIFY_OFF = ["0", "false"]

/**
 * Why `methods` cannot be projected to, or `undefined` when it can. The
 * plugin's options come from a config file that TypeScript may not check.
 */
function methodsProblem(methods: unknown): string | undefined {
  if (methods === undefined) return undefined
  if (!Array.isArray(methods)) {
    return `methods is ${JSON.stringify(methods)}, not a list of method names`
  }
  if (methods.length === 0) {
    return "methods is empty: name the methods the app calls, or remove methods for the whole interface"
  }
  for (const name of methods as unknown[]) {
    if (typeof name !== "string" || name === "") {
      return `methods holds ${JSON.stringify(name)}, which is not a method name`
    }
    if (name.includes(",")) {
      return `methods names "${name}", which has a comma: candid-core-cli project takes the names separated by commas, so it cannot be projected to`
    }
  }
  return undefined
}

/**
 * Why `verify` is not an option value, or `undefined` when it is: omitted, or
 * `"live"`.
 */
function verifyProblem(verify: unknown): string | undefined {
  if (verify === undefined || verify === "live") return undefined
  return `verify is ${JSON.stringify(verify)}, not "live": set it to "live" for the live check, or remove it for none`
}

/**
 * Why a boolean option is not one, or `undefined` when it is omitted or a
 * boolean. Read by truthiness, `0`, `""` or `null` would turn the option off
 * and `"false"` would turn it on, without a word.
 */
function booleanProblem(name: string, value: unknown): string | undefined {
  if (value === undefined || typeof value === "boolean") return undefined
  return (
    `[ic-reactor] ${name} is ${JSON.stringify(value) ?? String(value)}, not true or false: ` +
    `set it to true or false, or remove it for the default`
  )
}

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
  canister: Generated
  message: string
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
  // Thrown, so that the config does not load: the option is the whole
  // plugin's, and either value read by guess could ship stale bindings or
  // drop the local environment.
  const optionProblem =
    booleanProblem("injectEnvironment", options.injectEnvironment) ??
    booleanProblem("failOnError", options.failOnError)
  if (optionProblem) throw new Error(optionProblem)
  const { canisters = {}, injectEnvironment = true, failOnError } = options
  const names = Object.keys(canisters)

  // A configured ID is the cookie's for its canister, over the one `icp`
  // reports. Only text can be one: any other value given (`""`, or `null`
  // from a JavaScript config) is left to `icp`, with a warning, rather than
  // put in the cookie or taken for no canisterId without a word.
  const configuredCanisterIds: Record<string, string> = {}
  const notCanisterIds: string[] = []
  for (const name of names) {
    const { canisterId } = canisters[name]
    if (canisterId === undefined) continue
    if (typeof canisterId === "string" && canisterId !== "") {
      configuredCanisterIds[name] = canisterId
    } else {
      notCanisterIds.push(`${name}: ${JSON.stringify(canisterId)}`)
    }
  }

  /** The canisters that have a `.did` to generate from. */
  const generated: Generated[] = names.flatMap((name) => {
    const {
      didFile,
      outDir = DEFAULT_OUT_DIR,
      canisterId,
      network,
      methods,
      verify,
    } = canisters[name]
    return didFile === undefined
      ? []
      : [{ name, didFile, outDir, canisterId, network, methods, verify }]
  })

  // Vite resolves relative project paths against the resolved `config.root`,
  // which only equals the process cwd when vite happens to be started from the
  // project directory, not for `root: "frontend"` and not when the root is
  // passed positionally (`vite build apps/web`). `configResolved` overwrites
  // this before any hook that resolves a path runs; the cwd is only Vite's own
  // default root.
  let projectRoot = process.cwd()

  // `vite build` and `vite dev` want opposite failure behaviour, so remember
  // which one we are in. Build is the safer default for the case where neither
  // `config` nor `configResolved` has run.
  let command: ResolvedConfig["command"] = "build"

  let log: PluginLog = consoleLog
  let announced = false

  /**
   * The local IC environment `vite dev` and `vite preview` inject. The
   * `config` hook creates it when `injectEnvironment` is on.
   */
  let localEnvironment: LocalEnvironment | undefined

  /** The options of the plugin's `/api` proxy, as Vite hands them over. */
  const apiProxyOptions = new Set<ProxyOptions>()

  // Set once the dev server exists. In dev, `configureServer` runs before Vite
  // calls `buildStart`, so a startup failure can reach the overlay too.
  let devServer: ViteDevServer | null = null

  // ── Generation ──────────────────────────────────────────────────────────

  const didPath = (canister: Generated) =>
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
   * `buildStart` Vite 6 and later run for another environment.
   */
  const generatedFrom = new Map<string, string>()

  /**
   * The failures not yet fixed, by canister name. Vite awaits `buildStart`
   * before the HTTP server listens, so a failure at startup is sent to no
   * browser at all; each browser that connects later is handed these.
   */
  const unfixed = new Map<string, Failure>()

  // Generation runs one job after another. Two `buildStart`s (one per Vite 6+
  // environment) or a save during a run would otherwise start two generator
  // processes that write the same files.
  let tail: Promise<unknown> = Promise.resolve()
  const serially = <T>(job: () => Promise<T>): Promise<T> => {
    const result = tail.then(job)
    tail = result.catch(() => undefined)
    return result
  }

  /**
   * The `.did` files waiting for a run that has not started, by `identify`.
   * See `onDidSaved`.
   */
  const queued = new Set<string>()

  // Aborted when the build or dev server ends (`closeBundle`), which kills
  // the generator processes then running and drops the runs still queued. A
  // generator that outlived its server would keep Node alive for up to its
  // timeout, and after a restart (a `vite.config` edit) it would write the
  // same outDir as the new server's first run. A fresh controller follows each
  // abort, since the same plugin object serves a server that is started again.
  let stopper = new AbortController()

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
   * @param signal - The `stopper` signal current when the run was asked for.
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
        canisters: stale.map((canister) => ({
          name: canister.name,
          didFile: didPath(canister),
          outDir: path.resolve(projectRoot, canister.outDir),
        })),
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

  /**
   * The text this plugin last wrote to each `.did` it fetched under a dev
   * server, by `identify`, until the watcher reports that write. The run
   * that fetched the file generates it, so the watcher's event for that write
   * starts no second run. A build has no such watcher, and records nothing.
   */
  const justFetched = new Map<string, string>()

  /**
   * Why the canisters that name one file (`members`) cannot have it fetched,
   * or `undefined` when they can. Asked only when the file is to be fetched,
   * and before any request: a file on disk that nobody asked to fetch again
   * is read by them all, whatever their `canisterId`s and `methods` (two
   * ICRC-1 ledgers on one `icrc1.did`), and `compareMethods` compares it with
   * the list of each.
   *
   * In this order: the `methods` of a member, with a `canisterId` or not, is
   * not a list that can be projected to; the members that name a `canisterId`
   * (`fetchable`) name different canisters, or one canister on different
   * networks, so whose interface the file is cannot be told; or the members
   * name different projections (no `methods` is the whole interface), so
   * which one the file holds cannot be told. Every member generates from the
   * one file, so a member with no `canisterId` counts as much as the one it
   * is fetched for.
   */
  const conflictOf = (
    members: Generated[],
    fetchable: Generated[]
  ): string | undefined => {
    const spellings = [
      ...new Set(members.map((canister) => relativeToRoot(didPath(canister)))),
    ]
    const file =
      spellings.length === 1
        ? spellings[0]
        : `${spellings.join(" and ")}, which are one file,`
    const names = quoteNames(members.map(({ name }) => name))

    const invalid = members.flatMap((canister) => {
      const problem = methodsProblem(canister.methods)
      return problem ? [`${canister.name}: ${problem}`] : []
    })
    // A list that cannot be projected to costs no request.
    if (invalid.length > 0) {
      if (members.length === 1) return methodsProblem(members[0].methods)
      return (
        `${names} name ${file}, which is not fetched, since a list of methods cannot be projected to ` +
        `(${invalid.join("; ")}). Correct methods and build again.`
      )
    }

    const sourceOf = ({ canisterId, network }: Generated) => {
      const resolved = resolveNetwork(network)
      // A network that is not one is named as given, so the conflict does
      // not hide what is wrong with it.
      return typeof resolved === "string"
        ? {
            key: `${canisterId}\0${JSON.stringify(network)}`,
            label: `${JSON.stringify(network)} (not a network)`,
          }
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
      members.map((canister) => projectionOf(canister).key)
    )
    if (projections.size < 2) return undefined
    const lists = members
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
   * each one `IC_REACTOR_FETCH` names. Canisters that name one `.did`, under
   * any spelling of it, share one fetch when they name one canister on one
   * network and one list of `methods`, and fail with no request when they
   * name more, or a list that cannot be projected to (see `conflictOf`).
   * A `didFile` on disk that nobody asked to fetch again costs no network
   * request, and `@icp-sdk/core` is not even loaded.
   *
   * A fetch that failed is not remembered: the next `buildStart` (a rebuild
   * of `vite build --watch`, or another Vite environment's) tries it again,
   * so a network that comes back is used without restarting Vite.
   *
   * A canister with `methods` has the projection of the live interface to
   * them written instead of the whole interface. A name of `methods` that the
   * interface lacks fails its canisters, and nothing is written.
   *
   * Resolves with the canisters that cannot be generated, since their fetch
   * failed, and the files (by `identify`) this run wrote or found matching
   * the canister, each with the text it fetched, or `undefined` when `signal`
   * was aborted first. Never rejects.
   */
  const fetchMissing = async (
    signal: AbortSignal
  ): Promise<
    { failures: Failure[]; fetched: Map<string, string> } | undefined
  > => {
    if (signal.aborted) return undefined
    const failures: Failure[] = []
    const fetched = new Map<string, string>()
    try {
      const { names: wanted, all } = namesIn(FETCH_VARIABLE, ["all"])
      const asked = (canister: Generated) =>
        all || wanted.includes(canister.name)

      for (const name of all ? [] : wanted) {
        const canister = generated.find((entry) => entry.name === name)
        if (!canister) {
          log.warn(
            `ic-reactor: ${FETCH_VARIABLE} names "${name}", which is not a canister with a didFile in this plugin's options`
          )
        } else if (canister.canisterId === undefined) {
          failures.push({
            canister,
            message: `${FETCH_VARIABLE} asks to fetch its didFile again, but it names no canisterId to fetch it from`,
          })
        }
      }

      // By the file, not by its spelling: two spellings of one file (through
      // a symlinked directory, or in another case where the filesystem
      // ignores case) are one fetch and one write. Fetched once for each
      // spelling, the last write would win, and every canister would generate
      // from the interface of whichever canister was fetched last.
      const byFile = new Map<string, Generated[]>()
      for (const canister of generated) {
        const key = identify(didPath(canister))
        byFile.set(key, [...(byFile.get(key) ?? []), canister])
      }

      const jobs = [...byFile].flatMap(([key, members]) => {
        // Named in messages by the first spelling.
        const file = didPath(members[0])
        // Any canisterId given, `""` included: the fetch says what is wrong
        // with one that is not a canister ID.
        const fetchable = members.filter(
          ({ canisterId }) => canisterId !== undefined
        )
        const again = refetched.has(key)
          ? undefined
          : fetchable.find((canister) => asked(canister))
        const source = again ?? (fs.existsSync(file) ? undefined : fetchable[0])
        if (!source) return []
        const conflict = conflictOf(members, fetchable)
        if (conflict) {
          for (const canister of members) {
            failures.push({ canister, message: conflict })
          }
          return []
        }
        return [{ key, file, members, source, again: !!again }]
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
        if (devServer) justFetched.set(key, result.did)
        try {
          writeDid(target, result.did)
        } catch (writeError) {
          // Only the canisters of this file fail: the others generate.
          justFetched.delete(key)
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
            .filter((canister) => !failed.has(canister))
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
      // Only an omitted list is the whole interface: any other value, `null`
      // or `false` from a JavaScript config, is checked.
      if (canister.methods === undefined) return []
      const problem = methodsProblem(canister.methods)
      if (problem) {
        failures.push({ canister, message: problem })
        return []
      }
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
   * The text of each `didFile` the live check passed, by canister name, for
   * one run: one build, or one dev server. The next `buildStart` of the run (a
   * rebuild of `vite build --watch`, or another Vite environment's) checks it
   * again only when the text changed.
   *
   * A new run starts empty: `configResolved` replaces the map, and Vite
   * resolves the config again for each build and each dev server, a restart
   * (`r` and Enter, or `server.restart()`) included, which keeps this plugin
   * object for an inline config. So a restart checks every canister again,
   * and finds a canister that changed since. A fetch or a check of the run
   * before that ends after the restart writes to that run's map (each
   * `buildStart` takes the map when it is called), which nothing reads.
   *
   * A file this run fetched is the live interface, and passes as fetched. A
   * check that failed, or could not be made, and a fetch that failed, drop
   * the canister's entry: a text that passed before is checked again, so
   * restoring it cannot stand in for a check that passes now.
   *
   * What passes is the text that was checked: the text the run read (see
   * {@link Run}), and only if the file still holds it, unwritten, once the
   * check is done. A file written since the run read it (even saved back) is
   * not recorded, and its next `buildStart` checks it again. A fetched file
   * passes as the text the fetch wrote, not as the file read again.
   */
  let verified = new Map<string, string>()

  /**
   * The failure of each canister whose last live check failed (or could not
   * be made), by canister name. Only a `buildStart` checks: a save under
   * `vite dev` makes no request, so it cannot tell that the file matches the
   * canister again, and it leaves the canister failed, in the log and the
   * overlay, and not generated, whatever the save changed. A later
   * `buildStart` (the dev server's restart, which keeps this plugin object
   * for an inline config) clears it when it checks the canister and the check
   * passes, when it fetched the file, or when the check is off for it
   * (`IC_REACTOR_VERIFY=0`). A pass that `verified` holds from before the
   * failure cannot clear it: the failure dropped it, and a restart starts
   * with none.
   *
   * Only a check of the text the run read counts, failed or passed: one
   * whose file was written before the check was done (even saved back) may
   * have read another text, so it neither sets nor clears a failure here (see
   * `verifyLive`'s `unsure`). A check that read the run's text keeps its
   * verdict when the file is written after it, as for a save made just after
   * the run.
   */
  const liveFailures = new Map<string, Failure>()

  /**
   * The live check: fetch the certified interface of each canister of
   * `wanted` that asks for it (`verify: "live"`, or `IC_REACTOR_VERIFY`) and
   * check its `didFile` against it with `candid-core-cli check`. Canisters
   * that name one file and one canister on one network share one fetch and
   * one check.
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
   * are not checked while `run` read the text fetched. `passed` is the run's
   * `verified`, read and written.
   *
   * The CLI reads the file itself, after the fetch, so a check is of the
   * run's text only if the file is still as the run read it once the check is
   * done. A canister whose file was written before that is `unsure`, whether
   * its check passed or failed: what the check found may be of another text.
   * Its pass is not recorded, and its verdict neither sets nor clears a
   * failure that stands (see `liveFailures`).
   *
   * Resolves with the canisters that cannot be generated, and the `unsure`
   * ones, or `undefined` when `signal` was aborted first. Never rejects.
   */
  const verifyLive = async (
    wanted: Generated[],
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
    // Only an omitted `verify` asks for no check: any other value but
    // "live" (`true`, `false`, a typo) fails the canister, under
    // `IC_REACTOR_VERIFY=0` too, rather than build it unchecked or checked
    // by a guess.
    const valid = wanted.filter((canister) => {
      const problem = verifyProblem(canister.verify)
      if (problem) failures.push({ canister, message: problem })
      return !problem
    })
    const { names: asked, all } = namesIn(VERIFY_VARIABLE, VERIFY_ALL)
    // `0` turns the check off for the run, over `verify: "live"`: a project
    // that checks every build can still build offline.
    const off = asked.find((name) => VERIFY_OFF.includes(name))
    if (off !== undefined) {
      if (asked.length > 1) {
        log.warn(
          `ic-reactor: ${VERIFY_VARIABLE} is "${asked.join(",")}", and ${off} turns the live check off: no canister is checked`
        )
      }
      return { failures, unsure }
    }
    for (const name of all ? [] : asked) {
      const canister = generated.find((entry) => entry.name === name)
      if (!canister) {
        log.warn(
          `ic-reactor: ${VERIFY_VARIABLE} names "${name}", which is not a canister with a didFile in this plugin's options`
        )
      } else if (
        canister.canisterId === undefined &&
        valid.includes(canister)
      ) {
        failures.push({
          canister,
          message: `${VERIFY_VARIABLE} asks for its live check, but it names no canisterId to check its didFile against`,
        })
      }
    }

    const byTarget = new Map<string, Generated[]>()
    for (const canister of valid) {
      const live =
        canister.verify === "live" ||
        (all && canister.canisterId !== undefined) ||
        asked.includes(canister.name)
      if (!live) continue
      if (canister.canisterId === undefined) {
        if (canister.verify === "live") {
          failures.push({
            canister,
            message: `verify is "live", but it names no canisterId to check its didFile against`,
          })
        }
        continue
      }
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
      const label = `${canister.name} (${relativeToRoot(didPath(canister))})`
      byMessage.set(message, [...(byMessage.get(message) ?? []), label])
    }
    return (
      `ic-reactor: could not generate ${failures.length} of ${generated.length} canisters:\n` +
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
   * the browser's error overlay. When a canister is fixed, the overlay is
   * replaced by one that lists only the canisters still failing, or cleared
   * once there are none.
   */
  const publish = (attempted: Generated[], failures: Failure[]): void => {
    // Every attempted canister leaves `unfixed`, not just the first one found
    // there: a save regenerates all the canisters that name the `.did`, and
    // `some` would stop at the first, leaving the others listed in an overlay
    // nothing clears.
    let wasFailing = false
    for (const { name } of attempted) {
      if (unfixed.delete(name)) wasFailing = true
    }
    for (const failure of failures) unfixed.set(failure.canister.name, failure)
    if (failures.length > 0) {
      log.error(describeFailures(failures))
      showOverlay()
    } else if (wasFailing && unfixed.size > 0) {
      // The open overlay still lists the canister that was just fixed.
      showOverlay()
    } else if (wasFailing) {
      // Nothing may have changed on disk when a canister is fixed back to what
      // it generated before, so the page has nothing else to reload it.
      devServer?.ws.send({ type: "full-reload" })
    }
  }

  /**
   * Put the unfixed failures in the error overlay: of the browser that just
   * connected when the WebSocket hands it over (`ws.on("connection")` does),
   * and of every browser otherwise. Vite's client clears the overlay on every
   * hot update it applies, and nothing here sends it again, so the overlay can
   * go while a canister is still broken. The terminal log keeps the error, and
   * the replay on connection shows it after the next full reload.
   */
  const showOverlay = (client?: { send?: (data: string) => void }): void => {
    if (unfixed.size === 0) return
    const payload = {
      type: "error" as const,
      err: {
        message: describeFailures([...unfixed.values()]),
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
    devServer?.ws.send(payload)
  }

  /**
   * A `.did` file was saved: regenerate the canisters that name it, and only
   * those. Canisters with one interface share its file and its run. Saves that
   * arrive while it runs collapse into one run after it, so the last saved
   * file wins without runs piling up.
   */
  const onDidSaved = (file: string): void => {
    const saved = path.normalize(file)
    // By the file: the watcher may report it under any of its spellings.
    const key = identify(saved)
    const affected = generated.filter(
      (canister) => identify(didPath(canister)) === key
    )
    if (affected.length === 0 || queued.has(key)) return
    // The plugin's own write of a fetched file, which the run that fetched it
    // generates.
    const fetched = justFetched.get(key)
    if (fetched !== undefined) {
      justFetched.delete(key)
      try {
        if (fs.readFileSync(saved, "utf-8") === fetched) return
      } catch {
        // Gone again: regenerate, which reports it.
      }
    }
    regenerate(saved, key, affected)
  }

  /**
   * Regenerate `affected`, the canisters that name the `.did` at `saved`
   * (`key`, by `identify`), in a run after the one in flight. See
   * `onDidSaved`.
   *
   * The run reads the file once, when it starts (see {@link Run}). A file
   * written again before it is done is queued once more, and this run takes
   * nothing of it: it publishes nothing, neither a failure nor that a
   * canister is fixed, and the run after it reports the file as it is then.
   */
  const regenerate = (
    saved: string,
    key: string,
    affected: Generated[]
  ): void => {
    queued.add(key)
    const { signal } = stopper
    void serially(async () => {
      queued.delete(key)
      // Dropped when the server closed while it waited.
      if (signal.aborted) return
      // No live check here: a save is never a network request. So a canister
      // whose live check failed stays failed, and is not generated, until a
      // start checks it again (see `liveFailures`). Read here, in the job, and
      // not when the save is queued: a check in flight may still set it.
      const standing: Failure[] = []
      const open: Generated[] = []
      for (const canister of affected) {
        const failure = liveFailures.get(canister.name)
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
        requeue(written)
        return
      }
      publish(affected, [...standing, ...mismatched, ...failures])
    })
  }

  /**
   * Queue the `didFile` of each of `canisters` again, as a save of it does,
   * unless a run is queued for it already: a run under a dev server took
   * nothing of it, since the file was written while the run read it (see
   * `writtenSince`).
   */
  const requeue = (canisters: Generated[]): void => {
    for (const canister of canisters) {
      const key = identify(didPath(canister))
      if (queued.has(key)) continue
      regenerate(
        didPath(canister),
        key,
        generated.filter((other) => identify(didPath(other)) === key)
      )
    }
  }

  /**
   * A `.did` file was deleted: fail the canisters that name it, in the log and
   * the overlay, until it comes back (an `add` regenerates them). The module
   * generated from it is still on disk and would otherwise go on looking
   * current. No generator runs, since there is nothing to read.
   *
   * It waits behind the run in flight, so that run cannot report the file as
   * generated after this has reported it gone.
   */
  const onDidRemoved = (file: string): void => {
    const removed = path.normalize(file)
    const key = identify(removed)
    const affected = generated.filter(
      (canister) => identify(didPath(canister)) === key
    )
    if (affected.length === 0) return
    const { signal } = stopper
    void serially(async () => {
      try {
        // Back already, and the run its `add` queued regenerates it.
        if (signal.aborted || fs.existsSync(removed)) return
        for (const { name } of affected) generatedFrom.delete(name)
        publish(
          affected,
          affected.map((canister) => ({
            canister,
            message:
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
      command = viteCommand

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
      command = config.command
      log = config.logger
      // A new run: a build, or a dev server, a restart's included. Its live
      // checks start again (see `verified`).
      verified = new Map()
    },

    configureServer(server) {
      devServer = server

      // Added here rather than returned as a post hook, so it runs before
      // Vite's own middlewares, which serve the page.
      if (localEnvironment) {
        server.middlewares.use(icEnvMiddleware(localEnvironment))
      }

      if (generated.length === 0) return

      // Hand each browser that connects the failures not yet fixed. Guarded:
      // the peer range spans several Vite majors and `ws.on` is not present on
      // every one of them. Losing the replay is acceptable; throwing out of
      // configureServer is not.
      server.ws.on?.("connection", showOverlay)

      // `.did` files are not in the module graph, so the watcher is told about
      // them. Regenerate from its own events and not from `handleHotUpdate`,
      // which Vite calls only for a file changed in place and only while HMR
      // is on: a `.did` created after startup, or written again by a build
      // tool or `git checkout`, arrives as an `add` event, and a deleted one
      // as `unlink`.
      server.watcher.add(generated.map(didPath))
      server.watcher.on("change", onDidSaved)
      server.watcher.on("add", onDidSaved)
      server.watcher.on("unlink", onDidRemoved)
    },

    // `vite preview` resolves the config with the `serve` command too, and
    // used to inherit the cookie from `server.headers`.
    configurePreviewServer(server) {
      if (localEnvironment) {
        server.middlewares.use(icEnvMiddleware(localEnvironment))
      }
    },

    async buildStart() {
      if (generated.length === 0) return

      // `vite build --watch` rebuilds when a file it watches changes, and a
      // `.did` file is never part of the module graph. Registered here, a save
      // starts a rebuild, and the rebuild's buildStart regenerates.
      for (const canister of generated) this.addWatchFile(didPath(canister))

      const { signal } = stopper
      // This run's passes, taken now: a restart starts another run (and
      // replaces `verified`) before the old server closes, so a fetch or a
      // check of this run that ends after it writes only to this run's map.
      const passed = verified
      const outcome = await serially(async () => {
        // A canister whose `.did` could not be fetched has nothing to
        // generate from: it fails with the reason, and the others generate.
        // So does one whose file lacks a name of its `methods`, and one that
        // failed its live check.
        const fetchedNow = await fetchMissing(signal)
        if (!fetchedNow) return undefined
        const { fetched } = fetchedNow
        const failures = [...fetchedNow.failures]
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
        // From here on, one reading of each file (see `Run`).
        const run = startRun(generated)
        const remaining = () => {
          const failed = new Set(failures.map(({ canister }) => canister))
          return generated.filter((canister) => !failed.has(canister))
        }
        const mismatched = await compareMethods(remaining(), run, signal)
        if (!mismatched) return undefined
        failures.push(...mismatched)
        const checking = remaining()
        const live = await verifyLive(checking, fetched, passed, run, signal)
        if (!live) return undefined
        // Only a check of the text the run read sets or clears a failure
        // that stands, whether it passed or failed (see `liveFailures`).
        for (const canister of checking) {
          if (!live.unsure.has(canister)) liveFailures.delete(canister.name)
        }
        for (const failure of live.failures) {
          if (!live.unsure.has(failure.canister)) {
            liveFailures.set(failure.canister.name, failure)
          }
        }
        failures.push(...live.failures)
        const generation = await generateNow(remaining(), false, run, signal)
        if (!generation) return undefined
        return {
          failures: dedupe([...failures, ...generation]),
          written: writtenSince(run, generated),
        }
      })
      if (!outcome) return
      // A canister whose file was written while this run read it takes
      // nothing of the run (see `writtenSince`): none of the failures its
      // steps found, which may be of another text, and no success.
      const { written } = outcome
      const taken = generated.filter((canister) => !written.includes(canister))
      let failures = outcome.failures.filter(({ canister }) =>
        taken.includes(canister)
      )
      if (devServer) {
        // Queued again, as a save is: that run reports it.
        requeue(written)
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
      if (failures.length > 0 && (failOnError ?? command === "build")) {
        // A build that exits 0 would ship whatever stale bindings are still on
        // disk, which no longer match the canister.
        this.error(describeFailures(failures))
      }
      // Under a dev server, nothing is said of a written canister here, not
      // even that it is fixed: the run queued for it reports it.
      publish(devServer ? taken : generated, failures)
    },

    // The end of a build, and the close of a dev server, which Vite reports
    // here once for each of its environments.
    closeBundle() {
      stopper.abort()
      stopper = new AbortController()
    },
  }

  return plugin
}

/** One readable line for whatever was thrown. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
