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

/**
 * Detect the IC environment using the `icp` CLI.
 */
export function getIcEnvironmentInfo(
  canisterNames: string[]
): IcEnvironment | null {
  const environment = process.env.ICP_ENVIRONMENT || "local"

  try {
    const networkStatus = JSON.parse(
      execFileSync("icp", ["network", "status", "-e", environment, "--json"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"], // suppress stderr
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
      return null
    }

    const canisterIds: Record<string, string> = {}

    for (const name of canisterNames) {
      try {
        const canisterId = execFileSync(
          "icp",
          ["canister", "status", name, "-e", environment, "-i"],
          { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }
        ).trim()

        if (canisterId) {
          canisterIds[name] = canisterId
        }
      } catch {
        // Canister might not exist or be deployed yet
      }
    }

    const internetIdentityProvider =
      !canisterIds.internet_identity &&
      isLocalhostGateway(proxyTarget) &&
      environment !== "ic"
        ? localInternetIdentityProvider(proxyTarget)
        : undefined

    return {
      environment,
      rootKey,
      proxyTarget,
      canisterIds,
      internetIdentityProvider,
    }
  } catch (error) {
    // CLI not found or failed
    return null
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
