/**
 * Environment Injection Utilities
 *
 * Handles detecting the local IC environment via the `icp` CLI
 * and building the `ic_env` cookie for the browser.
 */

import { execFile } from "child_process"

export interface IcEnvironment {
  environment: string
  rootKey: string
  proxyTarget: string
  canisterIds: Record<string, string>
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
  return new Promise((resolve, reject) => {
    const child = execFile(
      "icp",
      args,
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

    const canisterIds: Record<string, string> = {}

    // One at a time, as icp is run from a terminal. Each command reads the
    // project's state, and these are not known to be safe to run at once.
    for (const name of canisterNames) {
      try {
        const canisterId = (
          await runIcp(
            ["canister", "status", name, "-e", networkName, "-i"],
            projectRoot
          )
        ).trim()

        if (canisterId) {
          canisterIds[name] = canisterId
        }
      } catch (error) {
        // Canister might not exist or be deployed yet — expected for
        // internet_identity, which is added to the lookup list unconditionally.
        diagnostics.push(
          `\`icp canister status ${name} -e ${networkName}\` failed: ${describeExecError(error)}`
        )
      }
    }

    const internetIdentityProvider =
      !canisterIds.internet_identity &&
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
    // CLI not found or failed
    diagnostics.push(
      `\`icp network status -e ${networkName}\` failed: ${describeExecError(error)}`
    )
    return { environment: null, diagnostics }
  }
}

/**
 * Build the `ic_env` cookie string.
 * Format: `ic_root_key=<key>&PUBLIC_CANISTER_ID:<name>=<id>&...`
 */
export function buildIcEnvCookie(
  canisterIds: Record<string, string>,
  rootKey?: string,
  internetIdentityProvider?: string
): string {
  const parts = rootKey ? [`ic_root_key=${rootKey}`] : []

  for (const [name, id] of Object.entries(canisterIds)) {
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

  return error instanceof Error ? error.message : String(error)
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
