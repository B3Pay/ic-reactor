import type {
  ActorMethodReturnType,
  BaseActor,
  FunctionName,
} from "@ic-reactor/core"
import { CandidDisplayReactor } from "./display-reactor"
import type {
  CandidDisplayReactorParameters,
  DynamicMethodOptions,
} from "./types"
import {
  FieldVisitor,
  ArgumentsMeta,
  ArgumentsServiceMeta,
} from "./visitor/arguments"
import {
  MethodMeta,
  ResolvedMethodResult,
  ResultFieldVisitor,
  ServiceMeta,
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
  interface TransformArgsRegistry<T> {
    metadata: TransformArgsRegistry<T>["display"]
  }
  interface TransformReturnRegistry<T, A = BaseActor> {
    metadata: ResolvedMethodResult<A>
  }
}

export class MetadataDisplayReactor<A = BaseActor> extends CandidDisplayReactor<
  A,
  "metadata"
> {
  public override readonly transform = "metadata" as const

  // Metadata storage
  private argumentMeta: ArgumentsServiceMeta<A> | null = null
  private resultMeta: ServiceMeta<A> | null = null

  // Visitors (stateless, can be reused)
  private static argVisitor = new FieldVisitor()
  private static resultVisitor = new ResultFieldVisitor()

  constructor(config: CandidDisplayReactorParameters<A>) {
    super(config)
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Initializes the reactor by parsing Candid and generating all metadata.
   */
  public override async initialize(): Promise<void> {
    await super.initialize()

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
    ) as ArgumentsServiceMeta<A>

    // Generate result metadata
    this.resultMeta = service.accept(
      MetadataDisplayReactor.resultVisitor,
      null as any
    ) as ServiceMeta<A>
  }

  // ══════════════════════════════════════════════════════════════════════════
  // METADATA ACCESS
  // ══════════════════════════════════════════════════════════════════════════
  /**
   * Get argument field metadata for a method.
   * Use this to generate input forms.
   */
  public getArgumentMeta<M extends FunctionName<A>>(
    methodName: M
  ): ArgumentsMeta<A, M> | undefined {
    return this.argumentMeta?.[methodName]
  }

  /**
   * Get result field metadata for a method.
   * Use this to render results.
   */
  public getResultMeta<M extends FunctionName<A>>(
    methodName: M
  ): MethodMeta<A, M> | undefined {
    return this.resultMeta?.[methodName]
  }

  /**
   * Get all argument metadata.
   */
  public getAllArgumentMeta(): ArgumentsServiceMeta<A> | null {
    return this.argumentMeta
  }

  /**
   * Get all result metadata.
   */
  public getAllResultMeta(): ServiceMeta<A> | null {
    return this.resultMeta
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DYNAMIC METHOD REGISTRATION
  // ══════════════════════════════════════════════════════════════════════════
  /**
   * Register a dynamic method by its Candid signature.
   * After registration, all DisplayReactor methods work with display type transformations.
   */
  public override async registerMethod(
    options: DynamicMethodOptions
  ): Promise<void> {
    await super.registerMethod(options)

    // Regenerate metadata
    this.generateMetadata()
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DYNAMIC CALL SHORTCUTS
  // ══════════════════════════════════════════════════════════════════════════
  protected override transformResult<M extends FunctionName<A>>(
    methodName: M,
    result: ActorMethodReturnType<A[M]>
  ): ResolvedMethodResult<A> {
    // Get metadata and generate resolved result
    const meta = this.getResultMeta(methodName)
    if (!meta) {
      throw new Error(`No metadata found for method "${methodName}"`)
    }

    return meta.resolve(result)
  }

  /**
   * Perform a dynamic call and return result with metadata.
   */
  public async callDynamicWithMeta<T = unknown>(
    options: DynamicMethodOptions & { args?: unknown[] }
  ): Promise<{ result: T; meta: MethodMeta<A> }> {
    await this.registerMethod(options)

    const result = (await this.callMethod({
      functionName: options.functionName as any,
      args: options.args as any,
    })) as T

    const meta = this.getResultMeta(options.functionName as any)!

    return { result, meta }
  }
}
