import type {
  DeclId,
  DocTag,
  MethodId,
  ProgramActorIR,
  ProgramArgIR,
  ProgramFieldIR,
  ProgramFieldLabelIR,
  ProgramIR,
  ProgramMetadataIR,
  ProgramMethodIR,
  ProgramTypeDeclIR,
  ProgramTypeKindIR,
  ProgramTypeNodeIR,
  ProgramTypeRefIR,
  TypeId,
} from "./types.js"

export const PROGRAM_IR_VERSION = 1

const TYPE_KINDS_WITHOUT_PAYLOAD = new Set([
  "null",
  "bool",
  "text",
  "nat",
  "int",
  "nat8",
  "nat16",
  "nat32",
  "nat64",
  "int8",
  "int16",
  "int32",
  "int64",
  "float32",
  "float64",
  "principal",
  "reserved",
  "empty",
])

const METHOD_MODES = new Set(["query", "composite_query", "update", "oneway"])

const utf8Encoder = new TextEncoder()

export class UnsupportedProgramIRVersionError extends Error {
  constructor(
    readonly actual: number,
    readonly expected = PROGRAM_IR_VERSION
  ) {
    super(`Unsupported ProgramIR version ${actual}; expected ${expected}`)
    this.name = "UnsupportedProgramIRVersionError"
  }
}

export class InvalidProgramIRError extends Error {
  constructor(
    readonly path: string,
    message: string
  ) {
    super(`Invalid ProgramIR at ${path}: ${message}`)
    this.name = "InvalidProgramIRError"
  }
}

export function assertProgramIRVersion(ir: Pick<ProgramIR, "version">): void {
  if (ir.version !== PROGRAM_IR_VERSION) {
    throw new UnsupportedProgramIRVersionError(ir.version)
  }
}

export function parseProgramIR(value: unknown): ProgramIR {
  validateProgramIR(value)
  return value
}

export function validateProgramIR(value: unknown): asserts value is ProgramIR {
  validateProgramIRShape(value)
  new ProgramIrGraph(value)
}

export class ProgramIrGraph {
  readonly #declarationsByName = new Map<string, DeclId>()

  constructor(readonly ir: ProgramIR) {
    assertProgramIRVersion(ir)

    for (let index = 0; index < ir.declarations.length; index++) {
      const declaration = ir.declarations[index]!
      if (this.#declarationsByName.has(declaration.name)) {
        throw new Error(
          `duplicate ProgramIR declaration name ${JSON.stringify(declaration.name)}`
        )
      }
      this.#declarationsByName.set(declaration.name, index)
    }

    this.#validate()
  }

  typeNodes(): readonly ProgramTypeNodeIR[] {
    return this.ir.types
  }

  declarations(): readonly ProgramTypeDeclIR[] {
    return this.ir.declarations
  }

  methods(): readonly ProgramMethodIR[] {
    return this.ir.methods
  }

  actor(): ProgramActorIR | null {
    return this.ir.actor
  }

  typeNode(id: TypeId): ProgramTypeNodeIR {
    const node = this.ir.types[id]
    if (!node) {
      throw new Error(`missing ProgramIR type node ${id}`)
    }
    return node
  }

  typeKind(id: TypeId): ProgramTypeKindIR {
    return this.typeNode(id).kind
  }

  declaration(id: DeclId): ProgramTypeDeclIR {
    const declaration = this.ir.declarations[id]
    if (!declaration) {
      throw new Error(`missing ProgramIR declaration ${id}`)
    }
    return declaration
  }

  declarationIdByName(name: string): DeclId | undefined {
    return this.#declarationsByName.get(name)
  }

  declarationByName(name: string): ProgramTypeDeclIR | undefined {
    const id = this.declarationIdByName(name)
    return id === undefined ? undefined : this.declaration(id)
  }

  method(id: MethodId): ProgramMethodIR {
    const method = this.ir.methods[id]
    if (!method) {
      throw new Error(`missing ProgramIR method ${id}`)
    }
    return method
  }

  resolveRef(reference: ProgramTypeRefIR): TypeId {
    switch (reference.kind) {
      case "type":
        this.typeKind(reference.id)
        return reference.id
      case "decl":
        return this.declaration(reference.id).type
    }
  }

  serviceMethodIds(serviceId: TypeId): readonly MethodId[] {
    const service = this.typeKind(serviceId)
    if (service.kind !== "service") {
      throw new Error(
        `ProgramIR actor service points to non-service type ${serviceId}`
      )
    }
    return service.methods
  }

  serviceMethods(serviceId: TypeId): readonly ProgramMethodIR[] {
    return this.serviceMethodIds(serviceId).map((id) => this.method(id))
  }

  actorMethodIds(): readonly MethodId[] {
    const actor = this.actor()
    if (!actor) {
      return []
    }
    return this.serviceMethodIds(actor.service)
  }

  actorMethods(): readonly ProgramMethodIR[] {
    return this.actorMethodIds().map((id) => this.method(id))
  }

  #validate(): void {
    for (const declaration of this.ir.declarations) {
      this.typeNode(declaration.type)
    }

    for (let methodId = 0; methodId < this.ir.methods.length; methodId++) {
      this.#validateMethodSignature(methodId, this.ir.methods[methodId]!)
    }

    const referencedMethodIds = new Set<MethodId>()

    for (let typeId = 0; typeId < this.ir.types.length; typeId++) {
      const kind = this.ir.types[typeId]!.kind
      this.#validateTypeKind(typeId, kind, referencedMethodIds)
    }

    for (let methodId = 0; methodId < this.ir.methods.length; methodId++) {
      if (!referencedMethodIds.has(methodId)) {
        throw new Error(
          `ProgramIR method ${methodId} is not referenced by a service`
        )
      }
    }

    if (this.ir.actor) {
      this.#validateArgs(this.ir.actor.initArgs)
      const actorService = this.typeKind(this.ir.actor.service)
      if (actorService.kind !== "service") {
        throw new Error(
          `ProgramIR actor service points to non-service type ${this.ir.actor.service}`
        )
      }
    }

    this.#validateNoDirectTypeCycles()
  }

  #validateTypeKind(
    typeId: TypeId,
    kind: ProgramTypeKindIR,
    referencedMethodIds: Set<MethodId>
  ): void {
    switch (kind.kind) {
      case "opt":
      case "vec":
        this.#validateTypeRef(kind.inner)
        break
      case "record":
      case "variant":
        this.#validateFields(typeId, kind.fields)
        break
      case "func":
        this.#validateArgs(kind.args)
        this.#validateArgs(kind.returns)
        if (kind.mode === "oneway" && kind.returns.length > 0) {
          throw new Error(
            `ProgramIR oneway function type ${typeId} has ${kind.returns.length} return value(s)`
          )
        }
        break
      case "service":
        this.#validateServiceMethodIds(
          typeId,
          kind.methods,
          referencedMethodIds
        )
        break
      case "null":
      case "bool":
      case "text":
      case "nat":
      case "int":
      case "nat8":
      case "nat16":
      case "nat32":
      case "nat64":
      case "int8":
      case "int16":
      case "int32":
      case "int64":
      case "float32":
      case "float64":
      case "principal":
      case "reserved":
      case "empty":
        break
    }
  }

  #validateMethodSignature(id: MethodId, method: ProgramMethodIR): void {
    this.#validateArgs(method.args)
    this.#validateArgs(method.returns)
    if (method.mode === "oneway" && method.returns.length > 0) {
      throw new Error(
        `ProgramIR oneway method ${id} has ${method.returns.length} return value(s)`
      )
    }
  }

  #validateFields(typeId: TypeId, fields: readonly ProgramFieldIR[]): void {
    const fieldIds = new Set<number>()
    for (const field of fields) {
      const candidId = fieldCandidId(field)
      if (fieldIds.has(candidId)) {
        throw new Error(
          `duplicate ProgramIR field candid id ${candidId} in type ${typeId}`
        )
      }
      fieldIds.add(candidId)
      this.#validateTypeRef(field.type)
    }
  }

  #validateServiceMethodIds(
    serviceId: TypeId,
    methodIds: readonly MethodId[],
    referencedMethodIds: Set<MethodId>
  ): void {
    const methodNames = new Set<string>()
    for (const methodId of methodIds) {
      if (referencedMethodIds.has(methodId)) {
        throw new Error(`duplicate ProgramIR method reference ${methodId}`)
      }
      referencedMethodIds.add(methodId)

      const method = this.method(methodId)
      if (methodNames.has(method.name)) {
        throw new Error(
          `duplicate ProgramIR method name ${JSON.stringify(method.name)} in service ${serviceId}`
        )
      }
      methodNames.add(method.name)
    }
  }

  #validateArgs(args: readonly ProgramArgIR[]): void {
    for (const arg of args) {
      this.#validateTypeRef(arg.type)
    }
  }

  #validateTypeRef(reference: ProgramTypeRefIR): void {
    switch (reference.kind) {
      case "type":
        this.typeNode(reference.id)
        break
      case "decl":
        this.declaration(reference.id)
        break
    }
  }

  #validateNoDirectTypeCycles(): void {
    const states = new Array<TypeVisitState>(this.ir.types.length).fill(
      "unvisited"
    )
    for (let typeId = 0; typeId < this.ir.types.length; typeId++) {
      this.#visitDirectTypeEdges(typeId, states)
    }
  }

  #visitDirectTypeEdges(id: TypeId, states: TypeVisitState[]): void {
    const state = states[id]
    if (state === "visiting") {
      throw new Error(
        `ProgramIR direct structural type cycle reaches ${id}; recursion must pass through a declaration reference`
      )
    }
    if (state === "visited") {
      return
    }

    states[id] = "visiting"

    const kind = this.typeKind(id)
    switch (kind.kind) {
      case "opt":
      case "vec":
        this.#visitDirectTypeRef(kind.inner, states)
        break
      case "record":
      case "variant":
        for (const field of kind.fields) {
          this.#visitDirectTypeRef(field.type, states)
        }
        break
      case "func":
        this.#visitDirectArgs(kind.args, states)
        this.#visitDirectArgs(kind.returns, states)
        break
      case "service":
        for (const methodId of kind.methods) {
          const method = this.method(methodId)
          this.#visitDirectArgs(method.args, states)
          this.#visitDirectArgs(method.returns, states)
        }
        break
      case "null":
      case "bool":
      case "text":
      case "nat":
      case "int":
      case "nat8":
      case "nat16":
      case "nat32":
      case "nat64":
      case "int8":
      case "int16":
      case "int32":
      case "int64":
      case "float32":
      case "float64":
      case "principal":
      case "reserved":
      case "empty":
        break
    }

    states[id] = "visited"
  }

  #visitDirectArgs(
    args: readonly ProgramArgIR[],
    states: TypeVisitState[]
  ): void {
    for (const arg of args) {
      this.#visitDirectTypeRef(arg.type, states)
    }
  }

  #visitDirectTypeRef(
    reference: ProgramTypeRefIR,
    states: TypeVisitState[]
  ): void {
    if (reference.kind === "type") {
      this.#visitDirectTypeEdges(reference.id, states)
    }
  }
}

type TypeVisitState = "unvisited" | "visiting" | "visited"

export function fieldObjectKey(field: ProgramFieldIR): string {
  switch (field.label.kind) {
    case "named":
      return field.label.name
    case "id":
    case "unnamed":
      return `_${fieldCandidId(field)}_`
  }
}

export function fieldCandidId(field: ProgramFieldIR): number {
  return fieldLabelCandidId(field.label)
}

export function fieldLabelCandidId(label: ProgramFieldLabelIR): number {
  if (label.kind === "named") {
    return candidLabelId(label.name)
  }
  const candidId = label.candidId
  if (typeof candidId === "number") {
    return candidId
  }
  throw new Error(`ProgramIR field label ${label.kind} is missing candid id`)
}

export function candidLabelId(name: string): number {
  let hash = 0
  for (const byte of utf8Encoder.encode(name)) {
    hash = (Math.imul(hash, 223) + byte) >>> 0
  }
  return hash
}

function validateProgramIRShape(value: unknown): asserts value is ProgramIR {
  const program = expectObject(value, "ProgramIR")
  expectExactKeys(program, "ProgramIR", [
    "version",
    "types",
    "declarations",
    "methods",
    "actor",
  ])
  const version = expectNumber(program.version, "ProgramIR.version")
  assertProgramIRVersion({ version })
  validateArray(program.types, "ProgramIR.types", validateTypeNode)
  validateArray(
    program.declarations,
    "ProgramIR.declarations",
    validateTypeDeclaration
  )
  validateArray(program.methods, "ProgramIR.methods", validateMethod)
  validateActor(program.actor, "ProgramIR.actor")
}

function validateTypeNode(
  value: unknown,
  path: string
): asserts value is ProgramTypeNodeIR {
  const node = expectObject(value, path)
  expectExactKeys(node, path, ["kind"])
  validateTypeKind(node.kind, `${path}.kind`)
}

function validateTypeKind(
  value: unknown,
  path: string
): asserts value is ProgramTypeKindIR {
  const kind = expectObject(value, path)
  const kindName = expectString(kind.kind, `${path}.kind`)

  if (TYPE_KINDS_WITHOUT_PAYLOAD.has(kindName)) {
    expectExactKeys(kind, path, ["kind"])
    return
  }

  switch (kindName) {
    case "opt":
    case "vec":
      expectExactKeys(kind, path, ["kind", "inner"])
      validateTypeRef(kind.inner, `${path}.inner`)
      return
    case "record":
    case "variant":
      expectExactKeys(kind, path, ["kind", "fields"])
      validateArray(kind.fields, `${path}.fields`, validateField)
      return
    case "func":
      expectExactKeys(kind, path, ["kind", "args", "returns", "mode"])
      validateArray(kind.args, `${path}.args`, validateArg)
      validateArray(kind.returns, `${path}.returns`, validateArg)
      validateMethodMode(kind.mode, `${path}.mode`)
      return
    case "service":
      expectExactKeys(kind, path, ["kind", "methods"])
      validateArray(kind.methods, `${path}.methods`, validateU32)
      return
    default:
      throw invalid(path, `unsupported type kind ${JSON.stringify(kindName)}`)
  }
}

function validateTypeRef(
  value: unknown,
  path: string
): asserts value is ProgramTypeRefIR {
  const reference = expectObject(value, path)
  const kind = expectString(reference.kind, `${path}.kind`)
  switch (kind) {
    case "type":
    case "decl":
      expectExactKeys(reference, path, ["kind", "id"])
      validateU32(reference.id, `${path}.id`)
      return
    default:
      throw invalid(path, `unsupported type ref kind ${JSON.stringify(kind)}`)
  }
}

function validateTypeDeclaration(
  value: unknown,
  path: string
): asserts value is ProgramTypeDeclIR {
  const declaration = expectObject(value, path)
  expectExactKeys(declaration, path, ["name", "type"], ["metadata"])
  expectString(declaration.name, `${path}.name`)
  validateU32(declaration.type, `${path}.type`)
  validateOptionalMetadata(declaration, path)
}

function validateActor(
  value: unknown,
  path: string
): asserts value is ProgramActorIR | null {
  if (value === null) {
    return
  }
  const actor = expectObject(value, path)
  expectExactKeys(actor, path, ["initArgs", "service"])
  validateArray(actor.initArgs, `${path}.initArgs`, validateArg)
  validateU32(actor.service, `${path}.service`)
}

function validateMethod(
  value: unknown,
  path: string
): asserts value is ProgramMethodIR {
  const method = expectObject(value, path)
  expectExactKeys(
    method,
    path,
    ["name", "mode", "args", "returns"],
    ["metadata"]
  )
  expectString(method.name, `${path}.name`)
  validateMethodMode(method.mode, `${path}.mode`)
  validateArray(method.args, `${path}.args`, validateArg)
  validateArray(method.returns, `${path}.returns`, validateArg)
  validateOptionalMetadata(method, path)
}

function validateArg(
  value: unknown,
  path: string
): asserts value is ProgramArgIR {
  const arg = expectObject(value, path)
  expectExactKeys(arg, path, ["type"], ["name", "metadata"])
  if (Object.hasOwn(arg, "name")) {
    expectString(arg.name, `${path}.name`)
  }
  validateTypeRef(arg.type, `${path}.type`)
  validateOptionalMetadata(arg, path)
}

function validateField(
  value: unknown,
  path: string
): asserts value is ProgramFieldIR {
  const field = expectObject(value, path)
  expectExactKeys(field, path, ["label", "type"], ["metadata"])
  validateFieldLabel(field.label, `${path}.label`)
  validateTypeRef(field.type, `${path}.type`)
  validateOptionalMetadata(field, path)
}

function validateFieldLabel(
  value: unknown,
  path: string
): asserts value is ProgramFieldLabelIR {
  const label = expectObject(value, path)
  const kind = expectString(label.kind, `${path}.kind`)
  switch (kind) {
    case "named":
      expectExactKeys(label, path, ["kind", "name"])
      expectString(label.name, `${path}.name`)
      return
    case "id":
    case "unnamed":
      expectExactKeys(label, path, ["kind", "candidId"])
      validateU32(label.candidId, `${path}.candidId`)
      return
    default:
      throw invalid(
        path,
        `unsupported field label kind ${JSON.stringify(kind)}`
      )
  }
}

function validateOptionalMetadata(
  value: Record<string, unknown>,
  path: string
): void {
  if (Object.hasOwn(value, "metadata")) {
    validateMetadata(value.metadata, `${path}.metadata`)
  }
}

function validateMetadata(
  value: unknown,
  path: string
): asserts value is ProgramMetadataIR {
  const metadata = expectObject(value, path)
  expectExactKeys(metadata, path, [], ["docs", "rawDocs", "docTags"])

  let presentFields = 0
  if (Object.hasOwn(metadata, "docs")) {
    presentFields += 1
    validateNonEmptyArray(metadata.docs, `${path}.docs`, validateString)
  }
  if (Object.hasOwn(metadata, "rawDocs")) {
    presentFields += 1
    validateNonEmptyArray(metadata.rawDocs, `${path}.rawDocs`, validateString)
  }
  if (Object.hasOwn(metadata, "docTags")) {
    presentFields += 1
    validateNonEmptyArray(metadata.docTags, `${path}.docTags`, validateDocTag)
  }
  if (presentFields === 0) {
    throw invalid(path, "empty metadata must be omitted")
  }
}

function validateDocTag(value: unknown, path: string): asserts value is DocTag {
  const tag = expectObject(value, path)
  expectExactKeys(tag, path, ["name", "value"])
  expectString(tag.name, `${path}.name`)
  expectString(tag.value, `${path}.value`)
}

function validateMethodMode(value: unknown, path: string): void {
  const mode = expectString(value, path)
  if (!METHOD_MODES.has(mode)) {
    throw invalid(path, `unsupported method mode ${JSON.stringify(mode)}`)
  }
}

function validateArray<T>(
  value: unknown,
  path: string,
  validateItem: (item: unknown, itemPath: string) => asserts item is T
): asserts value is T[] {
  if (!Array.isArray(value)) {
    throw invalid(path, "expected array")
  }
  for (let index = 0; index < value.length; index++) {
    validateItem(value[index], `${path}[${index}]`)
  }
}

function validateNonEmptyArray<T>(
  value: unknown,
  path: string,
  validateItem: (item: unknown, itemPath: string) => asserts item is T
): asserts value is T[] {
  validateArray(value, path, validateItem)
  if (value.length === 0) {
    throw invalid(path, "empty arrays must be omitted")
  }
}

function validateString(value: unknown, path: string): asserts value is string {
  expectString(value, path)
}

function validateU32(value: unknown, path: string): asserts value is number {
  expectU32(value, path)
}

function expectObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalid(path, "expected object")
  }
  return value as Record<string, unknown>
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw invalid(path, "expected string")
  }
  return value
}

function expectNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw invalid(path, "expected finite number")
  }
  return value
}

function expectU32(value: unknown, path: string): number {
  const id = expectNumber(value, path)
  if (!Number.isInteger(id) || id < 0 || id > 0xffffffff) {
    throw invalid(path, "expected u32 integer")
  }
  return id
}

function expectExactKeys(
  value: Record<string, unknown>,
  path: string,
  required: readonly string[],
  optional: readonly string[] = []
): void {
  const allowed = new Set([...required, ...optional])
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw invalid(path, `unexpected field ${JSON.stringify(key)}`)
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      throw invalid(path, `missing field ${JSON.stringify(key)}`)
    }
  }
}

function invalid(path: string, message: string): InvalidProgramIRError {
  return new InvalidProgramIRError(path, message)
}
