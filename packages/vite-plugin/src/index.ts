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
   *   generates nothing and is only named in the cookie.
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
   *   fetch it again with `IC_REACTOR_FETCH`.
   * - `verify`: `"live"` checks the `didFile` on disk against the live
   *   canister's certified interface at the start of each build and dev
   *   server (`candid-core-cli check`). `IC_REACTOR_VERIFY=1` (or `true`,
   *   `all`, or canister names separated by commas) does the same for the
   *   canisters with a `canisterId`, and `IC_REACTOR_VERIFY=0` (or `false`)
   *   turns the check off for the run, `verify: "live"` included. A method of the file that the canister no longer
   *   has, whose mode changed, or whose types are no longer compatible fails
   *   the canister, under `failOnError`; a compatible change is logged as a
   *   warning. A check that cannot read the canister fails it too.
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
      methods?: string[]
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
   * Default: true
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
   * serving.
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
  const { canisters = {}, injectEnvironment = true, failOnError } = options
  const names = Object.keys(canisters)

  const configuredCanisterIds = Object.fromEntries(
    names.flatMap((name) => {
      const { canisterId } = canisters[name]
      return canisterId ? [[name, canisterId]] : []
    })
  )

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

  const readDid = (canister: Generated): string | undefined => {
    try {
      return fs.readFileSync(didPath(canister), "utf-8")
    } catch {
      return undefined
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
   * @param force - Generate even a canister whose `.did` text is unchanged.
   * @param signal - The `stopper` signal current when the run was asked for.
   */
  const generateNow = async (
    wanted: Generated[],
    force: boolean,
    signal: AbortSignal
  ): Promise<Failure[] | undefined> => {
    if (signal.aborted) return undefined
    try {
      const sources = new Map(
        wanted.map((canister) => [canister.name, readDid(canister)])
      )
      const stale = wanted.filter(
        ({ name }) =>
          force ||
          sources.get(name) === undefined ||
          generatedFrom.get(name) !== sources.get(name)
      )
      if (stale.length === 0) return []

      let cli: string
      try {
        cli = resolveCliBin(projectRoot)
      } catch (error) {
        return stale.map((canister) => ({ canister, message: describe(error) }))
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
        const names = members.map(({ name }) => name).join(", ")
        if (outcome.status === "failed") {
          for (const canister of members) {
            generatedFrom.delete(canister.name)
            failures.push({ canister, message: outcome.failure ?? "" })
          }
          continue
        }
        for (const { name } of members) {
          const source = sources.get(name)
          if (source !== undefined) generatedFrom.set(name, source)
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
   * or `undefined` when they can: the ones that name a `canisterId`
   * (`fetchable`) name different canisters, or one canister on different
   * networks, so whose interface the file is cannot be told. Asked only when
   * the file is to be fetched: a file on disk that nobody asked to fetch again
   * is read by them all, whatever their `canisterId`s (two ICRC-1 ledgers
   * on one `icrc1.did`).
   */
  const conflictOf = (
    members: Generated[],
    fetchable: Generated[]
  ): string | undefined => {
    const sourceOf = ({ canisterId, network, methods }: Generated) => {
      const resolved = resolveNetwork(network)
      // One file holds one projection: canisters that project it to other
      // methods name other files.
      const projection = Array.isArray(methods)
        ? {
            key: JSON.stringify(methodList(methods)),
            label: ` projected to ${listNames(methodList(methods))}`,
          }
        : { key: "", label: "" }
      // A network that is not one is named as given, so the conflict does
      // not hide what is wrong with it.
      return typeof resolved === "string"
        ? {
            key: `${canisterId}\0${JSON.stringify(network)}\0${projection.key}`,
            label: `${JSON.stringify(network)} (not a network)${projection.label}`,
          }
        : {
            key: `${canisterId}\0${resolved.host}\0${resolved.fetchRootKey}\0${projection.key}`,
            label: `${resolved.label}${projection.label}`,
          }
    }
    const sources = new Set(fetchable.map((canister) => sourceOf(canister).key))
    if (sources.size < 2) return undefined
    const spellings = [
      ...new Set(members.map((canister) => relativeToRoot(didPath(canister)))),
    ]
    const file =
      spellings.length === 1
        ? spellings[0]
        : `${spellings.join(" and ")}, which are one file,`
    const fetches = fetchable
      .map(
        (canister) =>
          `${canister.name}: ${canister.canisterId} on ${sourceOf(canister).label}`
      )
      .join("; ")
    return (
      `${quoteNames(members.map(({ name }) => name))} name ${file} but not one canister to fetch it from ` +
      `(${fetches}): which one's interface the file holds cannot be told, so it is not fetched. ` +
      `Give each canister a didFile of its own, or write ${spellings[0]} yourself and the plugin reads it instead of fetching.`
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
   * network, and fail with no fetch when they name more (see `conflictOf`).
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
   * the canister, or `undefined` when `signal` was aborted first. Never
   * rejects.
   */
  const fetchMissing = async (
    signal: AbortSignal
  ): Promise<{ failures: Failure[]; fetched: Set<string> } | undefined> => {
    if (signal.aborted) return undefined
    const failures: Failure[] = []
    const fetched = new Set<string>()
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
        } else if (!canister.canisterId) {
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
        const fetchable = members.filter(({ canisterId }) => canisterId)
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
        // A list that cannot be projected to costs no request.
        const problem = methodsProblem(source.methods)
        if (problem) {
          for (const canister of members) {
            failures.push({ canister, message: problem })
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
          fetched.add(key)
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
        fetched.add(key)
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
    if (!source.methods) return { ok: true, did: result.did, from }

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
   * A file that cannot be listed (it does not compile) is left to the
   * generator, which reports it. Resolves with the canisters that cannot be
   * generated, or `undefined` when `signal` was aborted first. Never rejects.
   */
  const compareMethods = async (
    wanted: Generated[],
    signal: AbortSignal
  ): Promise<Failure[] | undefined> => {
    const failures: Failure[] = []
    const jobs = wanted.flatMap((canister) => {
      if (!canister.methods) return []
      const problem = methodsProblem(canister.methods)
      if (problem) {
        failures.push({ canister, message: problem })
        return []
      }
      const text = readDid(canister)
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
      if (!listed.ok) continue
      const file = relativeToRoot(didPath(canister))
      const lacking = methods.filter((name) => !listed.methods.includes(name))
      const extra = listed.methods.filter((name) => !methods.includes(name))
      const fix = canister.canisterId
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
   * The text of each `didFile` the live check passed, by canister name. The
   * next `buildStart` (a rebuild of `vite build --watch`, or another Vite
   * environment's) checks it again only when the text changed. A check that
   * failed is not remembered, and runs again.
   */
  const verified = new Map<string, string>()

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
   * are not checked. Resolves with the canisters that cannot be generated, or
   * `undefined` when `signal` was aborted first. Never rejects.
   */
  const verifyLive = async (
    wanted: Generated[],
    fetched: Set<string>,
    signal: AbortSignal
  ): Promise<Failure[] | undefined> => {
    const failures: Failure[] = []
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
      return failures
    }
    for (const name of all ? [] : asked) {
      const canister = generated.find((entry) => entry.name === name)
      if (!canister) {
        log.warn(
          `ic-reactor: ${VERIFY_VARIABLE} names "${name}", which is not a canister with a didFile in this plugin's options`
        )
      } else if (!canister.canisterId && wanted.includes(canister)) {
        failures.push({
          canister,
          message: `${VERIFY_VARIABLE} asks for its live check, but it names no canisterId to check its didFile against`,
        })
      }
    }

    const byTarget = new Map<string, Generated[]>()
    for (const canister of wanted) {
      const live =
        canister.verify === "live" ||
        (all && !!canister.canisterId) ||
        asked.includes(canister.name)
      if (!live) continue
      if (!canister.canisterId) {
        if (canister.verify === "live") {
          failures.push({
            canister,
            message: `verify is "live", but it names no canisterId to check its didFile against`,
          })
        }
        continue
      }
      const key = identify(didPath(canister))
      const text = readDid(canister)
      // A file just fetched is the live interface; one that is missing is
      // the generator's to report.
      if (fetched.has(key) || text === undefined) continue
      if (verified.get(canister.name) === text) continue
      const target = JSON.stringify([
        key,
        canister.canisterId,
        resolveNetwork(canister.network),
      ])
      byTarget.set(target, [...(byTarget.get(target) ?? []), canister])
    }
    if (byTarget.size === 0) return failures

    const outcomes = await Promise.all(
      [...byTarget.values()].map(async (members) => ({
        members,
        outcome: await checkLive(members[0], signal),
      }))
    )
    if (signal.aborted) return undefined
    for (const { members, outcome } of outcomes) {
      if (outcome.ok) {
        for (const canister of members)
          verified.set(canister.name, outcome.text)
        continue
      }
      for (const canister of members) {
        failures.push({ canister, message: outcome.message })
      }
    }
    return failures
  }

  /**
   * The live check of one canister: what failed, or the text it passed. Logs
   * a compatible change. Never rejects.
   */
  const checkLive = async (
    canister: Generated,
    signal: AbortSignal
  ): Promise<{ ok: true; text: string } | { ok: false; message: string }> => {
    try {
      const file = didPath(canister)
      const didFile = relativeToRoot(file)
      // Read before the fetch: what passes is the text that was checked.
      const text = readDid(canister)
      if (text === undefined)
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
        log.warn(
          `${label} ${where} is compatible with ${didFile}, with ${count} warning${count === 1 ? "" : "s"} ` +
            `(a value at each path now decodes as null):\n` +
            firstLines(warnings.map(describeFinding))
              .map((line) => `  ${line}`)
              .join("\n") +
            `\nTo take the change, ${fetchAgain}.`
        )
        return { ok: true, text }
      }

      // Compatible with no finding: unchanged for the file's methods, or
      // changed compatibly (an added optional field, an added variant arm in
      // an argument). The projections of both sides to the file's methods have
      // one identity exactly when the methods are unchanged.
      const changed = await changedFor(context, file, live.did)
      if (signal.aborted) return { ok: false, message: "was stopped" }
      if (changed === true) {
        log.warn(
          `${label} ${where} changed compatibly for the methods of ${didFile}: its module still works. ` +
            `To take the change, ${fetchAgain}.`
        )
      } else if (changed === false) {
        log.info(`${label} ${didFile} matches the live interface of ${where}`)
      } else {
        log.info(
          `${label} ${didFile} is compatible with the live interface of ${where}`
        )
      }
      return { ok: true, text }
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
    queued.add(key)
    log.info(
      `ic-reactor: ${relativeToRoot(saved)} changed, regenerating ${affected.map(({ name }) => name).join(", ")}`
    )
    const { signal } = stopper
    void serially(async () => {
      queued.delete(key)
      // No live check here: a save is never a network request.
      const mismatched = await compareMethods(affected, signal)
      if (!mismatched) return
      const failed = new Set(mismatched.map(({ canister }) => canister))
      const failures = await generateNow(
        affected.filter((canister) => !failed.has(canister)),
        true,
        signal
      )
      if (failures) publish(affected, [...mismatched, ...failures])
    })
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
              (canister.canisterId
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
      const failures = await serially(async () => {
        // A canister whose `.did` could not be fetched has nothing to
        // generate from: it fails with the reason, and the others generate.
        // So does one whose file lacks a name of its `methods`, and one that
        // failed its live check.
        const fetchedNow = await fetchMissing(signal)
        if (!fetchedNow) return undefined
        const { fetched } = fetchedNow
        const failures = [...fetchedNow.failures]
        const remaining = () => {
          const failed = new Set(failures.map(({ canister }) => canister))
          return generated.filter((canister) => !failed.has(canister))
        }
        const mismatched = await compareMethods(remaining(), signal)
        if (!mismatched) return undefined
        failures.push(...mismatched)
        const unverified = await verifyLive(remaining(), fetched, signal)
        if (!unverified) return undefined
        failures.push(...unverified)
        const generation = await generateNow(remaining(), false, signal)
        return generation && dedupe([...failures, ...generation])
      })
      if (!failures) return
      if (failures.length > 0 && (failOnError ?? command === "build")) {
        // A build that exits 0 would ship whatever stale bindings are still on
        // disk, which no longer match the canister.
        this.error(describeFailures(failures))
      }
      publish(generated, failures)
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
