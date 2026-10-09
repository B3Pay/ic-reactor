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
 *   canister names a `canisterId` (see fetch.ts). Nothing is fetched for a
 *   `didFile` that exists, unless `IC_REACTOR_FETCH` asks for it.
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
import { fetchCandid, writeDid, type CanisterNetwork } from "./fetch.js"
import { GENERATE_TIMEOUT_MS, generate, resolveCliBin } from "./generate.js"

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
   * - `network`: where the canister to fetch is. `"ic"`, mainnet, checked
   *   against the mainnet root key; `"local"`, icp-cli's local network on
   *   `http://127.0.0.1:8000`, whose root key is fetched from it; or
   *   `{ host }`, any other replica, whose root key is fetched only when the
   *   host is local (`localhost`, `*.localhost` or a loopback address) and is
   *   mainnet's otherwise. Only a fetch reads it. Default: `"ic"`.
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
}

/** The environment variable that asks for a `didFile` to be fetched again. */
const FETCH_VARIABLE = "IC_REACTOR_FETCH"

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
    } = canisters[name]
    return didFile === undefined
      ? []
      : [{ name, didFile, outDir, canisterId, network }]
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

  /** The `.did` files waiting for a run that has not started. See `onDidSaved`. */
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
   * The `.did` files `IC_REACTOR_FETCH` has had fetched again, by absolute
   * path. A request is served once in the life of the plugin: the second
   * `buildStart` of Vite 6 and later, and each rebuild of
   * `vite build --watch`, read the file it wrote.
   */
  const refetched = new Set<string>()

  /**
   * The text this plugin last wrote to each `.did` it fetched, by absolute
   * path, until the watcher reports that write. The run that fetched the file
   * generates it, so the watcher's event for that write starts no second run.
   */
  const justFetched = new Map<string, string>()

  /**
   * Write each `didFile` that a canister names a `canisterId` for and that is
   * not on disk, from the live canister's certified `candid:service`, and
   * each one `IC_REACTOR_FETCH` names. Canisters that name one `.did` share
   * one fetch, from the first of them with a `canisterId` (or the first one
   * `IC_REACTOR_FETCH` names). A `didFile` on disk that nobody asked to fetch
   * again costs no network request, and `@icp-sdk/core` is not even loaded.
   *
   * Resolves with the canisters that cannot be generated, since their fetch
   * failed, or `undefined` when `signal` was aborted first. Never rejects.
   */
  const fetchMissing = async (
    signal: AbortSignal
  ): Promise<Failure[] | undefined> => {
    if (signal.aborted) return undefined
    const failures: Failure[] = []
    try {
      const wanted = (process.env[FETCH_VARIABLE] ?? "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean)
      const all = wanted.includes("all")
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

      const byFile = new Map<string, Generated[]>()
      for (const canister of generated) {
        const file = didPath(canister)
        byFile.set(file, [...(byFile.get(file) ?? []), canister])
      }

      const jobs = [...byFile].flatMap(([file, members]) => {
        const fetchable = members.filter(({ canisterId }) => canisterId)
        const again = refetched.has(file)
          ? undefined
          : fetchable.find((canister) => asked(canister))
        const source = again ?? (fs.existsSync(file) ? undefined : fetchable[0])
        return source ? [{ file, members, source, again: !!again }] : []
      })
      if (jobs.length === 0) return failures

      const results = await Promise.all(
        jobs.map(async (job) => ({
          ...job,
          result: await fetchCandid({
            canisterId: job.source.canisterId as string,
            network: job.source.network,
            didFile: relativeToRoot(job.file),
            signal,
          }),
        }))
      )
      if (signal.aborted) return undefined

      for (const { file, members, source, again, result } of results) {
        if (again) refetched.add(file)
        if (!result.ok) {
          for (const canister of members) {
            failures.push({ canister, message: result.message })
          }
          continue
        }
        const from = `the certified candid:service of ${source.canisterId} on ${result.network}`
        let before: string | undefined
        try {
          before = fs.readFileSync(file, "utf-8")
        } catch {
          before = undefined
        }
        if (before === result.did) {
          log.info(`ic-reactor: ${relativeToRoot(file)} matches ${from}`)
          continue
        }
        justFetched.set(file, result.did)
        writeDid(file, result.did)
        log.info(
          `ic-reactor: ${before === undefined ? "wrote" : "rewrote"} ${relativeToRoot(file)} from ${from} ` +
            `(${Buffer.byteLength(result.did)} bytes): commit it with the app`
        )
      }
      // A canister is reported once, for the first reason it failed.
      return failures.filter(
        (failure, index) =>
          failures.findIndex(
            ({ canister }) => canister === failure.canister
          ) === index
      )
    } catch (error) {
      if (signal.aborted) return undefined
      const failed = new Set(failures.map(({ canister }) => canister))
      return [
        ...failures,
        ...generated
          .filter((canister) => !failed.has(canister))
          .map((canister) => ({ canister, message: describe(error) })),
      ]
    }
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
    const affected = generated.filter((canister) => didPath(canister) === saved)
    if (affected.length === 0 || queued.has(saved)) return
    // The plugin's own write of a fetched file, which the run that fetched it
    // generates.
    const fetched = justFetched.get(saved)
    if (fetched !== undefined) {
      justFetched.delete(saved)
      try {
        if (fs.readFileSync(saved, "utf-8") === fetched) return
      } catch {
        // Gone again: regenerate, which reports it.
      }
    }
    queued.add(saved)
    log.info(
      `ic-reactor: ${relativeToRoot(saved)} changed, regenerating ${affected.map(({ name }) => name).join(", ")}`
    )
    const { signal } = stopper
    void serially(async () => {
      queued.delete(saved)
      const failures = await generateNow(affected, true, signal)
      if (failures) publish(affected, failures)
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
    const affected = generated.filter(
      (canister) => didPath(canister) === removed
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
        const unfetched = await fetchMissing(signal)
        if (!unfetched) return undefined
        const failed = new Set(unfetched.map(({ canister }) => canister))
        const failures = await generateNow(
          generated.filter((canister) => !failed.has(canister)),
          false,
          signal
        )
        return failures && [...unfetched, ...failures]
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
