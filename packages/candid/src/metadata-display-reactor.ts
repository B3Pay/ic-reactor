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

export class MetadataDisplayReactor<A = BaseActor> extends CandidDisplayReactor<
  A,
  "metadata"
> {
  public override readonly transform = "metadata" as const

  // Metadata storage
  private argumentMeta: ServiceArgumentsMeta<A> | null = null
  private resultMeta: ServiceResultMeta<A> | null = null

  // Visitors (stateless, can be reused)
  private static argVisitor = new ArgumentFieldVisitor()
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

    return meta.generateMetadata(result) as ResolvedMethodResult<A>
  }

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
   * Perform a dynamic query call in one step with display type transformations.
   */
  public override async queryDynamic<T = unknown>(
    options: DynamicMethodOptions & { args?: unknown[] }
  ): Promise<T> {
    return super.queryDynamic(options) as Promise<T>
  }

  /**
   * Fetch with dynamic Candid and TanStack Query caching.
   */
  public override async fetchQueryDynamic<T = unknown>(
    options: DynamicMethodOptions & { args?: unknown[] }
  ): Promise<T> {
    return super.fetchQueryDynamic(options) as Promise<T>
  }
}
