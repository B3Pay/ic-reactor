import type { HttpAgent } from "@icp-sdk/core/agent"
import type { Principal } from "@icp-sdk/core/principal"
import type { IDL } from "@icp-sdk/core/candid"

/**
 * Represents a Canister ID, which can be either a string or a Principal object.
 */
export type CanisterId = string | Principal

/**
 * Interface for the AgentManager that provides agent access and subscription.
 */
export interface AgentManager {
  getAgent(): HttpAgent
  subscribeAgent(callback: (agent: HttpAgent) => void): () => void
}

/**
 * Parameters for initializing the CandidAdapter.
 */
export interface CandidAdapterParameters {
  /** The HTTP agent to use for requests. */
  agent?: HttpAgent
  /** The agent manager for subscribing to agent changes. */
  agentManager?: AgentManager
  /** The canister ID of the didjs canister for compiling Candid to JavaScript. */
  didjsCanisterId?: string
}

/**
 * Represents a parsed Candid definition with IDL factory and initialization.
 */
export interface CandidDefinition {
  /** The IDL interface factory. */
  idlFactory: IDL.InterfaceFactory
  /** Optional init function for the canister. */
  init?: (args: { IDL: typeof IDL }) => IDL.Type<unknown>[]
}

/**
 * Interface for the optional parser module (@ic-reactor/parser).
 */
export interface ReactorParser {
  /**
   * Default function to initialize the WASM module.
   */
  default?: () => Promise<void>
  /**
   * Converts Candid (DID) source to JavaScript code.
   * @param candidSource - The Candid source code.
   * @returns The JavaScript code.
   */
  didToJs(candidSource: string): string
  /**
   * Validates the Candid (IDL) source.
   * @param candidSource - The Candid source code.
   * @returns True if valid, false otherwise.
   */
  validateIDL(candidSource: string): boolean
}
