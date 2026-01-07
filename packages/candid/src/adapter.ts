import { Actor, CanisterStatus } from "@icp-sdk/core/agent"
import type { HttpAgent } from "@icp-sdk/core/agent"
import type { Principal } from "@icp-sdk/core/principal"
import type { IDL } from "@icp-sdk/core/candid"

import type {
  CanisterId,
  CandidAdapterParameters,
  CandidDefinition,
  CandidClientManager,
  ReactorParser,
} from "./types"
import { DEFAULT_IC_DIDJS_ID, DEFAULT_LOCAL_DIDJS_ID } from "./constants"
import { importCandidDefinition, noop } from "./utils"

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
 * // Optionally initialize the local parser for faster processing
 * await adapter.initializeParser()
 *
 * // Get the Candid definition for a canister
 * const { idlFactory } = await adapter.getCandidDefinition("ryjl3-tyaaa-aaaaa-aaaba-cai")
 * ```
 */
export class CandidAdapter {
  /** The client manager providing agent and identity access. */
  public clientManager: CandidClientManager

  /** The canister ID of the didjs canister for remote Candid compilation. */
  public didjsCanisterId: string

  /** The optional local parser module. */
  private parserModule?: ReactorParser

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
      // Re-evaluate didjs canister ID when identity changes
      // (in case the network context changes)
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
   * Initializes the local parser module for converting Candid to JavaScript.
   * If no module is provided, attempts to require @ic-reactor/parser.
   *
   * @param module - Optional parser module to use.
   * @throws Error if the parser initialization fails.
   *
   * @example
   * ```typescript
   * // Use the default parser
   * await adapter.initializeParser()
   *
   * // Or provide a custom parser
   * import * as parser from "@ic-reactor/parser"
   * await adapter.initializeParser(parser)
   * ```
   */
  public async initializeParser(module?: ReactorParser): Promise<void> {
    if (module !== undefined) {
      this.parserModule = module
      return
    }
    try {
      this.parserModule = require("@ic-reactor/parser")
      if (
        typeof this.parserModule !== "undefined" &&
        this.parserModule.default
      ) {
        await this.parserModule.default()
      }
    } catch (error) {
      throw new Error(`Error initializing parser: ${error}`)
    }
  }

  /**
   * Gets the default didjs canister ID based on whether the agent is local or not.
   *
   * @returns The default didjs canister ID.
   */
  private getDefaultDidJsId(): string {
    return this.clientManager.isLocal
      ? DEFAULT_LOCAL_DIDJS_ID
      : DEFAULT_IC_DIDJS_ID
  }

  /**
   * Fetches the raw Candid definition string for a canister.
   * First attempts to get it from metadata, then falls back to the tmp hack method.
   *
   * @param canisterId - The canister ID to fetch the Candid definition for.
   * @returns The raw Candid definition string.
   * @throws Error if both methods fail.
   *
   * @example
   * ```typescript
   * const candidString = await adapter.fetchCandidDefinition("ryjl3-tyaaa-aaaaa-aaaba-cai")
   * console.log(candidString) // The .did file contents
   * ```
   */
  public async fetchCandidDefinition(canisterId: CanisterId): Promise<string> {
    let candidDef: string | undefined = ""

    // First attempt: Try getting Candid definition from metadata
    try {
      candidDef = await this.getFromMetadata(canisterId)
      if (!candidDef) {
        throw new Error("Cannot retrieve Candid definition from metadata")
      }
    } catch (_error) {
      // Second attempt: Try the temporary hack method
      candidDef = await this.getFromTmpHack(canisterId).catch(() => {
        return undefined
      })
    }

    if (!candidDef) {
      throw new Error("Failed to retrieve Candid definition by any method.")
    }

    return candidDef
  }

  /**
   * Gets the parsed Candid definition for a canister, ready for use with Actor.createActor.
   *
   * @param canisterId - The canister ID to get the Candid definition for.
   * @returns The parsed Candid definition with idlFactory and optional init.
   * @throws Error if fetching or parsing fails.
   *
   * @example
   * ```typescript
   * const { idlFactory } = await adapter.getCandidDefinition("ryjl3-tyaaa-aaaaa-aaaba-cai")
   *
   * const actor = Actor.createActor(idlFactory, {
   *   agent: clientManager.agent,
   *   canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai"
   * })
   * ```
   */
  public async getCandidDefinition(
    canisterId: CanisterId
  ): Promise<CandidDefinition> {
    try {
      const candidDef = await this.fetchCandidDefinition(canisterId)
      return this.evaluateCandidDefinition(candidDef)
    } catch (error) {
      throw new Error(`Error fetching canister ${canisterId}: ${error}`)
    }
  }

  /**
   * Gets the Candid definition from the canister's metadata.
   *
   * @param canisterId - The canister ID to query.
   * @returns The Candid definition string, or undefined if not available.
   */
  public async getFromMetadata(
    canisterId: CanisterId
  ): Promise<string | undefined> {
    const status = await CanisterStatus.request({
      agent: this.agent,
      canisterId: canisterId as Principal,
      paths: ["candid"],
    })

    return status.get("candid") as string
  }

  /**
   * Gets the Candid definition using the temporary hack method.
   * This calls the `__get_candid_interface_tmp_hack` query method on the canister.
   *
   * @param canisterId - The canister ID to query.
   * @returns The Candid definition string.
   */
  public async getFromTmpHack(canisterId: CanisterId): Promise<string> {
    const commonInterface: IDL.InterfaceFactory = ({ IDL }) =>
      IDL.Service({
        __get_candid_interface_tmp_hack: IDL.Func([], [IDL.Text], ["query"]),
      })

    const actor = Actor.createActor(commonInterface, {
      agent: this.agent,
      canisterId,
    })

    return (await actor.__get_candid_interface_tmp_hack()) as string
  }

  /**
   * Evaluates a Candid definition string and returns the parsed definition.
   * First attempts to use the local parser, then falls back to the remote didjs canister.
   *
   * @param data - The raw Candid definition string.
   * @returns The parsed Candid definition.
   * @throws Error if evaluation fails.
   */
  public async evaluateCandidDefinition(
    data: string
  ): Promise<CandidDefinition> {
    try {
      let candidDef: string | [] = ""

      try {
        candidDef = this.parseDidToJs(data)
        if (candidDef === "") {
          throw new Error("Cannot compile Candid to JavaScript")
        }
      } catch (_error) {
        candidDef = (await this.fetchDidTojs(data))[0]
      }

      if (JSON.stringify(candidDef) === JSON.stringify([])) {
        throw new Error("Cannot compile Candid to JavaScript")
      }

      return await importCandidDefinition(candidDef)
    } catch (error) {
      throw new Error(`Error evaluating Candid definition: ${error}`)
    }
  }

  /**
   * Fetches didjs compilation from the remote didjs canister.
   *
   * @param candidSource - The Candid source to compile.
   * @param didjsCanisterId - Optional custom didjs canister ID.
   * @returns The compiled JavaScript code wrapped in a tuple.
   */
  public async fetchDidTojs(
    candidSource: string,
    didjsCanisterId?: string
  ): Promise<[string]> {
    type DidToJs = {
      did_to_js: (arg: string) => Promise<[string]>
    }
    const didjsInterface: IDL.InterfaceFactory = ({ IDL }) =>
      IDL.Service({
        did_to_js: IDL.Func([IDL.Text], [IDL.Opt(IDL.Text)], ["query"]),
      })

    const didjs = Actor.createActor<DidToJs>(didjsInterface, {
      agent: this.agent,
      canisterId: didjsCanisterId || this.didjsCanisterId,
    })

    return didjs.did_to_js(candidSource)
  }

  /**
   * Parses Candid to JavaScript using the local parser module.
   *
   * @param candidSource - The Candid source to parse.
   * @returns The JavaScript code.
   * @throws Error if the parser module is not available.
   */
  public parseDidToJs(candidSource: string): string {
    if (!this.parserModule) {
      throw new Error("Parser module not available")
    }

    return this.parserModule.didToJs(candidSource)
  }

  /**
   * Validates Candid (IDL) source using the local parser module.
   *
   * @param candidSource - The Candid source to validate.
   * @returns True if the source is valid, false otherwise.
   * @throws Error if the parser module is not available.
   */
  public validateIDL(candidSource: string): boolean {
    if (!this.parserModule) {
      throw new Error("Parser module not available")
    }

    return this.parserModule.validateIDL(candidSource)
  }
}
