import type { HttpAgent, Identity } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"
import type { CanisterId, ReactorParameters } from "@ic-reactor/core"

export interface DynamicMethodOptions {
  /** The method name to register. */
  functionName: string
  /**
   * The Candid signature for the method.
   * Can be either a method signature like "(text) -> (text) query"
   * or a full service definition like "service : { greet: (text) -> (text) query }".
   */
  candid: string
}

export interface CandidReactorParameters extends Omit<
  ReactorParameters,
  "idlFactory" | "actor"
> {
  /** The canister ID. */
  canisterId: CanisterId
  /** The Candid source code. */
  candid?: string
  /** The IDL interface factory. */
  idlFactory?: IDL.InterfaceFactory
}

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
  didjsCanisterId?: CanisterId
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
