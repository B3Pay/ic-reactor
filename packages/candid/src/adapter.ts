import type { ApiQueryResponse, HttpAgent } from "@icp-sdk/core/agent"
import type { Principal } from "@icp-sdk/core/principal"
import type {
  CandidAdapterParameters,
  CandidDefinition,
  CandidClientManager,
  ReactorParser,
} from "./types.js"

import { CanisterStatus } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { DEFAULT_IC_DIDJS_ID, DEFAULT_LOCAL_DIDJS_ID } from "./constants.js"
import { importCandidDefinition } from "./utils.js"
import { CanisterId } from "@ic-reactor/core"

/** An error's message. The WASM parser throws plain strings. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The error for a query that got no reply, with the replica's reject codes and
 * message. The response itself can't go through `JSON.stringify`. It carries
 * the node signatures, whose timestamps the agent decodes as bigints, so
 * serializing it threw a TypeError that took the place of the reject message.
 */
function queryFailure(response: ApiQueryResponse): Error {
  if (!("reject_message" in response)) {
    return new Error(`Query failed: no reply (status: ${response.status})`)
  }
  const { reject_code, reject_message, error_code } = response
  // The interface spec makes the error code optional. The message goes last:
  // the replica may end it with a line of help and a link.
  const codes = error_code
    ? `reject code ${reject_code}, error code ${error_code}`
    : `reject code ${reject_code}`
  return new Error(`Query failed (${codes}): ${reject_message}`)
}

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

  /** The didjs canister ID given to the constructor or assigned, if any. */
  private explicitDidjsCanisterId?: CanisterId

  /** The optional local parser module. */
  private parserModule?: ReactorParser

  /** Whether parser auto-loading has been attempted. */
  private parserLoadAttempted = false

  /** The load of @ic-reactor/parser once started, which later callers await. */
  private parserLoad?: Promise<void>

  /**
   * Does nothing. The adapter used to subscribe to the client manager's
   * identity changes and this removed that subscription; it no longer
   * subscribes, so there is nothing to remove.
   *
   * @deprecated A no-op kept so existing calls still work. Remove the call.
   */
  public unsubscribe: () => void = noop

  /**
   * Creates a new CandidAdapter instance.
   *
   * The adapter keeps no subscription on the client manager, so dropping it
   * (or a reactor that created it) leaves nothing behind to clean up.
   *
   * @param params - The adapter parameters.
   */
  constructor({ clientManager, didjsCanisterId }: CandidAdapterParameters) {
    this.clientManager = clientManager
    // The default is not stored: `didjsCanisterId` reads it from the client
    // manager each time. Keeping it current used to take a subscription to
    // every identity change, which nothing removed, so each reactor built
    // without an adapter left a callback on its ClientManager for good.
    this.explicitDidjsCanisterId = didjsCanisterId || undefined
  }

  /**
   * The canister ID of the didjs canister for remote Candid compilation.
   *
   * The ID given to the constructor or assigned here wins. Without one, it is
   * the default for the client manager's network at the time of the read: the
   * local didjs canister when `clientManager.isLocal` is true, the mainnet one
   * otherwise.
   */
  get didjsCanisterId(): CanisterId {
    return this.explicitDidjsCanisterId || this.getDefaultDidJsId()
  }

  set didjsCanisterId(canisterId: CanisterId) {
    this.explicitDidjsCanisterId = canisterId || undefined
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
      // Already tried loading. A load another call started may still be
      // under way, and the parser cannot be used until it is done.
      await this.parserLoad
      return
    }

    this.parserLoadAttempted = true

    const load = this.importParser()
    this.parserLoad = load.catch(() => {})
    try {
      await load
    } catch (error) {
      throw new Error(`Error loading parser: ${error}`)
    }
  }

  /**
   * Attempts to load the parser silently (no error if not available).
   * Useful for optional parser initialization.
   */
  private async tryLoadParser(): Promise<void> {
    if (this.parserModule) {
      return
    }

    if (this.parserLoadAttempted) {
      // A parse that starts while another is loading the parser waits for
      // that load. It used to find no parser yet and compile on the didjs
      // canister, which fails offline and where no didjs canister runs.
      await this.parserLoad
      return
    }

    this.parserLoadAttempted = true

    // The package is a dependency, so the specifier resolves; what can still
    // fail is instantiating the WASM in this runtime. Remote compilation
    // through the didjs canister covers that case.
    this.parserLoad = this.importParser().catch(() => {})
    await this.parserLoad
  }

  /**
   * Imports @ic-reactor/parser and runs its `init()`. The module is kept only
   * once `init()` is done: the web build's `init()` fetches the WASM, and a
   * parse that found the module earlier used it uninitialized.
   */
  private async importParser(): Promise<void> {
    const module = (await import(
      "@ic-reactor/parser" as any
    )) as unknown as ReactorParser
    if (typeof module?.default === "function") {
      await (module.default as () => Promise<void>)()
    }
    this.parserModule = module
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
    let metadataError: unknown
    const fromMetadata = await this.fetchFromMetadata(canisterId).catch(
      (error: unknown) => {
        metadataError = error
        return undefined
      }
    )

    if (fromMetadata) {
      return fromMetadata
    }

    // Second attempt: Try the temporary hack method
    let tmpHackError: unknown
    const fromTmpHack = await this.fetchFromTmpHack(canisterId).catch(
      (error: unknown) => {
        tmpHackError = error
        return undefined
      }
    )

    if (fromTmpHack) {
      return fromTmpHack
    }

    // Say what stopped each attempt. Dropping both errors made a canister
    // without Candid, a network outage and a local agent with no root key all
    // read "by any method". The metadata request reports most failures as
    // absent metadata, so "not available" is all that can be said without an
    // error.
    const metadata =
      metadataError === undefined
        ? "the candid:service metadata was not available"
        : `reading the candid:service metadata failed: ${describeError(metadataError)}`
    const tmpHack =
      tmpHackError === undefined
        ? "__get_candid_interface_tmp_hack returned no Candid"
        : `calling __get_candid_interface_tmp_hack failed: ${describeError(tmpHackError)}`
    throw new Error(
      `Failed to retrieve Candid source by any method: ${metadata}; ${tmpHack}`
    )
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
    // Kept for the error below. The remote fallback answers invalid Candid with
    // none, so without this a typo in hand-written Candid was reported as a
    // bare "Failed to compile" and the parser's line and column were lost.
    let localError: unknown

    // First attempt: Try local parser (faster, no network)
    if (this.parserModule) {
      try {
        compiledJs = this.compileLocal(candidSource)
      } catch (error) {
        // Fall through to remote compilation
        localError = error
      }
    }

    // Second attempt: Try remote didjs canister
    if (!compiledJs) {
      try {
        compiledJs = await this.compileRemote(candidSource)
      } catch (remoteError) {
        if (localError === undefined) throw remoteError
        throw new Error(
          `Failed to compile Candid to JavaScript: ${describeError(localError)} ` +
            `(the didjs canister also failed: ${describeError(remoteError)})`
        )
      }
    }

    if (!compiledJs) {
      throw new Error(
        localError === undefined
          ? "Failed to compile Candid to JavaScript"
          : `Failed to compile Candid to JavaScript: ${describeError(localError)}`
      )
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

    throw queryFailure(response)
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

    throw queryFailure(response)
  }

  /**
   * Validates Candid source using the local parser.
   *
   * @param candidSource - The Candid source to validate.
   * @returns True if the source is valid, false otherwise.
   * @throws Error if the parser is not loaded.
   * @throws Any error the parser throws other than rejecting the source, such
   * as the web build's error when it is called before `init()`.
   */
  public validateCandid(candidSource: string): boolean {
    if (!this.parserModule) {
      throw new Error("Parser not loaded. Call loadParser() first.")
    }

    // @ic-reactor/parser reports source that does not parse by throwing a plain
    // string, not by returning false. Any other throw means the parser could
    // not run, for example a web build nobody initialized, and answering false
    // there would report valid Candid as invalid.
    try {
      return this.parserModule.validateIDL(candidSource)
    } catch (error) {
      if (typeof error === "string") return false
      throw error
    }
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
