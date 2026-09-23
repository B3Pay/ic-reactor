import type {
  ActorMethodReturnType,
  BaseActor,
  FunctionName,
  ReactorParameters,
} from "@ic-reactor/core"
import { hexToUint8Array } from "@ic-reactor/core"
import { IDL } from "@icp-sdk/core/candid"
import { CandidReactor } from "./reactor.js"
import type {
  DynamicMethodOptions,
  MetadataReactorParameters,
} from "./types.js"
import {
  CandidFormVisitor,
  FormServiceMeta,
  FormArgumentsMeta,
  FormFieldNode,
  VariableRefCandidate,
  MethodMetadataOptions,
  CandidFormMetadata,
  ExprHydration,
} from "./visitor/candid/index.js"
import { MetadataError } from "./visitor/arguments/index.js"
import { methodFunc } from "./visitor/method-func.js"
import {
  MethodMeta,
  MethodResult,
  ResultFieldVisitor,
  ServiceMeta,
} from "./visitor/returns/index.js"

declare module "@ic-reactor/core" {
  /* eslint-disable @typescript-eslint/no-unused-vars -- the type parameter is
     not referenced by this declaration, but TypeScript requires every
     declaration of an augmented interface to carry identical type parameters
     (TS2428), so it cannot be renamed to the `_`-prefixed form the rule
     accepts. Verified: renaming yields TS2428 plus TS2304. */
  interface TransformArgsRegistry<T> {
    metadata: TransformArgsRegistry<T>["candid"]
  }
  interface TransformReturnRegistry<T, A = BaseActor> {
    metadata: MethodResult<A>
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */
}

/**
 * Runtime form metadata reactor for Candid interfaces.
 *
 * Extends {@link CandidReactor} and adds method input/output metadata generation
 * powered by {@link CandidFormVisitor}. Returned field metadata includes:
 * - `schema` (Zod validation)
 * - `component` (UI component hint)
 * - `renderHint` (primitive/compound + input hint)
 */
export class MetadataReactor<A = BaseActor> extends CandidReactor<
  A,
  "metadata"
> {
  public override readonly transform = "metadata" as const

  private methodMeta: FormServiceMeta<A> | null = null
  private resultMeta: ServiceMeta<A> | null = null
  // One pair of visitors per reactor. The form visitor caches a schema per
  // recursive type, keyed by a name no other type shares, and each schema
  // holds its type. Shared by every instance, the cache kept every service
  // any reactor had described alive for good.
  private formVisitor = new CandidFormVisitor()
  private resultVisitor = new ResultFieldVisitor()

  constructor(config: MetadataReactorParameters) {
    const superConfig = { ...config }

    if (config.funcClass && !superConfig.idlFactory) {
      const { methodName, func } = config.funcClass
      superConfig.idlFactory = ({ IDL }) => IDL.Service({ [methodName]: func })
    }

    super(superConfig as ReactorParameters)

    if (config.funcClass || config.idlFactory) {
      this.generateMetadata()
    }
  }

  public override async initialize(): Promise<void> {
    await super.initialize()
    this.generateMetadata()
  }

  private generateMetadata(): void {
    const service = this.getServiceInterface()
    if (!service) return
    this.methodMeta = service.accept(
      this.formVisitor,
      null as any
    ) as FormServiceMeta<A>
    this.resultMeta = service.accept(
      this.resultVisitor,
      null as any
    ) as ServiceMeta<A>
  }

  /**
   * Get form metadata for a single method.
   */
  public getInputMeta<M extends FunctionName<A>>(
    methodName: M
  ): FormArgumentsMeta | undefined {
    // Only a method's own entry: a plain read also found what every object
    // inherits, so "toString" returned Object.prototype.toString.
    const meta = this.methodMeta
    return meta && Object.prototype.hasOwnProperty.call(meta, methodName)
      ? meta[methodName]
      : undefined
  }

  /**
   * Get form metadata for all service methods.
   */
  public getAllInputMeta(): FormServiceMeta<A> | null {
    return this.methodMeta
  }

  public getOutputMeta<M extends FunctionName<A>>(
    methodName: M
  ): MethodMeta<A, M> | undefined {
    const meta = this.resultMeta
    return meta && Object.prototype.hasOwnProperty.call(meta, methodName)
      ? meta[methodName]
      : undefined
  }

  public getAllOutputMeta(): ServiceMeta<A> | null {
    return this.resultMeta
  }

  public async buildForMethod<M extends FunctionName<A>>(
    methodName: M,
    options: MethodMetadataOptions = {}
  ): Promise<CandidFormMetadata> {
    const method = this.findMethod(String(methodName))
    if (!method) {
      throw new Error(`Method "${String(methodName)}" not found`)
    }

    const meta = this.getInputMeta(methodName)
    if (!meta) {
      throw new Error(`Method "${String(methodName)}" metadata not found`)
    }
    const hydration = this.hydrateValues(method.func.argTypes ?? [], options)
    return { meta, hydration }
  }

  public async buildForValueType(
    valueType: string,
    options: MethodMetadataOptions = {}
  ): Promise<CandidFormMetadata> {
    const parsed = await this.parseValueType(valueType)
    const meta = this.formVisitor.buildValueMeta(parsed.type)
    const hydration = this.hydrateValues([parsed.type], options)
    return { meta, hydration }
  }

  public buildMethodVariableCandidates<M extends FunctionName<A>>(
    methodName: M
  ): VariableRefCandidate[] {
    const method = this.findMethod(String(methodName))
    if (!method) return []

    const visitor = new CandidFormVisitor()
    const retTypes = Array.isArray(method.func.retTypes)
      ? method.func.retTypes
      : []

    if (retTypes.length === 1 && retTypes[0]) {
      const resultField = visitor.buildFieldForType(
        retTypes[0],
        method.name,
        `$${method.name}`
      )
      return visitor.collectRefCandidatesFromRoot(
        method.name,
        `$${method.name}`,
        `$${method.name}`,
        resultField
      )
    }

    if (retTypes.length > 1) {
      const resultField = visitor.buildTupleFieldForTypes(
        retTypes,
        method.name,
        `$${method.name}`
      )
      return visitor.collectRefCandidatesFromRoot(
        method.name,
        `$${method.name}`,
        `$${method.name}`,
        resultField
      )
    }

    return []
  }

  public override async registerMethod(
    options: DynamicMethodOptions
  ): Promise<void> {
    await super.registerMethod(options)
    this.addMethodMetadata(options.functionName)
  }

  /**
   * Describe a method registered after the rest of the metadata was built.
   *
   * Only that method is visited. Rebuilding the metadata of the whole service
   * made each registration cost as much as the service was large, registering
   * n methods one at a time cost n², and a repeat registration, which every
   * callDynamic and fetchQueryDynamic makes, replaced the metadata objects of
   * every method without changing any of them.
   */
  private addMethodMetadata(methodName: string): void {
    if (!this.methodMeta || !this.resultMeta) {
      this.generateMetadata()
      return
    }
    if (
      Object.prototype.hasOwnProperty.call(this.methodMeta, methodName) &&
      Object.prototype.hasOwnProperty.call(this.resultMeta, methodName)
    ) {
      return
    }

    const method = this.getServiceInterface()._fields.find(
      ([name]) => name === methodName
    )
    if (!method) return

    // Visited as a service of its own, so the method is described exactly
    // as generateMetadata() describes it.
    const service = IDL.Service({ [method[0]]: method[1] })
    this.methodMeta = {
      ...this.methodMeta,
      ...(service.accept(this.formVisitor, null as any) as FormServiceMeta<A>),
    }
    this.resultMeta = {
      ...this.resultMeta,
      ...(service.accept(this.resultVisitor, null as any) as ServiceMeta<A>),
    }
  }

  private findMethod(
    methodName: string
  ): { name: string; func: IDL.FuncClass } | null {
    const service = this.getServiceInterface()
    if (!service) return null
    const field = service._fields.find(([name]) => name === methodName)
    if (!field) return null
    // Unwrapped as the visitors do: a method typed by a recursive func alias
    // is an IDL.Rec with no argTypes or retTypes of its own.
    const func = methodFunc(field[1])
    return func ? { name: field[0], func } : null
  }

  private async parseValueType(valueType: string): Promise<{ type: IDL.Type }> {
    const normalized = String(valueType ?? "").trim()
    if (!normalized) {
      throw new Error("Provide a value type first.")
    }

    // The type gets lines of its own. On the service's line, a `//` comment
    // closing the type, as one copied from a .did file often has, commented
    // out the `) -> (); }` after it, and the source no longer parsed.
    const serviceSource = `service : { __value : (\n${normalized}\n) -> (); }`
    const { idlFactory } = await this.adapter.parseCandidSource(serviceSource)
    const service = idlFactory({ IDL })
    const funcField = service._fields.find(
      ([name]: [string, unknown]) => name === "__value"
    )
    if (!funcField) {
      throw new Error('Value parser method "__value" not found')
    }

    const func = funcField[1] as IDL.FuncClass
    const argTypes = Array.isArray(func.argTypes) ? func.argTypes : []
    if (argTypes.length !== 1) {
      throw new Error(
        `Value type must produce exactly one type, got ${argTypes.length}`
      )
    }

    return { type: argTypes[0] }
  }

  private hydrateValues(
    argTypes: IDL.Type[],
    options: MethodMetadataOptions
  ): ExprHydration {
    const candidArgsHex = String(options.candidArgsHex ?? "").trim()
    if (!candidArgsHex) {
      return { status: "empty" }
    }

    const skipToken = options.skipHydrationIfContains
    if (skipToken && candidArgsHex.includes(skipToken)) {
      return {
        status: "skipped",
        reason: `Input contains "${skipToken}". Using schema defaults.`,
      }
    }

    try {
      const decoded = IDL.decode(argTypes, hexToUint8Array(candidArgsHex))
      const visitor = new CandidFormVisitor()
      const fields: FormFieldNode[] = argTypes
        .map(
          (argType, index) =>
            visitor.buildFunctionMeta(
              new IDL.FuncClass([argType], []),
              `__arg${index}`
            ).args[0]
        )
        .filter((field): field is FormFieldNode => Boolean(field))

      return {
        status: "hydrated",
        values: visitor.toFormValuesFromDecodedArgs(fields, decoded),
      }
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }

  protected override transformResult<M extends FunctionName<A>>(
    methodName: M,
    result: ActorMethodReturnType<A[M]>
  ): MethodResult<A> {
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
}
