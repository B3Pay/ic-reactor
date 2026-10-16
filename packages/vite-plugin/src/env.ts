/**
 * Environment Injection Utilities
 *
 * Handles detecting the local IC environment via the `icp` CLI
 * and building the `ic_env` cookie for the browser.
 */

import { execFile } from "child_process"
import fs from "node:fs"
import path from "node:path"
import { describeError } from "./describe-value.js"

export interface IcEnvironment {
  environment: string
  rootKey: string
  proxyTarget: string
  /**
   * Each canister ID `icp` reported, by canister name. A `Map`: a name is any
   * text, and `__proto__` or `constructor` is kept as given, where a plain
   * object would reach `Object.prototype`.
   */
  canisterIds: Map<string, string>
  internetIdentityProvider?: string
}

export interface IcEnvironmentDetection {
  /** The detected environment, or `null` when `icp` could not answer. */
  environment: IcEnvironment | null
  /**
   * Why detection came back empty or partial — the `icp` stderr where we have
   * it. Detection failing is routine on a machine with no local replica, so
   * these are handed back for the caller to log at its own level rather than
   * printed here.
   */
  diagnostics: string[]
  /**
   * `true` when no `icp` command could be started at all (`ENOENT`), as
   * opposed to an `icp` that ran and found no network.
   */
  icpNotFound?: boolean
}

/**
 * How long one `icp` command may run. The dev server runs detection while a
 * page request waits for it, so a command that never exits must not hold the
 * page forever.
 */
const ICP_TIMEOUT_MS = 10_000

/**
 * Run `icp` with `args` in `cwd` and resolve with its stdout.
 *
 * Asynchronous, so a page request that waits for detection does not block the
 * dev server's other requests. stderr is captured rather than shown, so a
 * failure can explain itself: it only reaches the terminal if the caller prints
 * the diagnostics. stdin is closed, so a command that asks a question fails
 * instead of waiting for an answer.
 */
function runIcp(args: string[], cwd: string): Promise<string> {
  const icp = icpCommand(cwd)
  return new Promise((resolve, reject) => {
    const child = execFile(
      icp.file,
      [...icp.args, ...args],
      {
        cwd,
        encoding: "utf-8",
        timeout: ICP_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error, { stderr }))
        } else {
          resolve(stdout)
        }
      }
    )
    child.stdin?.end()
  })
}

/**
 * How to start `icp` for the app rooted at `projectRoot`.
 *
 * On Windows, npm links the bin of icp-cli's npm package
 * (`@icp-sdk/icp-cli`) as `node_modules/.bin/icp.cmd`, and `execFile` cannot
 * start a `.cmd` file: it searches `PATH` for `.com` and `.exe` only. So on
 * Windows the package's own bin script is run with this Node, as the
 * generator's is, when the app installed the package, or else npm's global
 * prefix (`%APPDATA%\npm`) holds it; otherwise `icp` is looked up on `PATH`,
 * where a native `icp.exe` is found. No shell is used, so a canister name is
 * never parsed by one. Elsewhere `icp` is looked up on `PATH` as before.
 */
export function icpCommand(
  projectRoot: string,
  platform: NodeJS.Platform = process.platform,
  appData: string | undefined = process.env.APPDATA
): { file: string; args: string[] } {
  if (platform === "win32") {
    const bin =
      installedIcpBin(projectRoot) ??
      (appData
        ? icpBinIn(path.join(appData, "npm", "node_modules"))
        : undefined)
    if (bin) return { file: process.execPath, args: [bin] }
  }
  return { file: "icp", args: [] }
}

/**
 * The bin script of the `@icp-sdk/icp-cli` the app installed, if any: the
 * first `node_modules/@icp-sdk/icp-cli` in `projectRoot` or a directory
 * above it, as Node would find it, but never through `NODE_PATH`, which a
 * package manager's bin shims point at its own store.
 */
function installedIcpBin(projectRoot: string): string | undefined {
  for (let dir = path.resolve(projectRoot); ; dir = path.dirname(dir)) {
    const bin = icpBinIn(path.join(dir, "node_modules"))
    if (bin !== undefined) return bin || undefined
    if (path.dirname(dir) === dir) return undefined
  }
}

/**
 * The bin script of the `@icp-sdk/icp-cli` in `nodeModules`: `undefined` when
 * the package is not there, `""` when it is but names no usable bin.
 */
function icpBinIn(nodeModules: string): string | undefined {
  const manifestPath = path.join(
    nodeModules,
    "@icp-sdk",
    "icp-cli",
    "package.json"
  )
  if (!fs.existsSync(manifestPath)) return undefined
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
      bin?: string | Record<string, string>
    }
    const bin =
      typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.icp
    // Through the real path: under pnpm the bin script finds its
    // platform-specific sibling package only from there.
    return bin
      ? path.resolve(fs.realpathSync(path.dirname(manifestPath)), bin)
      : ""
  } catch {
    return ""
  }
}

/**
 * How to make `icp` runnable here. On Windows the plugin runs an installed
 * `@icp-sdk/icp-cli` itself, so installing it is enough; elsewhere it runs
 * `icp` from `PATH`, which a local install reaches only through an npm script.
 */
export function installIcpAdvice(
  platform: NodeJS.Platform = process.platform
): string {
  return platform === "win32"
    ? "Install icp-cli in the app (npm install --save-dev @icp-sdk/icp-cli) or globally with npm, or put a native icp.exe on PATH."
    : "Put `icp` on PATH (npm install --global @icp-sdk/icp-cli), or install it in the app and run vite from an npm script."
}

/**
 * Detect the IC environment using the `icp` CLI.
 *
 * @param projectRoot - Directory `icp` runs in. `icp` finds its project by
 * looking for `icp.yaml` there and in each parent directory, so this has to be
 * the app's root and not wherever the process happened to start.
 */
export async function getIcEnvironmentInfo(
  canisterNames: string[],
  projectRoot: string = process.cwd()
): Promise<IcEnvironmentDetection> {
  const networkName = process.env.ICP_ENVIRONMENT || "local"
  const diagnostics: string[] = []

  try {
    const networkStatus = JSON.parse(
      await runIcp(
        ["network", "status", "-e", networkName, "--json"],
        projectRoot
      )
    )

    const rootKey = networkStatus.root_key
    const proxyTarget =
      networkStatus.api_url ||
      networkStatus.gateway_url ||
      (networkStatus.port
        ? `http://127.0.0.1:${networkStatus.port}`
        : undefined)

    if (!proxyTarget) {
      diagnostics.push(
        `\`icp network status -e ${networkName}\` reported no api_url, gateway_url or port`
      )
      return { environment: null, diagnostics }
    }

    const canisterIds = new Map<string, string>()

    // One at a time, as icp is run from a terminal. Each command reads the
    // project's state, and these are not known to be safe to run at once.
    for (const name of canisterNames) {
      try {
        const canisterId = (
          await runIcp(
            // `--` ends icp's options, so that a name that begins with `-`,
            // which icp allows, is read as the canister's name and not as a
            // flag: `--help` would print icp's help, and exit 0, for an ID.
            ["canister", "status", "-e", networkName, "-i", "--", name],
            projectRoot
          )
        ).trim()

        if (canisterId) {
          canisterIds.set(name, canisterId)
        }
      } catch (error) {
        // Canister might not exist or be deployed yet — expected for
        // internet_identity, which is added to the lookup list unconditionally.
        diagnostics.push(
          `\`icp canister status -e ${networkName} -i -- ${name}\` failed: ${describeExecError(error)}`
        )
      }
    }

    const internetIdentityProvider =
      !canisterIds.get("internet_identity") &&
      isLocalhostGateway(proxyTarget) &&
      networkName !== "ic"
        ? localInternetIdentityProvider(proxyTarget)
        : undefined

    return {
      environment: {
        environment: networkName,
        rootKey,
        proxyTarget,
        canisterIds,
        internetIdentityProvider,
      },
      diagnostics,
    }
  } catch (error) {
    if ((error as { code?: unknown } | undefined)?.code === "ENOENT") {
      diagnostics.push(
        `\`icp\` could not be run: no \`icp\` command was found. ${installIcpAdvice()}`
      )
      return { environment: null, diagnostics, icpNotFound: true }
    }
    diagnostics.push(
      `\`icp network status -e ${networkName}\` failed: ${describeExecError(error)}`
    )
    return { environment: null, diagnostics }
  }
}

/**
 * Whether the `ic_env` cookie can carry the canister `name`. The cookie joins
 * its `<key>=<value>` entries with `&` and URI-encodes them as one text, as
 * the asset canister writes it, and `@icp-sdk/core` reads it back by
 * splitting that text at each `&`, and each entry at its first `=`. A name
 * that holds `&` or `=` is read back as another key, and can take the place
 * of another canister's entry or of the root key; text with a lone surrogate
 * cannot be URI-encoded at all. Every name `icp` gives a canister (ASCII
 * letters, digits, `_` and `-`) is one the cookie carries.
 */
export function cookieCarries(name: string): boolean {
  if (name.includes("&") || name.includes("=")) return false
  try {
    encodeURIComponent(name)
    return true
  } catch {
    return false
  }
}

/**
 * Build the `ic_env` cookie string.
 * Format: `ic_root_key=<key>&PUBLIC_CANISTER_ID:<name>=<id>&...`
 *
 * @param canisterIds - Each canister's ID, by canister name, in the order the
 * cookie lists them. Every name is one it can carry (`cookieCarries`).
 */
export function buildIcEnvCookie(
  canisterIds: ReadonlyMap<string, string>,
  rootKey?: string,
  internetIdentityProvider?: string
): string {
  const parts = rootKey ? [`ic_root_key=${rootKey}`] : []

  for (const [name, id] of canisterIds) {
    parts.push(`PUBLIC_CANISTER_ID:${name}=${id}`)
  }

  if (internetIdentityProvider) {
    parts.push(`INTERNET_IDENTITY_PROVIDER=${internetIdentityProvider}`)
  }

  return encodeURIComponent(parts.join("&"))
}

/**
 * Turn whatever `icp` failed with into one readable line.
 *
 * The interesting part is almost always the captured stderr — the thrown
 * Error's own message is just "Command failed: icp ..." — but stderr is absent
 * when the binary itself is missing (ENOENT), so fall back to the message.
 */
function describeExecError(error: unknown): string {
  const stderr = (error as { stderr?: Buffer | string } | undefined)?.stderr
  const text = typeof stderr === "string" ? stderr : stderr?.toString("utf-8")
  const trimmed = text?.trim()

  if (trimmed) {
    return trimmed
  }

  return describeError(error)
}

function isLocalhostGateway(proxyTarget: string): boolean {
  try {
    const { hostname } = new URL(proxyTarget)
    return hostname === "localhost" || hostname === "127.0.0.1"
  } catch {
    return false
  }
}

function localInternetIdentityProvider(proxyTarget: string): string {
  const { protocol, port } = new URL(proxyTarget)
  const portSuffix = port ? `:${port}` : ""
  return `${protocol}//id.ai.localhost${portSuffix}/authorize`
}
