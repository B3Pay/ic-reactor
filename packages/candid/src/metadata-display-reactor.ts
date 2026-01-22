import type { BaseActor, DisplayReactorParameters } from "@ic-reactor/core"
import type {
  CandidDisplayReactorParameters,
  DynamicMethodOptions,
} from "./types"

import {
  DisplayReactor,
  didToDisplayCodec,
  didTypeFromArray,
} from "@ic-reactor/core"
import { CandidAdapter } from "./adapter"
import { IDL } from "@icp-sdk/core/candid"

// Import the new clean visitors
import {
  ArgumentFieldVisitor,
  MethodArgumentsMeta,
  ServiceArgumentsMeta,
  ArgumentField,
} from "./visitor/arguments"
import {
  ResultFieldVisitor,
  MethodResultMeta,
  ServiceResultMeta,
  ResultField,
} from "./visitor/returns"

// ============================================================================
// MetadataDisplayReactor
// ============================================================================

/**
 * MetadataDisplayReactor combines display transformations with visitor-based
 * metadata generation for both input forms and result display.
 *
 * ## Architecture
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                        MetadataDisplayReactor                               │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │                                                                             │
 * │  INITIALIZATION (once, from raw IDL types):                                 │
 * │                                                                             │
 * │    IDL.Service ──► ArgumentFieldVisitor ──► ServiceArgumentsMeta           │
 * │                                              { methodName: {                │
 * │                                                  fields: ArgumentField[],  │
 * │                                                  defaultValues: [...]       │
 * │                                              }}                             │
 * │                                                                             │
 * │    IDL.Service ──► ResultFieldVisitor ──► ServiceResultMeta                │
 * │                                            { methodName: {                  │
 * │                                                resultFields: ResultField[], │
 * │                                                returnCount: number          │
 * │                                            }}                               │
 * │                                                                             │
 * ├─────────────────────────────────────────────────────────────────────────────┤
 * │                                                                             │
 * │  RUNTIME (per method call):                                                 │
 * │                                                                             │
 * │    INPUT FLOW:                                                              │
 * │    Display Values ──► DisplayCodec.encode() ──► Candid Values ──► Canister │
 * │    (strings)                                     (bigint, Principal)        │
 * │                                                                             │
 * │    OUTPUT FLOW:                                                             │
 * │    Canister ──► Candid Values ──► DisplayCodec.decode() ──► Display Values │
 * │                 (bigint, Principal)                         (strings)       │
 * │                                                                             │
 * │    RENDERING:                                                               │
 * │    ResultField (metadata) + Display Value ──► UI Component                  │
 * │                                                                             │
 * └─────────────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * ## Key Insight: Metadata vs Values
 *
 * - **Metadata** is generated once from raw IDL types (no values involved)
 * - **Values** are transformed at runtime via DisplayCodec
 * - At render time, pair metadata with transformed values
 *
 * @example
 * ```typescript
 * const reactor = new MetadataDisplayReactor({
 *   clientManager,
 *   canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
 * })
 *
 * await reactor.initialize()
 *
 * // Get input field metadata (for form generation)
 * const argMeta = reactor.getArgumentMeta("icrc1_transfer")
 * // argMeta.fields describes the form structure
 * // argMeta.defaultValues provides initial values
 *
 * // Get result field metadata (for display)
 * const resultMeta = reactor.getResultMeta("icrc1_transfer")
 * // resultMeta.resultFields describes how to display results
 *
 * // Call method with display values
 * const result = await reactor.callMethod({
 *   functionName: "icrc1_transfer",
 *   args: [{ to: "aaaaa-aa", amount: "1000000" }]
 * })
 *
 * // Render result using metadata
 * resultMeta.resultFields.forEach((field, i) => {
 *   renderField(field, result[i]) // field = metadata, result[i] = transformed value
 * })
 * ```
 */
export class MetadataDisplayReactor<A = BaseActor> extends DisplayReactor<A> {
  public adapter: CandidAdapter
  private candidSource?: string

  // Metadata storage
  private argumentMeta: ServiceArgumentsMeta<A> | null = null
  private resultMeta: ServiceResultMeta<A> | null = null

  // Visitors (stateless, can be reused)
  private static argVisitor = new ArgumentFieldVisitor()
  private static resultVisitor = new ResultFieldVisitor()

  constructor(config: CandidDisplayReactorParameters<A>) {
    const superConfig = { ...config }

    if (!superConfig.idlFactory) {
      superConfig.idlFactory = ({ IDL }) => IDL.Service({})
    }

    super(superConfig as DisplayReactorParameters<A>)

    this.candidSource = config.candid

    if (config.adapter) {
      this.adapter = config.adapter
    } else {
      this.adapter = new CandidAdapter({
        clientManager: this.clientManager,
      })
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Initializes the reactor by parsing Candid and generating all metadata.
   */
  public async initialize(): Promise<void> {
    let idlFactory: IDL.InterfaceFactory

    if (this.candidSource) {
      const definition = await this.adapter.parseCandidSource(this.candidSource)
      idlFactory = definition.idlFactory
    } else {
      const definition = await this.adapter.getCandidDefinition(this.canisterId)
      idlFactory = definition.idlFactory
    }

    this.service = idlFactory({ IDL })

    // Generate metadata using visitors
    this.generateMetadata()

    // Initialize display codecs for value transformation
    this.reinitializeCodecs()
  }

  /**
   * Generate all metadata from the service interface using visitors.
   */
  private generateMetadata(): void {
    const service = this.getServiceInterface()
    if (!service) return

    // Generate argument metadata
    this.argumentMeta = service.accept(
      MetadataDisplayReactor.argVisitor,
      null as any
    ) as ServiceArgumentsMeta<A>

    // Generate result metadata
    this.resultMeta = service.accept(
      MetadataDisplayReactor.resultVisitor,
      null as any
    ) as ServiceResultMeta<A>
  }

  /**
   * Re-initialize the display codecs after the service has been updated.
   */
  private reinitializeCodecs(): void {
    const fields = this.getServiceInterface()?._fields
    if (!fields) return

    const codecs = (this as any).codecs as Map<
      string,
      { args: any; result: any }
    >

    for (const [methodName, funcType] of fields) {
      if (codecs.has(methodName)) continue

      const argsIdlType = didTypeFromArray(funcType.argTypes)
      const retIdlType = didTypeFromArray(funcType.retTypes)

      codecs.set(methodName, {
        args: didToDisplayCodec(argsIdlType),
        result: didToDisplayCodec(retIdlType),
      })
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // METADATA ACCESS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Get argument field metadata for a method.
   * Use this to generate input forms.
   */
  public getArgumentMeta<M extends string>(
    methodName: M
  ): MethodArgumentsMeta<A> | undefined {
    return (this.argumentMeta as any)?.[methodName]
  }

  /**
   * Get result field metadata for a method.
   * Use this to render results.
   */
  public getResultMeta<M extends string>(
    methodName: M
  ): MethodResultMeta<A> | undefined {
    return (this.resultMeta as any)?.[methodName]
  }

  /**
   * Get all argument metadata.
   */
  public getAllArgumentMeta(): ServiceArgumentsMeta<A> | null {
    return this.argumentMeta
  }

  /**
   * Get all result metadata.
   */
  public getAllResultMeta(): ServiceResultMeta<A> | null {
    return this.resultMeta
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DYNAMIC METHOD REGISTRATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Register a dynamic method by its Candid signature.
   */
  public async registerMethod(options: DynamicMethodOptions): Promise<void> {
    const { functionName, candid } = options

    const existing = this.service._fields.find(
      ([name]) => name === functionName
    )
    if (existing) return

    const serviceSource = candid.includes("service :")
      ? candid
      : `service : { ${functionName} : ${candid}; }`

    const { idlFactory } = await this.adapter.parseCandidSource(serviceSource)
    const parsedService = idlFactory({ IDL })

    const funcField = parsedService._fields.find(
      ([name]) => name === functionName
    )
    if (!funcField) {
      throw new Error(
        `Method "${functionName}" not found in the provided Candid signature`
      )
    }

    // Inject into our service
    this.service._fields.push(funcField)

    // Regenerate metadata
    this.generateMetadata()

    // Re-initialize codecs
    this.reinitializeCodecs()
  }

  /**
   * Register multiple methods at once.
   */
  public async registerMethods(methods: DynamicMethodOptions[]): Promise<void> {
    await Promise.all(methods.map((m) => this.registerMethod(m)))
  }

  /**
   * Check if a method is registered.
   */
  public hasMethod(functionName: string): boolean {
    return this.service._fields.some(([name]) => name === functionName)
  }

  /**
   * Get all registered method names.
   */
  public getMethodNames(): string[] {
    return this.service._fields.map(([name]) => name)
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DYNAMIC CALL SHORTCUTS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Perform a dynamic call and return result with metadata.
   */
  public async callDynamicWithMeta<T = unknown>(
    options: DynamicMethodOptions & { args?: unknown[] }
  ): Promise<{ result: T; meta: MethodResultMeta<A> }> {
    await this.registerMethod(options)

    const result = (await this.callMethod({
      functionName: options.functionName as any,
      args: options.args as any,
    })) as T

    const meta = this.getResultMeta(options.functionName)!

    return { result, meta }
  }

  /**
   * Perform a dynamic call.
   */
  public async callDynamic<T = unknown>(
    options: DynamicMethodOptions & { args?: unknown[] }
  ): Promise<T> {
    await this.registerMethod(options)
    return this.callMethod({
      functionName: options.functionName as any,
      args: options.args as any,
    }) as T
  }
}

// Re-export visitor types
export type {
  // Argument types
  ArgumentField,
  MethodArgumentsMeta,
  ServiceArgumentsMeta,
  // Result types
  ResultField,
  MethodResultMeta,
  ServiceResultMeta,
}

// Re-export visitors
export { ArgumentFieldVisitor, ResultFieldVisitor }
