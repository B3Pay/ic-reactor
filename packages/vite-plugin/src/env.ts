/**
 * Environment Injection Utilities
 *
 * Handles detecting the local IC environment (via `dfx` or `icp` CLI)
 * and building the `ic_env` cookie for the browser.
 */

import { execFileSync } from "child_process"

export interface IcEnvironment {
  environment: string
  rootKey: string
  proxyTarget: string
  canisterIds: Record<string, string>
}

/**
 * Detect the IC environment using the `icp` or `dfx` CLI.
 */
export function getIcEnvironmentInfo(
  canisterNames: string[]
): IcEnvironment | null {
  const environment = process.env.ICP_ENVIRONMENT || "local"

  // We try `icp` first, but could fallback to `dfx` logic if needed.
  // For now, assuming `icp` CLI is available based on previous code.

  try {
    const networkStatus = JSON.parse(
      execFileSync("icp", ["network", "status", "-e", environment, "--json"], {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"], // suppress stderr
      })
    )

    const rootKey = networkStatus.root_key
    // Default to localhost:4943 if port strictly needed, but `icp` gives us the port
    const proxyTarget = `http://127.0.0.1:${networkStatus.port}`

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

    return { environment, rootKey, proxyTarget, canisterIds }
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
  rootKey: string
): string {
  const parts = [`ic_root_key=${rootKey}`]

  for (const [name, id] of Object.entries(canisterIds)) {
    parts.push(`PUBLIC_CANISTER_ID:${name}=${id}`)
  }

  return encodeURIComponent(parts.join("&"))
}
