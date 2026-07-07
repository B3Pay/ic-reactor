import type { AgentLike } from "../index.js"
import type { AnySchema, ServiceSchema } from "../schema.js"

export type CompileDidOptions = FormSchemaOptions & {
  parser?: "wasm"
  imports?: "reject"
}

export type FormSchemaOptions = {
  customJSDocFormatTypes?: CustomJSDocFormatTypes
  custom_js_doc_format_types?: CustomJSDocFormatTypes
}

export type CustomJSDocFormat =
  | string
  | {
      regex: string
      errorMessage?: string
    }

export type CustomJSDocFormatTypes = Record<string, CustomJSDocFormat>

export type DocTag = {
  name: string
  value: string
}

export type CandidMethodMode = "query" | "update" | "oneway" | "composite_query"

export type ProgramIR = {
  version: number
  types: ProgramTypeNodeIR[]
  declarations: ProgramTypeDeclIR[]
  methods: ProgramMethodIR[]
  actor: ProgramActorIR | null
}

// ProgramIR numeric IDs are local to one exact ProgramIR artifact. Do not
// persist raw IDs across independently compiled revisions without an external
// program identity.
export type TypeId = number
export type DeclId = number
export type MethodId = number

export type ProgramTypeRefIR =
  | { kind: "type"; id: TypeId }
  | { kind: "decl"; id: DeclId }

export type ProgramTypeNodeIR = {
  kind: ProgramTypeKindIR
}

export type ProgramTypeKindIR =
  | { kind: "null" }
  | { kind: "bool" }
  | { kind: "text" }
  | { kind: "nat" }
  | { kind: "int" }
  | { kind: "nat8" }
  | { kind: "nat16" }
  | { kind: "nat32" }
  | { kind: "nat64" }
  | { kind: "int8" }
  | { kind: "int16" }
  | { kind: "int32" }
  | { kind: "int64" }
  | { kind: "float32" }
  | { kind: "float64" }
  | { kind: "principal" }
  | { kind: "reserved" }
  | { kind: "empty" }
  | { kind: "opt"; inner: ProgramTypeRefIR }
  | { kind: "vec"; inner: ProgramTypeRefIR }
  | { kind: "record"; fields: ProgramFieldIR[] }
  | { kind: "variant"; fields: ProgramFieldIR[] }
  | {
      kind: "func"
      args: ProgramArgIR[]
      returns: ProgramArgIR[]
      mode: CandidMethodMode
    }
  | { kind: "service"; methods: MethodId[] }

export type ProgramMetadataIR = {
  docs?: string[]
  rawDocs?: string[]
  docTags?: DocTag[]
}

export type ProgramTypeDeclIR = {
  name: string
  type: TypeId
  metadata?: ProgramMetadataIR
}

export type ProgramActorIR = {
  initArgs: ProgramArgIR[]
  service: TypeId
}

export type ProgramMethodIR = {
  name: string
  mode: CandidMethodMode
  args: ProgramArgIR[]
  returns: ProgramArgIR[]
  metadata?: ProgramMetadataIR
}

export type ProgramArgIR = {
  name?: string
  type: ProgramTypeRefIR
  metadata?: ProgramMetadataIR
}

export type ProgramFieldIR = {
  label: ProgramFieldLabelIR
  type: ProgramTypeRefIR
  metadata?: ProgramMetadataIR
}

export type ProgramFieldLabelIR =
  | {
      kind: "named"
      name: string
    }
  | {
      kind: "id"
      candid_id?: number
      candidId?: number
    }
  | {
      kind: "unnamed"
      candid_id?: number
      candidId?: number
    }

export type RuntimeProgramIR = {
  version: number
  types: CandidTypeDeclIR[]
  actor: CandidActorIR | null
}

export type CandidActorIR = {
  initArgs: CandidArgIR[]
  service: CandidServiceIR
}

export type CandidTypeDeclIR = {
  name: string
  type: CandidTypeIR
  docs?: string[]
  rawDocs?: string[]
  docTags?: DocTag[]
}

export type CandidServiceIR = {
  methods: CandidMethodIR[]
}

export type CandidMethodIR = {
  id: MethodId
  name: string
  mode: CandidMethodMode
  args: CandidArgIR[]
  returns: CandidArgIR[]
  docs?: string[]
  rawDocs?: string[]
  docTags?: DocTag[]
}

export type CandidArgIR = {
  name?: string
  type: CandidTypeIR
  docs?: string[]
  rawDocs?: string[]
  docTags?: DocTag[]
}

export type CandidTypeIR =
  | { kind: "null" }
  | { kind: "bool" }
  | { kind: "text" }
  | { kind: "nat" }
  | { kind: "int" }
  | { kind: "nat8" }
  | { kind: "nat16" }
  | { kind: "nat32" }
  | { kind: "nat64" }
  | { kind: "int8" }
  | { kind: "int16" }
  | { kind: "int32" }
  | { kind: "int64" }
  | { kind: "float32" }
  | { kind: "float64" }
  | { kind: "principal" }
  | { kind: "blob" }
  | { kind: "reserved" }
  | { kind: "empty" }
  | { kind: "opt"; inner: CandidTypeIR }
  | { kind: "vec"; inner: CandidTypeIR }
  | { kind: "record"; fields: CandidFieldIR[] }
  | { kind: "variant"; fields: CandidFieldIR[] }
  | { kind: "ref"; name: string }
  | {
      kind: "func"
      args: CandidArgIR[]
      returns: CandidArgIR[]
      mode: CandidMethodMode
    }
  | { kind: "service"; methods: CandidMethodIR[] }

export type CandidFieldIR = {
  label: CandidFieldLabelIR
  candidId: number
  type: CandidTypeIR
  docs?: string[]
  rawDocs?: string[]
  docTags?: DocTag[]
}

export type CandidFieldLabelIR =
  | { kind: "named"; name: string }
  | { kind: "id"; id: number }
  | { kind: "unnamed"; id: number }

export type RuntimeTypeInfo = {
  name: string
  candidType: string
  docs?: string[]
  rawDocs?: string[]
  docTags?: DocTag[]
}

export type RuntimeArgInfo = {
  name: string
  candidType: string
  docs?: string[]
  rawDocs?: string[]
  docTags?: DocTag[]
}

export type RuntimeMethodInfo = {
  id: MethodId
  name: string
  mode: CandidMethodMode
  args: RuntimeArgInfo[]
  returns: RuntimeArgInfo[]
  docs?: string[]
  rawDocs?: string[]
  docTags?: DocTag[]
}

export type RuntimeProgram = {
  readonly source: string
  readonly ir: ProgramIR
  readonly service: ServiceSchema<any>

  listTypes(): RuntimeTypeInfo[]
  listMethods(): RuntimeMethodInfo[]

  type(name: string): AnySchema
  method(name: string): RuntimeMethod

  createActor(options: RuntimeActorOptions): DynamicActor

  toFormSchema(): ProgramFormSchema
  toWorkflowSchema(): ProgramWorkflowSchema
}

export type RuntimeMethod = {
  readonly id: MethodId
  readonly name: string
  readonly mode: CandidMethodMode
  readonly args: RuntimeArgInfo[]
  readonly returns: RuntimeArgInfo[]
  readonly docs?: readonly string[]
  readonly rawDocs?: readonly string[]
  readonly docTags?: readonly DocTag[]

  argsSchema(): readonly AnySchema[]
  returnsSchema(): readonly AnySchema[]

  encodeArgs(args: readonly unknown[]): Uint8Array
  decodeArgs(bytes: Uint8Array): readonly unknown[]

  encodeReply(value: unknown): Uint8Array
  decodeReply(bytes: Uint8Array): unknown

  toFormSchema(): MethodFormSchema
  toWorkflowNode(): WorkflowMethodNode

  call(options: RuntimeMethodCallOptions): Promise<unknown>
}

export type RuntimeActorOptions = {
  agent: AgentLike
  canisterId: unknown
  effectiveCanisterId?: unknown
  pollingOptions?: unknown
  nonce?: Uint8Array
  callSync?: boolean
}

export type DynamicActorCallOptions = Omit<
  RuntimeActorOptions,
  "agent" | "canisterId"
>

export type RuntimeMethodCallOptions = RuntimeActorOptions & {
  args: readonly unknown[]
}

export type DynamicActor = {
  call(
    methodName: string,
    args: readonly unknown[],
    options?: DynamicActorCallOptions
  ): Promise<unknown>
  query(
    methodName: string,
    args: readonly unknown[],
    options?: DynamicActorCallOptions
  ): Promise<unknown>
  update(
    methodName: string,
    args: readonly unknown[],
    options?: DynamicActorCallOptions
  ): Promise<unknown>
  method(name: string): RuntimeMethod
  listMethods(): RuntimeMethodInfo[]
}

export type ProgramFormSchema = {
  methods: MethodFormSchema[]
}

export type MethodFormSchema = {
  methodId: MethodId
  name: string
  mode: CandidMethodMode
  docs?: string[]
  rawDocs?: string[]
  docTags?: DocTag[]
  args: FormField[]
  returns: FormField[]
}

export type FormValidationRule =
  | {
      kind: "minimum" | "maximum"
      value: number
      rawValue: string
      message?: string
    }
  | {
      kind: "minLength" | "maxLength"
      value: number
      rawValue: string
      message?: string
    }
  | {
      kind: "format"
      value: string
      message?: string
      regex?: string
      errorMessage?: string
    }
  | {
      kind: "pattern"
      value: string
    }

export type FormField = {
  name: string
  label: string
  path: string
  candidType: string
  kind:
    | "null"
    | "boolean"
    | "text"
    | "number"
    | "bigint"
    | "principal"
    | "blob"
    | "option"
    | "array"
    | "record"
    | "variant"
    | "unsupported"
  required: boolean
  docs?: string[]
  rawDocs?: string[]
  docTags?: DocTag[]
  validation?: FormValidationRule[]
  children?: FormField[]
  options?: FormVariantOption[]
}

export type FormVariantOption = {
  name: string
  label: string
  docs?: string[]
  rawDocs?: string[]
  docTags?: DocTag[]
  field?: FormField
}

export type ProgramWorkflowSchema = {
  nodes: WorkflowMethodNode[]
}

export type WorkflowMethodNode = {
  id: string
  type: "canister_method"
  methodId: MethodId
  methodName: string
  mode: CandidMethodMode
  title: string
  description?: string
  inputs: FormField[]
  outputs: FormField[]
}
