import type { HttpAgent } from "@icp-sdk/core/agent"
import type { Principal } from "@icp-sdk/core/principal"
import type {
  CandidAdapterParameters,
  CandidDefinition,
  CandidClientManager,
  ReactorParser,
} from "./types"

import { CanisterStatus } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { DEFAULT_IC_DIDJS_ID, DEFAULT_LOCAL_DIDJS_ID } from "./constants"
import { importCandidDefinition } from "./utils"
import { CanisterId } from "@ic-reactor/core"

/**
 * CandidAdapter provides functionality to fetch and parse Candid definitions
 * from Internet Computer canisters.
 *
 * It supports multiple methods for retrieving Candid definitions:
 * 1. From canister metadata (preferred)
 * 2. From the `__get_candid_interface_tmp_hack` method (fallback)
 *
 * It also supports parsing Candid to JavaScript using:
 * 1. Local WASM parser (@ic-reactor/parser) - faster, no network request
 * 2. Remote didjs canister - always available fallback
 *
 * @example
 * ```typescript
 * import { CandidAdapter } from "@ic-reactor/candid"
 * import { ClientManager } from "@ic-reactor/core"
 * import { QueryClient } from "@tanstack/query-core"
 *
 * const queryClient = new QueryClient()
 * const clientManager = new ClientManager({ queryClient })
 * await clientManager.initialize()
 *
 * const adapter = new CandidAdapter({ clientManager })
 *
 * // Optionally load the local parser for faster processing
 * await adapter.loadParser()
 *
 * // Get the Candid definition for a canister
 * const { idlFactory } = await adapter.getCandidDefinition("ryjl3-tyaaa-aaaaa-aaaba-cai")
 * ```
 */
export class CandidAdapter {
  /** The client manager providing agent and identity access. */
  public clientManager: CandidClientManager

  /** The canister ID of the didjs canister for remote Candid compilation. */
  public didjsCanisterId: CanisterId

  /** The optional local parser module. */
  private parserModule?: ReactorParser

  /** Whether parser auto-loading has been attempted. */
  private parserLoadAttempted = false

  /** Function to unsubscribe from identity updates. */
  public unsubscribe: () => void = noop

  /**
   * Creates a new CandidAdapter instance.
   *
   * @param params - The adapter parameters.
   */
  constructor({ clientManager, didjsCanisterId }: CandidAdapterParameters) {
    this.clientManager = clientManager
    this.didjsCanisterId = didjsCanisterId || this.getDefaultDidJsId()

    // Subscribe to identity changes to update didjs canister ID if needed
    this.unsubscribe = clientManager.subscribe(() => {
      if (!didjsCanisterId) {
        this.didjsCanisterId = this.getDefaultDidJsId()
      }
    })
  }

  /**
   * The HTTP agent from the client manager.
   */
  get agent(): HttpAgent {
    return this.clientManager.agent
  }

  /**
   * Whether the local parser is available.
   */
  get hasParser(): boolean {
    return this.parserModule !== undefined
  }

  /**
   * Loads the local parser module for converting Candid to JavaScript.
   * If no module is provided, attempts to dynamically load @ic-reactor/parser.
   *
   * @param module - Optional parser module to use.
   * @throws Error if the parser loading fails.
   *
   * @example
   * ```typescript
   * // Load the default parser
   * await adapter.loadParser()
   *
   * // Or provide a custom parser
   * import * as parser from "@ic-reactor/parser"
   * await adapter.loadParser(parser)
   * ```
   */
  public async loadParser(module?: ReactorParser): Promise<void> {
    if (module !== undefined) {
      this.parserModule = module
      this.parserLoadAttempted = true
      return
    }

    if (this.parserLoadAttempted) {
      return // Already tried loading
    }

    this.parserLoadAttempted = true

    try {
      this.parserModule = require("@ic-reactor/parser")
      if (this.parserModule?.default) {
        await this.parserModule.default()
      }
    } catch (error) {
      throw new Error(`Error loading parser: ${error}`)
    }
  }

  /**
   * Attempts to load the parser silently (no error if not available).
   * Useful for optional parser initialization.
   */
  private async tryLoadParser(): Promise<void> {
    if (this.parserModule || this.parserLoadAttempted) {
      return
    }

    this.parserLoadAttempted = true

    try {
      this.parserModule = require("@ic-reactor/parser")
      if (this.parserModule?.default) {
        await this.parserModule.default()
      }
    } catch {
      // Silently fail - parser is optional
      this.parserModule = undefined
    }
  }

  /**
   * Gets the default didjs canister ID based on whether the agent is local or not.
   */
  private getDefaultDidJsId(): string {
    return this.clientManager.isLocal
      ? DEFAULT_LOCAL_DIDJS_ID
      : DEFAULT_IC_DIDJS_ID
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN API - High-level methods for fetching Candid definitions
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Gets the parsed Candid definition for a canister, ready for use with Actor.createActor.
   * This is the main entry point for fetching a canister's interface.
   *
   * @param canisterId - The canister ID to get the Candid definition for.
   * @returns The parsed Candid definition with idlFactory and optional init.
   * @throws Error if fetching or parsing fails.
   *
   * @example
   * ```typescript
   * const { idlFactory } = await adapter.getCandidDefinition("ryjl3-tyaaa-aaaaa-aaaba-cai")
   * ```
   */
  public async getCandidDefinition(
    canisterId: CanisterId
  ): Promise<CandidDefinition> {
    try {
      const candidSource = await this.fetchCandidSource(canisterId)
      return await this.parseCandidSource(candidSource)
    } catch (error) {
      throw new Error(`Error fetching canister ${canisterId}: ${error}`)
    }
  }

  /**
   * Fetches the raw Candid source string for a canister.
   * First attempts to get it from metadata, then falls back to the tmp hack method.
   *
   * @param canisterId - The canister ID to fetch the Candid source for.
   * @returns The raw Candid source string (.did file contents).
   * @throws Error if both methods fail.
   *
   * @example
   * ```typescript
   * const candidSource = await adapter.fetchCandidSource("ryjl3-tyaaa-aaaaa-aaaba-cai")
   * console.log(candidSource) // service { greet: (text) -> (text) query; }
   * ```
   */
  public async fetchCandidSource(canisterId: CanisterId): Promise<string> {
    // First attempt: Try getting Candid from metadata
    const fromMetadata = await this.fetchFromMetadata(canisterId).catch(
      () => undefined
    )

    if (fromMetadata) {
      return fromMetadata
    }

    // Second attempt: Try the temporary hack method
    const fromTmpHack = await this.fetchFromTmpHack(canisterId).catch(
      () => undefined
    )

    if (fromTmpHack) {
      return fromTmpHack
    }

    throw new Error("Failed to retrieve Candid source by any method.")
  }

  /**
   * Parses Candid source string and returns the definition with idlFactory.
   * First attempts to use the local parser, then falls back to the remote didjs canister.
   *
   * @param candidSource - The raw Candid source string.
   * @returns The parsed Candid definition.
   * @throws Error if parsing fails.
   */
  public async parseCandidSource(
    candidSource: string
  ): Promise<CandidDefinition> {
    // Try to auto-load parser if not already loaded
    await this.tryLoadParser()

    let compiledJs: string | undefined

    // First attempt: Try local parser (faster, no network)
    if (this.parserModule) {
      try {
        compiledJs = this.compileLocal(candidSource)
      } catch {
        // Fall through to remote compilation
      }
    }

    // Second attempt: Try remote didjs canister
    if (!compiledJs) {
      compiledJs = await this.compileRemote(candidSource)
    }

    if (!compiledJs) {
      throw new Error("Failed to compile Candid to JavaScript")
    }

    return importCandidDefinition(compiledJs)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FETCH METHODS - Low-level methods for fetching Candid source
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Fetches Candid source from the canister's metadata.
   *
   * @param canisterId - The canister ID to query.
   * @returns The Candid source string, or undefined if not available.
   */
  public async fetchFromMetadata(
    canisterId: CanisterId
  ): Promise<string | undefined> {
    const status = await CanisterStatus.request({
      agent: this.agent,
      canisterId: canisterId as Principal,
      paths: ["candid"],
    })

    return status.get("candid") as string | undefined
  }

  /**
   * Fetches Candid source using the temporary hack method.
   * This calls the `__get_candid_interface_tmp_hack` query method on the canister.
   *
   * @param canisterId - The canister ID to query.
   * @returns The Candid source string.
   */
  public async fetchFromTmpHack(canisterId: CanisterId): Promise<string> {
    const canisterIdStr =
      typeof canisterId === "string" ? canisterId : canisterId.toString()

    // Use raw agent.query instead of Actor.createActor
    const response = await this.agent.query(canisterIdStr, {
      methodName: "__get_candid_interface_tmp_hack",
      arg: IDL.encode([], []),
    })

    if ("reply" in response && response.reply) {
      const [candidSource] = IDL.decode([IDL.Text], response.reply.arg) as [
        string,
      ]
      return candidSource
    }

    throw new Error(`Query failed: ${JSON.stringify(response)}`)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPILE METHODS - Methods for compiling Candid to JavaScript
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Compiles Candid source to JavaScript using the local WASM parser.
   *
   * @param candidSource - The Candid source to compile.
   * @returns The compiled JavaScript code.
   * @throws Error if the parser is not loaded.
   */
  public compileLocal(candidSource: string): string {
    if (!this.parserModule) {
      throw new Error("Parser not loaded. Call loadParser() first.")
    }

    return this.parserModule.didToJs(candidSource)
  }

  /**
   * Compiles Candid source to JavaScript using the remote didjs canister.
   *
   * @param candidSource - The Candid source to compile.
   * @param didjsCanisterId - Optional custom didjs canister ID.
   * @returns The compiled JavaScript code, or undefined if compilation fails.
   */
  public async compileRemote(
    candidSource: string,
    didjsCanisterId?: string
  ): Promise<string | undefined> {
    const canisterId = didjsCanisterId || this.didjsCanisterId

    // Use raw agent.query instead of Actor.createActor
    const response = await this.agent.query(canisterId, {
      methodName: "did_to_js",
      arg: IDL.encode([IDL.Text], [candidSource]),
    })

    if ("reply" in response && response.reply) {
      const [result] = IDL.decode([IDL.Opt(IDL.Text)], response.reply.arg) as [
        [string] | [],
      ]
      return result[0]
    }

    throw new Error(`Query failed: ${JSON.stringify(response)}`)
  }

  /**
   * Validates Candid source using the local parser.
   *
   * @param candidSource - The Candid source to validate.
   * @returns True if the source is valid, false otherwise.
   * @throws Error if the parser is not loaded.
   */
  public validateCandid(candidSource: string): boolean {
    if (!this.parserModule) {
      throw new Error("Parser not loaded. Call loadParser() first.")
    }

    return this.parserModule.validateIDL(candidSource)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEPRECATED ALIASES - For backwards compatibility
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * @deprecated Use `loadParser()` instead.
   */
  public async initializeParser(module?: ReactorParser): Promise<void> {
    return this.loadParser(module)
  }

  /**
   * @deprecated Use `fetchCandidSource()` instead.
   */
  public async fetchCandidDefinition(canisterId: CanisterId): Promise<string> {
    return this.fetchCandidSource(canisterId)
  }

  /**
   * @deprecated Use `fetchFromMetadata()` instead.
   */
  public async getFromMetadata(
    canisterId: CanisterId
  ): Promise<string | undefined> {
    return this.fetchFromMetadata(canisterId)
  }

  /**
   * @deprecated Use `fetchFromTmpHack()` instead.
   */
  public async getFromTmpHack(canisterId: CanisterId): Promise<string> {
    return this.fetchFromTmpHack(canisterId)
  }

  /**
   * @deprecated Use `parseCandidSource()` instead.
   */
  public async evaluateCandidDefinition(
    data: string
  ): Promise<CandidDefinition> {
    return this.parseCandidSource(data)
  }

  /**
   * @deprecated Use `compileRemote()` instead.
   */
  public async fetchDidTojs(
    candidSource: string,
    didjsCanisterId?: string
  ): Promise<string | undefined> {
    return this.compileRemote(candidSource, didjsCanisterId)
  }

  /**
   * @deprecated Use `compileLocal()` instead.
   */
  public parseDidToJs(candidSource: string): string {
    return this.compileLocal(candidSource)
  }

  /**
   * @deprecated Use `validateCandid()` instead.
   */
  public validateIDL(candidSource: string): boolean {
    return this.validateCandid(candidSource)
  }
}

const noop = () => {}
