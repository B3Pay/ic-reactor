import type {
  ActorMethodReturnType,
  BaseActor,
  FunctionName,
  ReactorParameters,
} from "@ic-reactor/core"
import { Reactor } from "@ic-reactor/core"
import { IDL } from "@icp-sdk/core/candid"
import { CandidAdapter } from "./adapter"
import type {
  CandidDisplayReactorParameters,
  DynamicMethodOptions,
} from "./types"

import {
  ArgumentFieldVisitor,
  MethodArgumentsMeta,
  ServiceArgumentsMeta,
} from "./visitor/arguments"
import {
  MethodResultMeta,
  ResolvedMethodResult,
  ResultFieldVisitor,
  ServiceResultMeta,
} from "./visitor/returns"

// ============================================================================
// MetadataDisplayReactor
// ============================================================================

/**
 * MetadataDisplayReactor combines visitor-based metadata generation
 * for both input forms and result display.
 *
 * ## Architecture
 *
 * It extends the base Reactor and adds metadata generation capabilities.
 * Unlike DisplayReactor, it does not use a separate codec for transformation.
 * Instead, it uses the metadata visitor to resolve raw values into display-ready structures.
 */
declare module "@ic-reactor/core" {
  interface TransformReturnRegistry<T, A = BaseActor> {
    metadata: ResolvedMethodResult<A>
  }
  interface TransformArgsRegistry<T> {
    metadata: TransformArgsRegistry<T>["display"]
  }
}

export class MetadataDisplayReactor<A = BaseActor> extends Reactor<
  A,
  "metadata"
> {
  public readonly transform = "metadata" as const
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

    super(superConfig as ReactorParameters)

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

  // ══════════════════════════════════════════════════════════════════════════
  // METADATA ACCESS
  // ══════════════════════════════════════════════════════════════════════════
  protected transformResult<M extends FunctionName<A>>(
    methodName: M,
    result: ActorMethodReturnType<A[M]>
  ): ResolvedMethodResult<A> {
    // Get metadata and generate resolved result
    const meta = this.getResultMeta(methodName)
    if (!meta) {
      throw new Error(`No metadata found for method "${methodName}"`)
    }

    return meta.generateMetadata(result) as ResolvedMethodResult<A>
  }

  /**
   * Get argument field metadata for a method.
   * Use this to generate input forms.
   */
  public getArgumentMeta<M extends FunctionName<A>>(
    methodName: M
  ): MethodArgumentsMeta<A, M> | undefined {
    return this.argumentMeta?.[methodName]
  }

  /**
   * Get result field metadata for a method.
   * Use this to render results.
   */
  public getResultMeta<M extends FunctionName<A>>(
    methodName: M
  ): MethodResultMeta<A, M> | undefined {
    return this.resultMeta?.[methodName]
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

    const meta = this.getResultMeta(options.functionName as any)!

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
