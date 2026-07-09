import type { AgentLike } from "../index.js"
import type { AnySchema, ServiceSchema } from "../schema.js"
import type { CandidProgram } from "../index.js"
import { candidTypeTextId, candidTypeTextRef } from "./candid-format.js"
import { programToFormSchema } from "./form.js"
import { irToSchema } from "./ir-to-schema.js"
import { RuntimeMethodImpl } from "./method.js"
import { ProgramIrGraph, validateProgramIR } from "./program-ir.js"
import { ProgramSemanticsGraph } from "./semantics.js"
import { programToWorkflowSchema } from "./workflow.js"
import type {
  DynamicActor,
  DynamicActorCallOptions,
  DeclId,
  FormSchemaOptions,
  ProgramArgIR,
  ProgramFormSchema,
  ProgramIR,
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
  readonly ir: ProgramIR
  readonly service: ServiceSchema<any>

  readonly #program: CandidProgram
  readonly #formOptions: FormSchemaOptions
  readonly #graph: ProgramIrGraph
  readonly #semantics: ProgramSemanticsGraph
  readonly #typeSchemas: Map<string, AnySchema>
  readonly #methods = new Map<string, RuntimeMethod>()

  constructor(options: {
    source: string
    ir: ProgramIR
    program: CandidProgram
    formOptions?: FormSchemaOptions
  }) {
    this.source = options.source
    validateProgramIR(options.ir)
    this.ir = options.ir
    this.#program = options.program
    this.#formOptions = options.formOptions ?? {}
    this.#graph = new ProgramIrGraph(options.ir)
    this.#semantics = new ProgramSemanticsGraph(this.#graph)

    const schemas = irToSchema(this.ir)
    this.#typeSchemas = schemas.typeSchemas
    this.service = schemas.service

    for (const methodId of this.#graph.actorMethodIds()) {
      const method = this.#graph.method(methodId)
      const schema = schemas.methodSchemas.get(method.name)
      if (!schema) {
        throw new Error(
          `method schema ${JSON.stringify(method.name)} was not built`
        )
      }
      const runtimeMethod = new RuntimeMethodImpl({
        program: this.#program,
        ir: this.ir,
        graph: this.#graph,
        semantics: this.#semantics,
        methodId,
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
    return this.ir.declarations.map((declaration, index) => {
      const declarationId = index as DeclId
      const info: RuntimeTypeInfo = {
        name: declaration.name,
        candidType: candidTypeTextId(
          this.#graph,
          this.#semantics,
          declaration.type,
          new Set([declarationId])
        ),
      }
      if (declaration.metadata?.docs?.length) {
        info.docs = declaration.metadata.docs
      }
      if (declaration.metadata?.rawDocs?.length) {
        info.rawDocs = declaration.metadata.rawDocs
      }
      if (declaration.metadata?.docTags?.length) {
        info.docTags = declaration.metadata.docTags
      }
      return info
    })
  }

  listMethods(): RuntimeMethodInfo[] {
    return this.#graph.actorMethodIds().map((methodId) => {
      const method = this.#graph.method(methodId)
      const info: RuntimeMethodInfo = {
        id: methodId,
        name: method.name,
        mode: method.mode,
        args: method.args.map((arg, index) => this.argInfo(arg, `arg${index}`)),
        returns: method.returns.map((arg, index) =>
          this.argInfo(arg, `return${index}`)
        ),
      }
      if (method.metadata?.docs?.length) {
        info.docs = method.metadata.docs
      }
      if (method.metadata?.rawDocs?.length) {
        info.rawDocs = method.metadata.rawDocs
      }
      if (method.metadata?.docTags?.length) {
        info.docTags = method.metadata.docTags
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
    if (!this.ir.actor) {
      throw new Error("Candid program has no service actor")
    }
    const method = this.#methods.get(name)
    if (!method) {
      throw new Error(`method ${JSON.stringify(name)} not found`)
    }
    return method
  }

  createActor(options: RuntimeActorOptions): DynamicActor {
    if (!this.ir.actor) {
      throw new Error("Candid program has no service actor")
    }
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

  private argInfo(arg: ProgramArgIR, fallbackName: string): RuntimeArgInfo {
    const info: RuntimeArgInfo = {
      name: arg.name ?? fallbackName,
      candidType: candidTypeTextRef(this.#graph, this.#semantics, arg.type),
    }
    if (arg.metadata?.docs?.length) {
      info.docs = arg.metadata.docs
    }
    if (arg.metadata?.rawDocs?.length) {
      info.rawDocs = arg.metadata.rawDocs
    }
    if (arg.metadata?.docTags?.length) {
      info.docTags = arg.metadata.docTags
    }
    return info
  }
}
