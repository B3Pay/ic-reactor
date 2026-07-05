import initWasm, {
  decodeDynamicArgs,
  encodeDynamicArgs,
  generateTypescriptForCanister,
  generateTypescript as generateTypescriptWasm,
  WasmCandidProgram,
  type InitInput,
  type InitOutput,
} from "../../pkg/cod_core.js"
import {
  actor as schemaActor,
  blob,
  bool,
  float32,
  float64,
  int,
  int8,
  int16,
  int32,
  int64,
  lazy,
  method,
  nat,
  nat8,
  nat16,
  nat32,
  nat64,
  null_,
  opt,
  principal,
  query,
  record,
  service,
  text,
  tuple,
  unsupported,
  update,
  variant,
  vec,
} from "./schema.js"
import { compileDid } from "./runtime/compile-did.js"
import {
  addArrayItem,
  createFormState,
  createInitialState,
  fieldStateToValue,
  formStateToArgs,
  removeArrayItem,
  safeJsonDisplay,
  selectVariantCase,
  toggleOption,
  updateFieldValue,
  validateFormState,
} from "./runtime/form-state.js"
import type { ActorFor, ServiceSchema } from "./schema.js"
import type { MethodMap } from "./schema/methods.js"
import type {
  CompileDidOptions,
  DynamicActor,
  ProgramIR,
  RuntimeActorOptions,
} from "./runtime/types.js"
export * from "./schema.js"
export { compileDid } from "./runtime/compile-did.js"
export * from "./runtime/form-state.js"
export { CandidValidationError } from "./runtime/validation.js"
export * from "./runtime/types.js"

/**
 * Binary Candid payload bytes.
 */
export type CandidBytes = Uint8Array

/**
 * Parenthesized Candid text argument tuple.
 */
export type CandidTextArgs = string

/**
 * Principal input accepted by the TypeScript runtime.
 */
export type PrincipalLike = string | { toText(): string }

/**
 * Candid function reference represented as `[principal, methodName]`.
 */
export type CandidFuncReference = [PrincipalLike, string]

/**
 * Options for generated TypeScript output.
 */
export interface GenerateTypescriptOptions {
  /**
   * Canister name used for the generated service export.
   */
  canisterName?: string
}

/**
 * Async actor method signature.
 *
 * @typeParam Args - App-level argument tuple.
 * @typeParam Ret - App-level return value.
 */
export type CandidActorMethod<
  Args extends readonly unknown[] = readonly unknown[],
  Ret = unknown,
> = (...args: Args) => Promise<Ret>

/**
 * Summary of a parsed Candid program.
 */
export interface ProgramSummary {
  /** Canonical service DID text. */
  service: string

  /** Candid init argument type list. */
  init_args: string[]

  /** Parsed service methods. */
  methods: MethodSummary[]
}

/**
 * Summary of a parsed Candid service method.
 */
export interface MethodSummary {
  /** Method name. */
  name: string

  /** Method modes such as `query`. */
  modes: string[]

  /** Candid argument type list. */
  args: string[]

  /** Candid return type list. */
  returns: string[]
}

/**
 * Encoded request shape suitable for an agent call.
 */
export interface AgentCallRequest {
  /** Target canister identifier. */
  canisterId: unknown

  /** Candid method name. */
  methodName: string

  /** Encoded Candid method argument bytes. */
  arg: Uint8Array

  /** Optional effective canister identifier used by some transports. */
  effectiveCanisterId?: unknown
}

/**
 * Encoded query request passed to an agent-like transport.
 */
export interface AgentQueryRequest {
  /** Candid method name. */
  methodName: string

  /** Encoded Candid method argument bytes. */
  arg: Uint8Array

  /** Optional effective canister identifier used by some transports. */
  effectiveCanisterId?: unknown
}

/**
 * Encoded update request passed to an agent-like transport.
 */
export interface AgentUpdateRequest extends AgentQueryRequest {
  /** Optional nonce used by agents to prevent replay. */
  nonce?: Uint8Array

  /** Optional synchronous-call hint used by modern ICP agents. */
  callSync?: boolean
}

/**
 * Minimal agent-like transport interface used by actor wrappers.
 */
export interface AgentLike {
  /**
   * Performs an update call.
   *
   * @param canisterId - Target canister identifier.
   * @param options - Encoded method call details.
   * @returns Raw transport response.
   */
  call?(canisterId: unknown, options: AgentUpdateRequest): Promise<unknown>

  /**
   * Performs an update call and waits for the certified reply when supported.
   *
   * Modern `@icp-sdk/core` agents expose this higher-level method; `cod`
   * prefers it over raw `call` because it includes polling.
   *
   * @param canisterId - Target canister identifier.
   * @param options - Encoded method call details.
   * @param pollingOptions - Optional agent-specific polling options.
   * @returns Raw transport response containing reply bytes.
   */
  update?(
    canisterId: unknown,
    options: AgentUpdateRequest,
    pollingOptions?: unknown
  ): Promise<unknown>

  /**
   * Performs a query call.
   *
   * @param canisterId - Target canister identifier.
   * @param options - Encoded method call details.
   * @returns Raw transport response.
   */
  query?(canisterId: unknown, options: AgentQueryRequest): Promise<unknown>
}

/**
 * Options for building an actor from Candid DID text at runtime.
 */
export type DynamicActorFactoryOptions = RuntimeActorOptions & {
  /** Candid DID source to compile into a runtime actor. */
  candidSource: string

  /** Optional compile settings. */
  compile?: CompileDidOptions
}

/**
 * Options for building an actor from a statically declared service schema.
 */
export type StaticActorFactoryOptions<Methods extends MethodMap> = {
  service: ServiceSchema<Methods>
  agent: AgentLike
  canisterId: unknown
}

let wasmReady: Promise<InitOutput> | undefined

/**
 * Initializes the WASM Candid runtime once.
 *
 * @param input - Optional WASM init input or promise.
 * @returns Promise for the initialized WASM module.
 */
export function initCod(
  input?: InitInput | Promise<InitInput>
): Promise<InitOutput> {
  wasmReady ??=
    input === undefined ? initWasm() : initWasm({ module_or_path: input })
  return wasmReady
}

/**
 * Creates an actor either from a static service schema or runtime DID source.
 *
 * @param options - Static schema actor options or DID-backed actor options.
 * @returns Static actor immediately, or a promise for a DID-backed dynamic actor.
 */
export function createActor<const Methods extends MethodMap>(
  options: StaticActorFactoryOptions<Methods>
): ActorFor<Methods>
export function createActor(
  options: DynamicActorFactoryOptions
): Promise<DynamicActor>
export function createActor(
  options: StaticActorFactoryOptions<MethodMap> | DynamicActorFactoryOptions
): ActorFor<MethodMap> | Promise<DynamicActor> {
  if ("candidSource" in options) {
    return compileDid(options.candidSource, options.compile).then((program) =>
      program.createActor(options)
    )
  }
  return schemaActor(options)
}

/**
 * Generates cod TypeScript schemas and inferred types from Candid DID source.
 *
 * @param source - Candid DID source text.
 * @param options - Optional generator settings.
 * @returns Generated TypeScript source.
 */
export function generateTypescript(
  source: string,
  options: GenerateTypescriptOptions = {}
): string {
  return options.canisterName
    ? generateTypescriptForCanister(source, options.canisterName)
    : generateTypescriptWasm(source)
}

/**
 * WASM-backed Candid program compiled from DID source.
 */
export class CandidProgram {
  readonly #inner: WasmCandidProgram

  /**
   * Compiles Candid DID source.
   *
   * @param source - Candid DID source text.
   */
  constructor(source: string) {
    this.#inner = new WasmCandidProgram(source)
  }

  /**
   * Returns a parsed summary of the Candid program.
   *
   * @returns Program summary.
   */
  summary(): ProgramSummary {
    return JSON.parse(this.#inner.summaryJson()) as ProgramSummary
  }

  /**
   * Returns the normalized runtime IR for the Candid program.
   *
   * @returns Normalized Candid program IR.
   */
  ir(): ProgramIR {
    return JSON.parse(
      (this.#inner as unknown as { irJson(): string }).irJson()
    ) as ProgramIR
  }

  /**
   * Returns the canonical service DID for the program.
   *
   * @returns Candid service DID text.
   */
  serviceDid(): string {
    return this.#inner.serviceDid()
  }

  /**
   * Encodes method arguments from Candid text to Candid bytes.
   *
   * @param method - Method name.
   * @param args - Parenthesized Candid argument tuple text.
   * @returns Encoded Candid bytes.
   */
  encodeMethodArgs(method: string, args: CandidTextArgs): CandidBytes {
    return this.#inner.encodeMethodArgs(method, args)
  }

  /**
   * Decodes method argument bytes to Candid text.
   *
   * @param method - Method name.
   * @param bytes - Encoded Candid argument bytes.
   * @returns Parenthesized Candid argument tuple text.
   */
  decodeMethodArgs(method: string, bytes: CandidBytes): CandidTextArgs {
    return this.#inner.decodeMethodArgs(method, bytes)
  }

  /**
   * Decodes method reply bytes to Candid text.
   *
   * @param method - Method name.
   * @param bytes - Encoded Candid reply bytes.
   * @returns Parenthesized Candid reply tuple text.
   */
  decodeMethodReply(method: string, bytes: CandidBytes): CandidTextArgs {
    return this.#inner.decodeMethodReply(method, bytes)
  }

  /**
   * Encodes service constructor init arguments from Candid text to bytes.
   *
   * @param args - Parenthesized Candid init argument tuple text.
   * @returns Encoded Candid bytes.
   */
  encodeInitArgs(args: CandidTextArgs): CandidBytes {
    return this.#inner.encodeInitArgs(args)
  }

  /**
   * Decodes service constructor init argument bytes to Candid text.
   *
   * @param bytes - Encoded Candid init argument bytes.
   * @returns Parenthesized Candid init argument tuple text.
   */
  decodeInitArgs(bytes: CandidBytes): CandidTextArgs {
    return this.#inner.decodeInitArgs(bytes)
  }

  /**
   * Encodes method arguments for direct use as an agent request `arg`.
   *
   * @param method - Method name.
   * @param args - Parenthesized Candid argument tuple text.
   * @returns Encoded Candid argument bytes.
   */
  methodArg(method: string, args: CandidTextArgs): AgentCallRequest["arg"] {
    return this.encodeMethodArgs(method, args)
  }

  /**
   * Releases the underlying WASM program.
   */
  dispose(): void {
    this.#inner.free()
  }
}

/**
 * Main public Candid namespace containing WASM helpers and schema constructors.
 */
export const c = {
  /** Initializes the WASM Candid runtime. */
  init: initCod,

  /**
   * Compiles Candid DID source into a runtime program.
   *
   * @param source - Candid DID source text.
   * @param options - Optional compile settings.
   * @returns Runtime program with live schemas, metadata, forms, workflows, and dynamic calls.
   */
  compileDid,

  /**
   * Compiles Candid DID source into a program.
   *
   * @param source - Candid DID source text.
   * @returns Compiled Candid program.
   */
  program(source: string): CandidProgram {
    return new CandidProgram(source)
  },

  /** Generates cod TypeScript schemas and inferred types from Candid DID source. */
  generateTypescript,

  /**
   * Dynamically encodes Candid text arguments without a service DID.
   *
   * @param args - Parenthesized Candid argument tuple text.
   * @returns Encoded Candid bytes.
   */
  encodeArgs(args: CandidTextArgs): CandidBytes {
    return encodeDynamicArgs(args)
  },

  /**
   * Dynamically decodes Candid bytes without a service DID.
   *
   * @param bytes - Encoded Candid bytes.
   * @returns Parenthesized Candid argument tuple text.
   */
  decodeArgs(bytes: CandidBytes): CandidTextArgs {
    return decodeDynamicArgs(bytes)
  },

  /** Creates a Candid `null` schema. */
  null: null_,

  /** Creates a Candid `bool` schema. */
  bool,

  /** Creates a Candid `float32` schema. */
  float32,

  /** Creates a Candid `float64` schema. */
  float64,

  /** Creates a Candid `text` schema. */
  text,

  /** Creates a Candid `principal` schema. */
  principal,

  /** Creates a Candid `blob` schema. */
  blob,

  /** Creates a Candid `nat` schema. */
  nat,

  /** Creates a Candid `int` schema. */
  int,

  /** Creates a Candid `nat8` schema. */
  nat8,

  /** Creates a Candid `nat16` schema. */
  nat16,

  /** Creates a Candid `nat32` schema. */
  nat32,

  /** Creates a Candid `nat64` schema. */
  nat64,

  /** Creates a Candid `int8` schema. */
  int8,

  /** Creates a Candid `int16` schema. */
  int16,

  /** Creates a Candid `int32` schema. */
  int32,

  /** Creates a Candid `int64` schema. */
  int64,

  /** Creates a Candid `opt` schema. */
  opt,

  /** Creates a Candid `vec` schema. */
  vec,

  /** Creates a lazy schema for recursive Candid types. */
  lazy,

  /** Creates an explicit placeholder for unsupported Candid value schemas. */
  unsupported,

  /** Creates a tuple schema encoded as a positional Candid record. */
  tuple,

  /** Creates a Candid record schema. */
  record,

  /** Creates a Candid variant schema. */
  variant,

  /** Creates an update method schema. */
  method,

  /** Creates a query method schema. */
  query,

  /** Creates an update method schema. */
  update,

  /** Creates a Candid service schema. */
  service,

  /** Creates an actor wrapper from a service schema or Candid DID source. */
  actor: createActor,

  /** Creates editable state for a generated method form. */
  createFormState,

  /** Backward-compatible alias for createFormState. */
  createInitialState,

  /** Converts generated form state into method argument values. */
  formStateToArgs,

  /** Converts one generated field state into an app-level value. */
  fieldStateToValue,

  /** Validates generated form state conversion. */
  validateFormState,

  /** Updates one generated form field value. */
  updateFieldValue,

  /** Toggles a generated optional field. */
  toggleOption,

  /** Selects a generated variant case. */
  selectVariantCase,

  /** Adds one item to a generated array field. */
  addArrayItem,

  /** Removes one item from a generated array field. */
  removeArrayItem,

  /** Displays form values containing bigint and Uint8Array safely. */
  safeJsonDisplay,
}

/**
 * Type namespace attached to {@link c}.
 */
export namespace c {
  /** Candid program type. */
  export type Program = CandidProgram

  /** Dynamic runtime program type. */
  export type RuntimeProgram = import("./runtime/types.js").RuntimeProgram

  /** Dynamic runtime method type. */
  export type RuntimeMethod = import("./runtime/types.js").RuntimeMethod

  /** Dynamic actor type. */
  export type DynamicActor = import("./runtime/types.js").DynamicActor

  /** Options for a DID-backed dynamic actor. */
  export type DynamicActorFactoryOptions =
    import("./index.js").DynamicActorFactoryOptions

  /** Options shared by runtime actor calls. */
  export type RuntimeActorOptions =
    import("./runtime/types.js").RuntimeActorOptions

  /** Runtime Candid validation error. */
  export type CandidValidationError =
    import("./runtime/validation.js").CandidValidationError

  /** compileDid options. */
  export type CompileDidOptions = import("./runtime/types.js").CompileDidOptions

  /** Runtime form schema options. */
  export type FormSchemaOptions = import("./runtime/types.js").FormSchemaOptions

  /** Custom JSDoc format validator config. */
  export type CustomJSDocFormatTypes =
    import("./runtime/types.js").CustomJSDocFormatTypes

  /** Structured Candid doc-comment tag. */
  export type DocTag = import("./runtime/types.js").DocTag

  /** Normalized generated form validation rule. */
  export type FormValidationRule =
    import("./runtime/types.js").FormValidationRule

  /** Normalized Candid program IR. */
  export type ProgramIR = import("./runtime/types.js").ProgramIR

  /** Runtime method metadata. */
  export type RuntimeMethodInfo = import("./runtime/types.js").RuntimeMethodInfo

  /** Runtime type metadata. */
  export type RuntimeTypeInfo = import("./runtime/types.js").RuntimeTypeInfo

  /** Neutral program form schema. */
  export type ProgramFormSchema = import("./runtime/types.js").ProgramFormSchema

  /** Neutral method form schema. */
  export type MethodFormSchema = import("./runtime/types.js").MethodFormSchema

  /** Neutral workflow schema. */
  export type ProgramWorkflowSchema =
    import("./runtime/types.js").ProgramWorkflowSchema

  /** Runtime generated form state. */
  export type FormState = import("./runtime/form-state.js").FormState

  /** Runtime generated field state. */
  export type FieldState = import("./runtime/form-state.js").FieldState

  /** Primitive editable generated field value. */
  export type FieldValue = import("./runtime/form-state.js").FieldValue

  /** Generated form conversion issue. */
  export type FormStateIssue = import("./runtime/form-state.js").FormStateIssue

  /** Generated form conversion error. */
  export type FormStateError = import("./runtime/form-state.js").FormStateError

  /** Parsed Candid program summary. */
  export type Summary = ProgramSummary

  /** Parsed Candid method summary. */
  export type Method = MethodSummary

  /** Binary Candid payload bytes. */
  export type Bytes = CandidBytes

  /** Parenthesized Candid text argument tuple. */
  export type TextArgs = CandidTextArgs

  /** Principal input accepted by the runtime. */
  export type PrincipalLike = import("./index.js").PrincipalLike

  /** Candid function reference represented as `[principal, methodName]`. */
  export type CandidFuncReference = import("./index.js").CandidFuncReference

  /**
   * Async actor method signature.
   *
   * @typeParam Args - App-level argument tuple.
   * @typeParam Ret - App-level return value.
   */
  export type CandidActorMethod<
    Args extends readonly unknown[] = readonly unknown[],
    Ret = unknown,
  > = import("./index.js").CandidActorMethod<Args, Ret>

  /**
   * Runtime schema type.
   *
   * @typeParam WireType - Wire-level Candid value type.
   * @typeParam AppType - App-facing value type.
   */
  export type Schema<
    WireType,
    AppType = WireType,
  > = import("./schema.js").Schema<WireType, AppType>

  /**
   * Extracts the app-facing value type from a schema.
   *
   * @typeParam T - Schema to inspect.
   */
  export type Infer<T extends import("./schema.js").AnySchema> =
    import("./schema.js").Infer<T>

  /**
   * Extracts the wire-level value type from a schema.
   *
   * @typeParam T - Schema to inspect.
   */
  export type InferWire<T extends import("./schema.js").AnySchema> =
    import("./schema.js").InferWire<T>

  /**
   * Nominal marker type used to distinguish otherwise identical values.
   *
   * @typeParam Base - Structural value type.
   * @typeParam Name - Brand name.
   */
  export type Brand<Base, Name extends string> = import("./schema.js").Brand<
    Base,
    Name
  >

  /**
   * Runtime schema for a Candid service method.
   *
   * @typeParam Args - Method argument schemas.
   * @typeParam Returns - Method return schemas.
   * @typeParam Mode - Method call mode.
   */
  export type MethodSchema<
    Args extends readonly import("./schema.js").AnySchema[],
    Returns extends readonly import("./schema.js").AnySchema[],
    Mode extends import("./schema.js").MethodMode,
  > = import("./schema.js").MethodSchema<Args, Returns, Mode>

  /**
   * Runtime schema for a Candid service.
   *
   * @typeParam Methods - Mapping of method names to method schemas.
   */
  export type ServiceSchema<
    Methods extends Record<string, import("./schema.js").AnyMethodSchema>,
  > = import("./schema.js").ServiceSchema<Methods>

  /**
   * App-facing actor type inferred from a service schema method map.
   *
   * @typeParam Methods - Mapping of method names to method schemas.
   */
  export type ActorFor<
    Methods extends Record<string, import("./schema.js").AnyMethodSchema>,
  > = import("./schema.js").ActorFor<Methods>
}
