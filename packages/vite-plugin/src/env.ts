/**
 * Environment Injection Utilities
 *
 * Handles detecting the local IC environment via the `icp` CLI
 * and building the `ic_env` cookie for the browser.
 */

import { execFileSync } from "child_process"

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
 * Detect the IC environment using the `icp` CLI.
 */
export function getIcEnvironmentInfo(
  canisterNames: string[]
): IcEnvironmentDetection {
  const networkName = process.env.ICP_ENVIRONMENT || "local"
  const diagnostics: string[] = []

  try {
    const networkStatus = JSON.parse(
      execFileSync("icp", ["network", "status", "-e", networkName, "--json"], {
        encoding: "utf-8",
        // stderr is piped rather than ignored so a failure can explain itself.
        // Piping still keeps it off the terminal — it only reaches the user if
        // the caller decides to print the diagnostics we collect below.
        stdio: ["ignore", "pipe", "pipe"],
      })
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

    for (const name of canisterNames) {
      try {
        const canisterId = execFileSync(
          "icp",
          ["canister", "status", name, "-e", networkName, "-i"],
          { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }
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
 * Turn whatever `execFileSync` threw into one readable line.
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
