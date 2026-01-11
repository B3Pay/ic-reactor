/**
 * IC Network utilities
 *
 * Fetches Candid interfaces from live canisters on the IC network.
 */

import { HttpAgent, Actor } from "@icp-sdk/core/agent"
import { Principal } from "@icp-sdk/core/principal"
import { IDL } from "@icp-sdk/core/candid"
import type { MethodInfo } from "../types.js"
import { extractMethods } from "../parsers/did.js"

// IC mainnet host
const IC_HOST = "https://icp-api.io"

// Local replica host
const LOCAL_HOST = "http://127.0.0.1:4943"

export type NetworkType = "ic" | "local"

export interface FetchCandidOptions {
  canisterId: string
  network?: NetworkType
  host?: string
}

export interface CandidResult {
  candidSource: string
  methods: MethodInfo[]
  canisterId: string
  network: NetworkType
}

/**
 * Fetch Candid interface from a live canister
 *
 * Uses the `__get_candid_interface_tmp_hack` method which is available
 * on most canisters that were compiled with candid export.
 */
export async function fetchCandidFromCanister(
  options: FetchCandidOptions
): Promise<CandidResult> {
  const { canisterId, network = "ic", host } = options

  // Validate canister ID
  let principal: Principal
  try {
    principal = Principal.fromText(canisterId)
  } catch {
    throw new Error(`Invalid canister ID: ${canisterId}`)
  }

  // Determine host
  const agentHost = host ?? (network === "local" ? LOCAL_HOST : IC_HOST)

  // Create agent
  const agent = await HttpAgent.create({
    host: agentHost,
    // Don't verify signatures for CLI queries
    verifyQuerySignatures: false,
  })

  // For local network, fetch root key (unsafe for mainnet)
  if (network === "local") {
    try {
      await agent.fetchRootKey()
    } catch {
      throw new Error(
        `Failed to connect to local replica at ${agentHost}. Is it running?`
      )
    }
  }

  // Try to fetch Candid interface using the temporary hack method
  // This method is added by the Rust CDK and Motoko compiler
  const candidInterface = IDL.Service({
    __get_candid_interface_tmp_hack: IDL.Func([], [IDL.Text], ["query"]),
  })

  const actor = Actor.createActor(() => candidInterface, {
    agent,
    canisterId: principal,
  })

  try {
    const candidSource =
      (await actor.__get_candid_interface_tmp_hack()) as string

    if (!candidSource || candidSource.trim() === "") {
      throw new Error("Canister returned empty Candid interface")
    }

    // Parse the Candid to extract methods
    const methods = extractMethods(candidSource)

    return {
      candidSource,
      methods,
      canisterId,
      network,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    // Check for common errors
    if (message.includes("Replica Error")) {
      throw new Error(
        `Canister ${canisterId} does not expose a Candid interface. ` +
          `The canister may not support the __get_candid_interface_tmp_hack method.`
      )
    }

    if (message.includes("not found") || message.includes("404")) {
      throw new Error(`Canister ${canisterId} not found on ${network} network.`)
    }

    throw new Error(`Failed to fetch Candid from canister: ${message}`)
  }
}

/**
 * Validate a canister ID string
 */
export function isValidCanisterId(canisterId: string): boolean {
  try {
    Principal.fromText(canisterId)
    return true
  } catch {
    return false
  }
}

/**
 * Get a shortened display version of a canister ID
 */
export function shortenCanisterId(canisterId: string): string {
  if (canisterId.length <= 15) return canisterId
  return `${canisterId.slice(0, 5)}...${canisterId.slice(-5)}`
}
