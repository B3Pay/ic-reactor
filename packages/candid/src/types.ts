import type { HttpAgent, Identity } from "@icp-sdk/core/agent"
import type { Principal } from "@icp-sdk/core/principal"
import type { IDL } from "@icp-sdk/core/candid"

/**
 * Represents a Canister ID, which can be either a string or a Principal object.
 */
export type CanisterId = string | Principal

/**
 * Minimal interface for ClientManager that CandidAdapter depends on.
 * This allows the candid package to work with ClientManager without importing the full core package.
 */
export interface CandidClientManager {
  /** The HTTP agent used for making requests. */
  agent: HttpAgent
  /** Whether the agent is connected to a local network. */
  isLocal: boolean
  /** Subscribe to identity changes. Returns an unsubscribe function. */
  subscribe(callback: (identity: Identity) => void): () => void
}

/**
 * Parameters for initializing the CandidAdapter.
 */
export interface CandidAdapterParameters {
  /** The client manager that provides agent and identity access. */
  clientManager: CandidClientManager
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

/**
 * Options for calling a canister method with inline Candid.
 */
export interface CallOptions<T extends unknown[] = unknown[]> {
  /** The method name to call. */
  methodName: string
  /**
   * The Candid signature for the method.
   * Can be either a method signature like "(text) -> (text) query"
   * or a full service definition like "service : { greet: (text) -> (text) query }".
   */
  candid: string
  /**
   * The arguments to pass to the method.
   * These will be encoded using the Candid types from the signature.
   */
  args?: T
}
