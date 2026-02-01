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
  MetadataError,
} from "./visitor/arguments"
import {
  MethodMeta,
  MethodResult,
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
 *
 * ## Usage
 *
 * ```typescript
 * const reactor = new MetadataDisplayReactor({
 *   canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
 *   clientManager,
 *   name: "ICPLedger",
 * })
 *
 * await reactor.initialize()
 *
 * // Get form metadata
 * const argMeta = reactor.getInputMeta("icrc1_transfer")
 * console.log(argMeta.args)     // Field descriptors
 * console.log(argMeta.defaults) // Default values
 *
 * // Get result metadata
 * const resultMeta = reactor.getOutputMeta("icrc1_transfer")
 *
 * // Call with display types
 * const result = await reactor.callMethod({
 *   functionName: "icrc1_transfer",
 *   args: [{ to: { owner: "aaaaa-aa" }, amount: "1000000" }]
 * })
 * ```
 */
declare module "@ic-reactor/core" {
  interface TransformArgsRegistry<T> {
    metadata: TransformArgsRegistry<T>["display"]
  }
  interface TransformReturnRegistry<T, A = BaseActor> {
    metadata: MethodResult<A>
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
   * Get input field metadata for a method.
   * Use this to generate input forms.
   *
   * @param methodName The method name to get metadata for
   * @returns ArgumentsMeta containing args, defaults, and validation schema
   */
  public getInputMeta<M extends FunctionName<A>>(
    methodName: M
  ): ArgumentsMeta<A, M> | undefined {
    return this.argumentMeta?.[methodName]
  }

  /**
   * Get output field metadata for a method.
   * Use this to render results.
   *
   * @param methodName The method name to get metadata for
   * @returns MethodMeta containing return schema and resolve function
   */
  public getOutputMeta<M extends FunctionName<A>>(
    methodName: M
  ): MethodMeta<A, M> | undefined {
    return this.resultMeta?.[methodName]
  }

  /**
   * Get all input metadata for all methods.
   */
  public getAllInputMeta(): ArgumentsServiceMeta<A> | null {
    return this.argumentMeta
  }

  /**
   * Get all output metadata for all methods.
   */
  public getAllOutputMeta(): ServiceMeta<A> | null {
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
  ): MethodResult<A> {
    // Get metadata and generate resolved result
    const meta = this.getOutputMeta(methodName)
    if (!meta) {
      throw new MetadataError(
        `No output metadata found for method`,
        String(methodName),
        "method"
      )
    }

    return meta.resolve(result)
  }

  /**
   * Perform a dynamic call and return result with metadata.
   *
   * @param options Method registration and call options
   * @returns Object containing the result and metadata
   */
  public async callDynamicWithMeta<T = unknown>(
    options: DynamicMethodOptions & { args?: unknown[] }
  ): Promise<{ result: T; meta: MethodMeta<A> }> {
    await this.registerMethod(options)

    const result = (await this.callMethod({
      functionName: options.functionName as any,
      args: options.args as any,
    })) as T

    const meta = this.getOutputMeta(options.functionName as any)!

    return { result, meta }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Factory Function
// ════════════════════════════════════════════════════════════════════════════

/**
 * Create and initialize a MetadataDisplayReactor.
 * This is a convenience function that creates the reactor and calls initialize().
 *
 * @param options Reactor configuration options
 * @returns Initialized MetadataDisplayReactor
 *
 * @example
 * ```typescript
 * const reactor = await createMetadataReactor({
 *   canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
 *   clientManager,
 *   name: "ICPLedger",
 * })
 *
 * // Reactor is ready to use
 * const methods = reactor.getMethodNames()
 * ```
 */
export async function createMetadataReactor<A = BaseActor>(
  options: CandidDisplayReactorParameters<A>
): Promise<MetadataDisplayReactor<A>> {
  const reactor = new MetadataDisplayReactor<A>(options)
  await reactor.initialize()
  return reactor
}
