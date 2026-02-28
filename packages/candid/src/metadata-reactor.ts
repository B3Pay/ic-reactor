import type {
  ActorMethodReturnType,
  BaseActor,
  FunctionName,
  ReactorParameters,
} from "@ic-reactor/core"
import { hexToUint8Array } from "@ic-reactor/core"
import { IDL } from "@icp-sdk/core/candid"
import { CandidReactor } from "./reactor"
import type { DynamicMethodOptions, MetadataReactorParameters } from "./types"
import {
  CandidFormVisitor,
  FormServiceMeta,
  FormArgumentsMeta,
  FormFieldNode,
  VariableRefCandidate,
  MethodMetadataOptions,
  CandidFormMetadata,
  ExprHydration,
} from "./visitor/candid"
import { MetadataError } from "./visitor/arguments"
import {
  MethodMeta,
  MethodResult,
  ResultFieldVisitor,
  ServiceMeta,
} from "./visitor/returns"

declare module "@ic-reactor/core" {
  interface TransformArgsRegistry<T> {
    metadata: TransformArgsRegistry<T>["candid"]
  }
  interface TransformReturnRegistry<T, A = BaseActor> {
    metadata: MethodResult<A>
  }
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
  private static formVisitor = new CandidFormVisitor()
  private static resultVisitor = new ResultFieldVisitor()

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
      MetadataReactor.formVisitor,
      null as any
    ) as FormServiceMeta<A>
    this.resultMeta = service.accept(
      MetadataReactor.resultVisitor,
      null as any
    ) as ServiceMeta<A>
  }

  /**
   * Get form metadata for a single method.
   */
  public getInputMeta<M extends FunctionName<A>>(
    methodName: M
  ): FormArgumentsMeta | undefined {
    return this.methodMeta?.[methodName]
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
    return this.resultMeta?.[methodName]
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
      throw new Error(`Method \"${String(methodName)}\" not found`)
    }

    const meta = this.getInputMeta(methodName)
    if (!meta) {
      throw new Error(`Method \"${String(methodName)}\" metadata not found`)
    }
    const hydration = this.hydrateValues(method.func.argTypes ?? [], options)
    return { meta, hydration }
  }

  public async buildForValueType(
    valueType: string,
    options: MethodMetadataOptions = {}
  ): Promise<CandidFormMetadata> {
    const parsed = await this.parseValueType(valueType)
    const meta = MetadataReactor.formVisitor.buildValueMeta(parsed.type)
    const hydration = this.hydrateValues([parsed.type], options)
    return { meta, hydration }
  }

  public buildMethodVariableCandidates<M extends FunctionName<A>>(
    methodName: M
  ): VariableRefCandidate[] {
    const method = this.findMethod(String(methodName))
    if (!method) return []

    const visitor = new CandidFormVisitor()
    const out: VariableRefCandidate[] = []

    const argMeta = visitor.buildFunctionMeta(method.func, method.name)
    for (let argIndex = 0; argIndex < argMeta.args.length; argIndex += 1) {
      const argField = argMeta.args[argIndex]
      if (!argField) continue
      const suffix = argMeta.args.length === 1 ? "" : `.${argIndex}`
      out.push(
        ...visitor.collectRefCandidatesFromRoot(
          method.name,
          "arg",
          `$${method.name}.arg${suffix}`,
          `$${method.name}.arg${suffix}`,
          argField
        )
      )
    }

    const retTypes = Array.isArray(method.func.retTypes)
      ? method.func.retTypes
      : []
    if (retTypes.length === 1 && retTypes[0]) {
      const resultField = visitor.buildFieldForType(retTypes[0], "ret", "$ret")
      out.push(
        ...visitor.collectRefCandidatesFromRoot(
          method.name,
          "ret",
          `$${method.name}.ret`,
          `$${method.name}.ret`,
          resultField
        )
      )
    } else if (retTypes.length > 1) {
      const resultField = visitor.buildTupleFieldForTypes(
        retTypes,
        "ret",
        "$ret"
      )
      out.push(
        ...visitor.collectRefCandidatesFromRoot(
          method.name,
          "ret",
          `$${method.name}.ret`,
          `$${method.name}.ret`,
          resultField
        )
      )
    }

    return out
  }

  public override async registerMethod(
    options: DynamicMethodOptions
  ): Promise<void> {
    await super.registerMethod(options)
    this.generateMetadata()
  }

  private findMethod(
    methodName: string
  ): { name: string; func: IDL.FuncClass } | null {
    const service = this.getServiceInterface()
    if (!service) return null
    const field = service._fields.find(([name]) => name === methodName)
    if (!field) return null
    return { name: field[0], func: field[1] as IDL.FuncClass }
  }

  private async parseValueType(valueType: string): Promise<{ type: IDL.Type }> {
    const normalized = String(valueType ?? "").trim()
    if (!normalized) {
      throw new Error("Provide a value type first.")
    }

    const serviceSource = `service : { __value : (${normalized}) -> (); }`
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
        reason: `Input contains \"${skipToken}\". Using schema defaults.`,
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
