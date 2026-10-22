/**
 * Environment Injection Utilities
 *
 * Handles detecting the local IC environment via the `icp` CLI
 * and building the `ic_env` cookie for the browser.
 */

import { spawn } from "child_process"
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
 * Run `icp` with `args` in `cwd` and resolve with its stdout. It rejects as
 * `execFile` did: with the error that kept `icp` from starting (`ENOENT`), or
 * with "Command failed: ..." and the exit `code`, the `signal`, and `killed`
 * when the timeout killed it, each with the `cmd` and the `stderr` it wrote.
 * Once the timeout has fired it rejects even if `icp` then exits 0, since its
 * pipes are closed by then and what it wrote may be cut short.
 *
 * Asynchronous, so a page request that waits for detection does not block the
 * dev server's other requests. stderr is captured rather than shown, so a
 * failure can explain itself: it only reaches the terminal if the caller prints
 * the diagnostics. stdin is closed, so a command that asks a question fails
 * instead of waiting for an answer.
 *
 * Elsewhere than on Windows, npm's `icp` is a Node script that starts the
 * native binary as its child, on the script's pipes, and killing the script
 * leaves that child running: each page load while detection is incomplete
 * could leave one more (#980). So there `icp` starts in a session and process
 * group of its own (`detached`), and the timeout kills the whole group. The
 * cost: the terminal's Ctrl-C and hang-up no longer reach an `icp` that is
 * running when the dev server stops. Windows runs `icp.exe` itself
 * (`icpCommand`), and the timeout kills that.
 *
 * @param timeoutMs - How long it may run; the tests shorten it.
 */
export function runIcp(
  args: string[],
  cwd: string,
  timeoutMs: number = ICP_TIMEOUT_MS
): Promise<string> {
  const icp = icpCommand(cwd)
  const argv = [...icp.args, ...args]
  const command = [icp.file, ...argv].join(" ")
  const group = process.platform !== "win32"
  return new Promise((resolve, reject) => {
    let stdout = ""
    let stderr = ""
    let killed = false
    let settled = false
    const settle = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(Object.assign(error, { stderr }))
      else resolve(stdout)
    }

    const child = spawn(icp.file, argv, {
      cwd,
      env: icp.env && { ...process.env, ...icp.env },
      detached: group,
      windowsHide: true,
    })
    const timer = setTimeout(() => {
      killed = true
      try {
        if (group && child.pid !== undefined) {
          process.kill(-child.pid, "SIGTERM")
        } else {
          child.kill("SIGTERM")
        }
      } catch {
        child.kill("SIGTERM")
      }
      // A process outside the group could still hold the pipes open.
      child.stdout?.destroy()
      child.stderr?.destroy()
    }, timeoutMs)

    child.stdout?.setEncoding("utf-8")
    child.stderr?.setEncoding("utf-8")
    child.stdout?.on("data", (chunk: string) => (stdout += chunk))
    child.stderr?.on("data", (chunk: string) => (stderr += chunk))
    child.on("error", (error) => settle(Object.assign(error, { cmd: command })))
    child.on("close", (code, signal) => {
      if (code === 0 && !killed) {
        settle()
        return
      }
      settle(
        Object.assign(new Error(`Command failed: ${command}\n${stderr}`), {
          code,
          signal,
          killed,
          cmd: command,
        })
      )
    })
    child.stdin?.end()
  })
}

/**
 * How to start `icp` for the app rooted at `projectRoot`.
 *
 * On Windows, npm links the bin of icp-cli's npm package
 * (`@icp-sdk/icp-cli`) as `node_modules/.bin/icp.cmd`, and `spawn` cannot
 * start a `.cmd` file: it searches `PATH` for `.com` and `.exe` only. So on
 * Windows, when the app installed the package, or else npm's global prefix
 * (`%APPDATA%\npm`) holds it, the native `icp.exe` that the package's bin
 * script would start is run directly, so that a timeout kills `icp` itself;
 * killing the script would leave its child holding the output pipes, and the
 * command would never settle. When that `icp.exe` is not where the script
 * looks, the script is run with this Node, as the generator's is, and reports
 * why. Otherwise `icp` is looked up on `PATH`, where a native `icp.exe` is
 * found. No shell is used, so a canister name is never parsed by one.
 * Elsewhere `icp` is looked up on `PATH` as before.
 */
export function icpCommand(
  projectRoot: string,
  platform: NodeJS.Platform = process.platform,
  appData: string | undefined = process.env.APPDATA
): { file: string; args: string[]; env?: Record<string, string> } {
  if (platform === "win32") {
    const bin =
      installedIcpBin(projectRoot) ??
      (appData
        ? icpBinIn(path.join(appData, "npm", "node_modules"))
        : undefined)
    if (bin) {
      const native = nativeIcpOf(bin)
      // The variable the bin script sets for the binary it starts.
      if (native)
        return { file: native, args: [], env: { ICP_CLI_DIST: "npm" } }
      return { file: process.execPath, args: [bin] }
    }
  }
  return { file: "icp", args: [] }
}

/**
 * The `icp.exe` that icp-cli's bin script `script` starts on Windows, in the
 * two places the script looks for it: the platform package beside icp-cli's
 * own (a flat or global install), or inside icp-cli's `node_modules`.
 */
function nativeIcpOf(script: string): string | undefined {
  const platformPackage = `@icp-sdk/icp-cli-win32-${process.arch}`
  const dir = path.dirname(script)
  return [
    path.join(dir, "..", "..", "..", platformPackage, "bin", "icp.exe"),
    path.join(dir, "..", "node_modules", platformPackage, "bin", "icp.exe"),
  ].find((file) => fs.existsSync(file))
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

/**
 * Whether the gateway is at `localhost` or `127.0.0.1`, the hosts that
 * icp-cli's built-in Internet Identity, `id.ai.localhost` on the gateway's
 * port, is known to share. Narrower than `isLocalHostname` in `local-host.ts`
 * on purpose: a gateway on another loopback address, such as `127.0.0.2`, need
 * not be the server a browser reaches at `id.ai.localhost`. Core's client names
 * that provider for every host `isLocalHostname` accepts (`builtInAuthorizeUrl`
 * in its `src/network.ts`), so on those other hosts the two differ.
 */
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
