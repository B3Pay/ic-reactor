import { CandidProgram } from "../index.js"
import type { AgentLike, CandidBytes } from "../index.js"
import type { MethodArgs, MethodMap, MethodResult } from "./methods.js"
import type { StringKeyOf } from "./types.js"

/**
 * App-facing actor type inferred from a service method map.
 *
 * @typeParam Methods - Mapping of method names to method schemas.
 */
export type ActorFor<Methods extends MethodMap> = {
  [Name in keyof Methods]: (
    ...args: MethodArgs<Methods[Name]>
  ) => Promise<MethodResult<Methods[Name]>>
}

/**
 * Runtime schema for a Candid service.
 *
 * @typeParam Methods - Mapping of method names to method schemas.
 */
export class ServiceSchema<Methods extends MethodMap> {
  /** Method schemas keyed by method name. */
  readonly methods: Methods

  #program?: CandidProgram
  #replyPrograms = new Map<string, CandidProgram>()

  /**
   * Creates a service schema.
   *
   * @param methods - Method schemas keyed by method name.
   */
  constructor(methods: Methods) {
    this.methods = methods
  }

  /**
   * Renders this service as Candid DID text.
   *
   * @returns Complete Candid service definition.
   */
  serviceDid(): string {
    const names = Object.keys(this.methods)
    const body = names
      .map((name) => `  ${this.methods[name]!.toDid(name)};`)
      .join("\n")
    return `service : {\n${body}\n}`
  }

  /**
   * Returns the cached WASM-backed Candid program for this service.
   *
   * @returns Candid program compiled from {@link serviceDid}.
   */
  program(): CandidProgram {
    this.#program ??= new CandidProgram(this.serviceDid())
    return this.#program
  }

  /**
   * Encodes app-level method arguments to Candid wire bytes.
   *
   * @typeParam Name - Method name.
   * @param method - Method name to encode arguments for.
   * @param args - App-level method arguments.
   * @returns Candid wire bytes for the method call.
   */
  encodeMethodArgs<Name extends StringKeyOf<Methods>>(
    method: Name,
    args: MethodArgs<Methods[Name]>
  ): CandidBytes {
    return this.program().encodeMethodArgs(
      method,
      this.method(method).argsToCandid(args)
    )
  }

  /**
   * Decodes Candid wire bytes into app-level method arguments.
   *
   * @typeParam Name - Method name.
   * @param method - Method name to decode arguments for.
   * @param bytes - Candid wire bytes for the method call.
   * @returns App-level method argument tuple.
   */
  decodeMethodArgs<Name extends StringKeyOf<Methods>>(
    method: Name,
    bytes: CandidBytes
  ): MethodArgs<Methods[Name]> {
    const text = this.program().decodeMethodArgs(method, bytes)
    return this.method(method).decodeArgsText(text) as MethodArgs<Methods[Name]>
  }

  /**
   * Encodes an app-level method reply to Candid wire bytes.
   *
   * @typeParam Name - Method name.
   * @param method - Method name to encode a reply for.
   * @param value - App-level method result.
   * @returns Candid wire bytes for the method reply.
   */
  encodeMethodReply<Name extends StringKeyOf<Methods>>(
    method: Name,
    value: MethodResult<Methods[Name]>
  ): CandidBytes {
    const methodSchema = this.method(method)
    const program = this.replyProgram(method, methodSchema)
    return program.encodeMethodArgs(
      "__reply",
      methodSchema.replyToCandid(value)
    )
  }

  /**
   * Decodes Candid reply wire bytes into an app-level method result.
   *
   * @typeParam Name - Method name.
   * @param method - Method name to decode a reply for.
   * @param bytes - Candid wire bytes for the method reply.
   * @returns App-level method result.
   */
  decodeMethodReply<Name extends StringKeyOf<Methods>>(
    method: Name,
    bytes: CandidBytes
  ): MethodResult<Methods[Name]> {
    const text = this.program().decodeMethodReply(method, bytes)
    return this.method(method).decodeReplyText(text) as MethodResult<
      Methods[Name]
    >
  }

  /**
   * Creates an app-facing actor wrapper backed by an agent-like transport.
   *
   * @param agent - Agent object with `query` and/or `call` methods.
   * @param canisterId - Target canister identifier passed through to the agent.
   * @returns Actor object with one async function per service method.
   */
  createActor(agent: AgentLike, canisterId: unknown): ActorFor<Methods> {
    const actor: Partial<ActorFor<Methods>> = {}
    for (const name of Object.keys(this.methods) as Array<
      StringKeyOf<Methods>
    >) {
      actor[name] = (async (...args: MethodArgs<Methods[typeof name]>) => {
        const method = this.method(name)
        const arg = this.encodeMethodArgs(name, args)
        const response =
          method.mode === "query" || method.mode === "composite_query"
            ? await callQuery(agent, canisterId, name, arg)
            : await callUpdate(agent, canisterId, name, arg)
        return this.decodeMethodReply(name, extractReplyBytes(response))
      }) as ActorFor<Methods>[typeof name]
    }
    return actor as ActorFor<Methods>
  }

  /**
   * Looks up a method schema by name.
   *
   * @typeParam Name - Method name.
   * @param name - Method name to look up.
   * @returns Method schema for `name`.
   * @throws If the method does not exist in this service schema.
   */
  private method<Name extends StringKeyOf<Methods>>(name: Name): Methods[Name] {
    const method = this.methods[name]
    if (!method) {
      throw new Error(
        `method ${JSON.stringify(name)} not found in service schema`
      )
    }
    return method
  }

  /**
   * Returns a cached helper program used to encode synthetic reply tuples.
   *
   * @typeParam Name - Method name.
   * @param name - Method name whose reply program is needed.
   * @param method - Method schema used to build the helper DID.
   * @returns Candid program for the synthetic `__reply` method.
   */
  private replyProgram<Name extends StringKeyOf<Methods>>(
    name: Name,
    method: Methods[Name]
  ): CandidProgram {
    let program = this.#replyPrograms.get(name)
    if (!program) {
      const did = `service : {\n  __reply : (${method.returnsDid()}) -> ();\n}`
      program = new CandidProgram(did)
      this.#replyPrograms.set(name, program)
    }
    return program
  }
}

/**
 * Creates a runtime schema for a Candid service.
 *
 * @typeParam Methods - Mapping of method names to method schemas.
 * @param methods - Method schemas keyed by method name.
 * @returns Service schema.
 */
export function service<const Methods extends MethodMap>(
  methods: Methods
): ServiceSchema<Methods> {
  return new ServiceSchema(methods)
}

/**
 * Creates an app-facing actor wrapper from a service schema and transport.
 *
 * @typeParam Methods - Mapping of method names to method schemas.
 * @param options - Actor construction options.
 * @param options.service - Service schema that handles encoding and decoding.
 * @param options.agent - Agent object with `query` and/or `call` methods.
 * @param options.canisterId - Target canister identifier passed through to the agent.
 * @returns Actor object with one async function per service method.
 */
export function actor<const Methods extends MethodMap>(options: {
  service: ServiceSchema<Methods>
  agent: AgentLike
  canisterId: unknown
}): ActorFor<Methods> {
  return options.service.createActor(options.agent, options.canisterId)
}

/**
 * Performs a query call through an agent-like transport.
 *
 * @param agent - Agent object expected to provide `query`.
 * @param canisterId - Target canister identifier.
 * @param methodName - Candid method name.
 * @param arg - Encoded Candid argument bytes.
 * @returns Raw agent response.
 * @throws If the agent does not support query calls.
 */
async function callQuery(
  agent: AgentLike,
  canisterId: unknown,
  methodName: string,
  arg: Uint8Array
): Promise<unknown> {
  if (!agent.query) {
    throw new Error(`agent does not support query calls for ${methodName}`)
  }
  return agent.query(canisterId, { methodName, arg })
}

/**
 * Performs an update call through an agent-like transport.
 *
 * @param agent - Agent object expected to provide `call`.
 * @param canisterId - Target canister identifier.
 * @param methodName - Candid method name.
 * @param arg - Encoded Candid argument bytes.
 * @returns Raw agent response.
 * @throws If the agent does not support update calls.
 */
async function callUpdate(
  agent: AgentLike,
  canisterId: unknown,
  methodName: string,
  arg: Uint8Array
): Promise<unknown> {
  if (!agent.call) {
    throw new Error(`agent does not support update calls for ${methodName}`)
  }
  return agent.call(canisterId, { methodName, arg })
}

/**
 * Extracts reply bytes from the response shapes commonly returned by agents.
 *
 * @param response - Raw response returned by an agent call.
 * @returns Reply bytes.
 * @throws If the response is rejected or does not contain reply bytes.
 */
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

/**
 * Recursively searches nested response objects for reply bytes.
 *
 * @param value - Candidate response field.
 * @returns Reply bytes when found.
 */
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

/**
 * Checks whether a value is a byte array.
 *
 * @param value - Value to inspect.
 * @returns `true` when the value is a `Uint8Array`.
 */
function isBytes(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array
}
