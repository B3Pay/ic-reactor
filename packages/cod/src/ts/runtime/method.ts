import {
  CandidProgram,
  type AgentLike,
  type AgentQueryRequest,
  type AgentUpdateRequest,
} from "../index.js"
import type { AnyMethodSchema, AnySchema } from "../schema.js"
import { FormContext, methodToFormSchema } from "./form.js"
import { validateMethodArgs, validateMethodReturn } from "./validation.js"
import { methodToWorkflowNode } from "./workflow.js"
import type {
  CandidMethodIR,
  DocTag,
  FormSchemaOptions,
  MethodFormSchema,
  ProgramIR,
  RuntimeArgInfo,
  RuntimeMethod,
  RuntimeMethodCallOptions,
  WorkflowMethodNode,
} from "./types.js"

export class RuntimeMethodImpl implements RuntimeMethod {
  readonly name: string
  readonly mode: RuntimeMethod["mode"]
  readonly args: RuntimeArgInfo[]
  readonly returns: RuntimeArgInfo[]
  readonly docs?: readonly string[]
  readonly rawDocs?: readonly string[]
  readonly docTags?: readonly DocTag[]

  readonly #program: CandidProgram
  readonly #ir: ProgramIR
  readonly #methodIr: CandidMethodIR
  readonly #schema: AnyMethodSchema
  readonly #formOptions: FormSchemaOptions
  #replyProgram?: CandidProgram

  constructor(options: {
    program: CandidProgram
    ir: ProgramIR
    methodIr: CandidMethodIR
    schema: AnyMethodSchema
    formOptions?: FormSchemaOptions
    args: RuntimeArgInfo[]
    returns: RuntimeArgInfo[]
  }) {
    this.#program = options.program
    this.#ir = options.ir
    this.#methodIr = options.methodIr
    this.#schema = options.schema
    this.#formOptions = options.formOptions ?? {}
    this.name = options.methodIr.name
    this.mode = options.methodIr.mode
    this.args = options.args
    this.returns = options.returns
    if (options.methodIr.docs?.length) {
      this.docs = options.methodIr.docs
    }
    if (options.methodIr.rawDocs?.length) {
      this.rawDocs = options.methodIr.rawDocs
    }
    if (options.methodIr.docTags?.length) {
      this.docTags = options.methodIr.docTags
    }
  }

  argsSchema(): readonly AnySchema[] {
    return this.#schema.args
  }

  returnsSchema(): readonly AnySchema[] {
    return this.#schema.returns
  }

  encodeArgs(args: readonly unknown[]): Uint8Array {
    validateMethodArgs(this.#methodIr, args, this)
    return this.#program.encodeMethodArgs(
      this.name,
      this.#schema.argsToCandid(args as any)
    )
  }

  decodeArgs(bytes: Uint8Array): readonly unknown[] {
    const text = this.#program.decodeMethodArgs(this.name, bytes)
    return this.#schema.decodeArgsText(text)
  }

  encodeReply(value: unknown): Uint8Array {
    return this.replyProgram().encodeMethodArgs(
      "__reply",
      this.#schema.replyToCandid(value as any)
    )
  }

  decodeReply(bytes: Uint8Array): unknown {
    const text = this.#program.decodeMethodReply(this.name, bytes)
    const value = this.#schema.decodeReplyText(text)
    validateMethodReturn(this.#methodIr, value, this)
    return value
  }

  toFormSchema(): MethodFormSchema {
    return methodToFormSchema(
      this.#methodIr,
      new FormContext(this.#ir, this.#formOptions)
    )
  }

  toWorkflowNode(): WorkflowMethodNode {
    return methodToWorkflowNode(
      this.#methodIr,
      new FormContext(this.#ir, this.#formOptions)
    )
  }

  async call(options: RuntimeMethodCallOptions): Promise<unknown> {
    if (this.mode === "oneway") {
      throw new Error(
        `oneway method ${JSON.stringify(this.name)} cannot be called by the dynamic runtime yet`
      )
    }

    const arg = this.encodeArgs(options.args)
    const response =
      this.mode === "query" || this.mode === "composite_query"
        ? await callQuery(
            options.agent,
            queryRequest(
              options.canisterId,
              this.name,
              arg,
              options.effectiveCanisterId
            )
          )
        : await callUpdate(
            options.agent,
            updateRequest(options, this.name, arg)
          )
    return this.decodeReply(extractReplyBytes(response))
  }

  typeByName(name: string) {
    return this.#ir.types.find((type) => type.name === name)?.type
  }

  private replyProgram(): CandidProgram {
    this.#replyProgram ??= new CandidProgram(
      `service : {\n  __reply : (${this.#schema.returnsDid()}) -> ();\n}`
    )
    return this.#replyProgram
  }
}

function queryRequest(
  canisterId: unknown,
  methodName: string,
  arg: Uint8Array,
  effectiveCanisterId: unknown
): AgentQueryRequest & { canisterId: unknown } {
  const request: AgentQueryRequest & { canisterId: unknown } = {
    canisterId,
    methodName,
    arg,
  }
  if (effectiveCanisterId !== undefined) {
    request.effectiveCanisterId = effectiveCanisterId
  }
  return request
}

function updateRequest(
  options: RuntimeMethodCallOptions,
  methodName: string,
  arg: Uint8Array
): AgentUpdateRequest & { canisterId: unknown; pollingOptions?: unknown } {
  const request: AgentUpdateRequest & {
    canisterId: unknown
    pollingOptions?: unknown
  } = {
    canisterId: options.canisterId,
    methodName,
    arg,
  }
  if (options.effectiveCanisterId !== undefined) {
    request.effectiveCanisterId = options.effectiveCanisterId
  }
  if (options.pollingOptions !== undefined) {
    request.pollingOptions = options.pollingOptions
  }
  if (options.nonce !== undefined) {
    request.nonce = options.nonce
  }
  if (options.callSync !== undefined) {
    request.callSync = options.callSync
  }
  return request
}

async function callQuery(
  agent: AgentLike,
  request: AgentQueryRequest & { canisterId: unknown }
): Promise<unknown> {
  if (!agent.query) {
    throw new Error(
      `agent does not support query calls for ${request.methodName}`
    )
  }
  return agent.query(request.canisterId, agentQueryRequest(request))
}

async function callUpdate(
  agent: AgentLike,
  request: AgentUpdateRequest & {
    canisterId: unknown
    pollingOptions?: unknown
  }
): Promise<unknown> {
  const updateRequest = agentUpdateRequest(request)
  if (agent.update) {
    return agent.update(
      request.canisterId,
      updateRequest,
      request.pollingOptions
    )
  }

  if (!agent.call) {
    throw new Error(
      `agent does not support update calls for ${request.methodName}`
    )
  }

  const response = await agent.call(request.canisterId, updateRequest)
  if (!hasReplyBytes(response) && hasRequestId(response)) {
    throw new Error(
      `agent.call for ${request.methodName} returned a request id but no reply bytes; use an agent with update() polling support`
    )
  }
  return response
}

function agentQueryRequest(request: AgentQueryRequest): AgentQueryRequest {
  const out: AgentQueryRequest = {
    methodName: request.methodName,
    arg: request.arg,
  }
  if (request.effectiveCanisterId !== undefined) {
    out.effectiveCanisterId = request.effectiveCanisterId
  }
  return out
}

function agentUpdateRequest(
  request: AgentUpdateRequest & { canisterId: unknown }
): AgentUpdateRequest {
  const out: AgentUpdateRequest = {
    methodName: request.methodName,
    arg: request.arg,
    effectiveCanisterId: request.effectiveCanisterId ?? request.canisterId,
  }
  if (request.nonce !== undefined) {
    out.nonce = request.nonce
  }
  if (request.callSync !== undefined) {
    out.callSync = request.callSync
  }
  return out
}

function extractReplyBytes(response: unknown): Uint8Array {
  if (isBytes(response)) {
    return response
  }

  if (!response || typeof response !== "object") {
    throw new Error("agent response did not contain reply bytes")
  }

  const object = response as Record<string, unknown>
  if (object.status && object.status !== "replied") {
    throw new Error(
      String(
        object.reject_message ?? object.error ?? `agent call ${object.status}`
      )
    )
  }

  const candidates = [object.reply, object.response, object.arg, object.bytes]

  for (const candidate of candidates) {
    const bytes = findReplyBytes(candidate)
    if (bytes) {
      return bytes
    }
  }

  throw new Error("agent response did not contain reply bytes")
}

function hasReplyBytes(response: unknown): boolean {
  try {
    extractReplyBytes(response)
    return true
  } catch {
    return false
  }
}

function hasRequestId(response: unknown): boolean {
  return !!response && typeof response === "object" && "requestId" in response
}

function findReplyBytes(value: unknown): Uint8Array | undefined {
  if (isBytes(value)) {
    return value
  }
  if (!value || typeof value !== "object") {
    return undefined
  }
  const object = value as Record<string, unknown>
  return (
    findReplyBytes(object.arg) ??
    findReplyBytes(object.reply) ??
    findReplyBytes(object.replied) ??
    findReplyBytes(object.response)
  )
}

function isBytes(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array
}
