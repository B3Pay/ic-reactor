import type { AgentLike } from "../index.js"
import type { AnySchema, ServiceSchema } from "../schema.js"
import type { CandidProgram } from "../index.js"
import { programToFormSchema } from "./form.js"
import { candidTypeText, irToSchema } from "./ir-to-schema.js"
import { RuntimeMethodImpl } from "./method.js"
import { programToWorkflowSchema } from "./workflow.js"
import type {
  CandidArgIR,
  CandidProgramIR,
  CandidTypeIR,
  DynamicActor,
  DynamicActorCallOptions,
  FormSchemaOptions,
  ProgramFormSchema,
  ProgramWorkflowSchema,
  RuntimeActorOptions,
  RuntimeArgInfo,
  RuntimeMethod,
  RuntimeMethodInfo,
  RuntimeProgram,
  RuntimeTypeInfo,
} from "./types.js"

export class RuntimeProgramImpl implements RuntimeProgram {
  readonly source: string
  readonly ir: CandidProgramIR
  readonly service: ServiceSchema<any>

  readonly #program: CandidProgram
  readonly #formOptions: FormSchemaOptions
  readonly #typeSchemas: Map<string, AnySchema>
  readonly #methods = new Map<string, RuntimeMethod>()
  readonly #types = new Map<string, CandidTypeIR>()

  constructor(options: {
    source: string
    ir: CandidProgramIR
    program: CandidProgram
    formOptions?: FormSchemaOptions
  }) {
    this.source = options.source
    this.ir = options.ir
    this.#program = options.program
    this.#formOptions = options.formOptions ?? {}

    for (const declaration of this.ir.types) {
      this.#types.set(declaration.name, declaration.type)
    }

    const schemas = irToSchema(this.ir)
    this.#typeSchemas = schemas.typeSchemas
    this.service = schemas.service

    for (const method of this.ir.service.methods) {
      const schema = schemas.methodSchemas.get(method.name)
      if (!schema) {
        throw new Error(
          `method schema ${JSON.stringify(method.name)} was not built`
        )
      }
      const runtimeMethod = new RuntimeMethodImpl({
        program: this.#program,
        ir: this.ir,
        methodIr: method,
        schema,
        formOptions: this.#formOptions,
        args: method.args.map((arg, index) => this.argInfo(arg, `arg${index}`)),
        returns: method.returns.map((arg, index) =>
          this.argInfo(arg, `return${index}`)
        ),
      })
      this.#methods.set(method.name, runtimeMethod)
    }
  }

  listTypes(): RuntimeTypeInfo[] {
    return this.ir.types.map((declaration) => {
      const info: RuntimeTypeInfo = {
        name: declaration.name,
        candidType: candidTypeText(declaration.type, this),
      }
      if (declaration.docs?.length) {
        info.docs = declaration.docs
      }
      if (declaration.rawDocs?.length) {
        info.rawDocs = declaration.rawDocs
      }
      if (declaration.docTags?.length) {
        info.docTags = declaration.docTags
      }
      return info
    })
  }

  listMethods(): RuntimeMethodInfo[] {
    return this.ir.service.methods.map((method) => {
      const info: RuntimeMethodInfo = {
        name: method.name,
        mode: method.mode,
        args: method.args.map((arg, index) => this.argInfo(arg, `arg${index}`)),
        returns: method.returns.map((arg, index) =>
          this.argInfo(arg, `return${index}`)
        ),
      }
      if (method.docs?.length) {
        info.docs = method.docs
      }
      if (method.rawDocs?.length) {
        info.rawDocs = method.rawDocs
      }
      if (method.docTags?.length) {
        info.docTags = method.docTags
      }
      return info
    })
  }

  type(name: string): AnySchema {
    const schema = this.#typeSchemas.get(name)
    if (!schema) {
      throw new Error(`Candid type ${JSON.stringify(name)} not found`)
    }
    return schema
  }

  method(name: string): RuntimeMethod {
    const method = this.#methods.get(name)
    if (!method) {
      throw new Error(`method ${JSON.stringify(name)} not found`)
    }
    return method
  }

  createActor(options: RuntimeActorOptions): DynamicActor {
    const methodCallOptions = (
      args: readonly unknown[],
      callOptions: DynamicActorCallOptions
    ) => {
      const out: Parameters<RuntimeMethod["call"]>[0] = {
        agent: options.agent,
        canisterId: options.canisterId,
        args,
      }
      const effectiveCanisterId =
        callOptions.effectiveCanisterId ?? options.effectiveCanisterId
      const pollingOptions =
        callOptions.pollingOptions ?? options.pollingOptions
      const nonce = callOptions.nonce ?? options.nonce
      const callSync = callOptions.callSync ?? options.callSync

      if (effectiveCanisterId !== undefined) {
        out.effectiveCanisterId = effectiveCanisterId
      }
      if (pollingOptions !== undefined) {
        out.pollingOptions = pollingOptions
      }
      if (nonce !== undefined) {
        out.nonce = nonce
      }
      if (callSync !== undefined) {
        out.callSync = callSync
      }
      return out
    }

    return {
      call: (methodName, args, callOptions = {}) =>
        this.method(methodName).call(methodCallOptions(args, callOptions)),
      query: (methodName, args, callOptions = {}) => {
        const method = this.method(methodName)
        if (method.mode !== "query" && method.mode !== "composite_query") {
          throw new Error(`method ${JSON.stringify(methodName)} is not a query`)
        }
        return method.call(methodCallOptions(args, callOptions))
      },
      update: (methodName, args, callOptions = {}) => {
        const method = this.method(methodName)
        if (method.mode !== "update") {
          throw new Error(
            `method ${JSON.stringify(methodName)} is not an update`
          )
        }
        return method.call(methodCallOptions(args, callOptions))
      },
      method: (name) => this.method(name),
      listMethods: () => this.listMethods(),
    }
  }

  toFormSchema(): ProgramFormSchema {
    return programToFormSchema(this.ir, this.#formOptions)
  }

  toWorkflowSchema(): ProgramWorkflowSchema {
    return programToWorkflowSchema(this.ir, this.#formOptions)
  }

  typeByName(name: string): CandidTypeIR | undefined {
    return this.#types.get(name)
  }

  private argInfo(arg: CandidArgIR, fallbackName: string): RuntimeArgInfo {
    const info: RuntimeArgInfo = {
      name: arg.name ?? fallbackName,
      candidType: candidTypeText(arg.type, this),
    }
    if (arg.docs?.length) {
      info.docs = arg.docs
    }
    if (arg.rawDocs?.length) {
      info.rawDocs = arg.rawDocs
    }
    if (arg.docTags?.length) {
      info.docTags = arg.docTags
    }
    return info
  }
}
