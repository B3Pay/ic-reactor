import type { BaseActor, FunctionName } from "@ic-reactor/core"
import { hexToUint8Array } from "@ic-reactor/core"
import { IDL } from "@icp-sdk/core/candid"
import { CandidDisplayReactor } from "./display-reactor"
import type {
  CandidDisplayReactorParameters,
  DynamicMethodOptions,
} from "./types"
import {
  CandidFriendlyFormVisitor,
  FriendlyServiceMeta,
  FormArgumentsMeta,
  FormFieldNode,
  VariableRefCandidate,
} from "./visitor/friendly"

export type ExprHydration =
  | { status: "empty" }
  | { status: "hydrated"; values: unknown[] }
  | { status: "skipped"; reason: string }
  | { status: "error"; message: string }

export type CandidFormMetadata = {
  meta: FormArgumentsMeta
  hydration: ExprHydration
}

export type MethodMetadataOptions = {
  candidArgsHex?: string
  skipHydrationIfContains?: string
}

export class CandidMetadataReactor<
  A = BaseActor,
> extends CandidDisplayReactor<A> {
  private methodMeta: FriendlyServiceMeta<A> | null = null
  private static formVisitor = new CandidFriendlyFormVisitor()

  constructor(config: CandidDisplayReactorParameters<A>) {
    super(config)
    if (config.funcClass || config.idlFactory) {
      this.generateMetadata()
    }
  }

  public override async initialize(): Promise<void> {
    await super.initialize()
    this.generateMetadata()
  }

  public getInputMeta<M extends FunctionName<A>>(
    methodName: M
  ): FormArgumentsMeta | undefined {
    return this.methodMeta?.[methodName]
  }

  public getAllInputMeta(): FriendlyServiceMeta<A> | null {
    return this.methodMeta
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
    const meta = CandidMetadataReactor.formVisitor.buildValueMeta(parsed.type)
    const hydration = this.hydrateValues([parsed.type], options)
    return { meta, hydration }
  }

  public buildMethodVariableCandidates<M extends FunctionName<A>>(
    methodName: M
  ): VariableRefCandidate[] {
    const method = this.findMethod(String(methodName))
    if (!method) return []

    const visitor = new CandidFriendlyFormVisitor()
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

  private generateMetadata(): void {
    const service = this.getServiceInterface()
    if (!service) return
    this.methodMeta = service.accept(
      CandidMetadataReactor.formVisitor,
      null as any
    ) as FriendlyServiceMeta<A>
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
    const firstArg = Array.isArray(func.argTypes) ? func.argTypes[0] : undefined
    if (!firstArg) {
      throw new Error("Value type must produce exactly one value field")
    }

    return { type: firstArg }
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
      const visitor = new CandidFriendlyFormVisitor()
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
}
