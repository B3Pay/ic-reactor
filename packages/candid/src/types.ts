import type { HttpAgent, Identity } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"
import type {
  BaseActor,
  CanisterId,
  DisplayReactorParameters,
  ReactorParameters,
} from "@ic-reactor/core"
import type { CandidAdapter } from "./adapter"

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
  "idlFactory"
> {
  /** The canister ID. */
  canisterId?: CanisterId
  /** The Candid source code. If not provided, the canister's Candid will be fetched. */
  candid?: string
  /** The IDL interface factory. */
  idlFactory?: (IDL: any) => any
  /** The Candid adapter. */
  adapter?: CandidAdapter
}

// ============================================================================
// CandidDisplayReactor Parameters
// ============================================================================

export interface CandidDisplayReactorParameters<A = BaseActor> extends Omit<
  DisplayReactorParameters<A>,
  "idlFactory"
> {
  /** The canister ID. */
  canisterId?: CanisterId
  /** The Candid source code. If not provided, the canister's Candid will be fetched. */
  candid?: string
  /** The IDL interface factory. */
  idlFactory?: (IDL: any) => any
  /** The Candid adapter. */
  adapter?: CandidAdapter
  /**
   * An IDL.FuncClass to register as a single-method service.
   * Use this to create a reactor for a funcRecord callback.
   * When provided, the reactor is ready to use immediately (no `initialize()` needed).
   *
   * @example
   * ```typescript
   * const archiveReactor = new CandidDisplayReactor({
   *   canisterId: archived.canisterId,
   *   clientManager,
   *   funcClass: { methodName: "get_blocks", func: archiveFuncClass },
   * })
   * ```
   */
  funcClass?: {
    /** The method name to register */
    methodName: string
    /** The IDL.FuncClass describing the function signature */
    func: import("@icp-sdk/core/candid").IDL.FuncClass
  }
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
