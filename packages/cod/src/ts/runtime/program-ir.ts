import type {
  CandidActorIR,
  CandidArgIR,
  CandidFieldIR,
  CandidFieldLabelIR,
  CandidMethodIR,
  CandidTypeDeclIR,
  CandidTypeIR,
  DeclId,
  DocTag,
  MethodId,
  ProgramArgIR,
  ProgramFieldIR,
  ProgramFieldLabelIR,
  ProgramIR,
  ProgramMetadataIR,
  ProgramMethodIR,
  ProgramTypeDeclIR,
  ProgramTypeKindIR,
  ProgramTypeRefIR,
  RuntimeProgramIR,
  TypeId,
} from "./types.js"

export const PROGRAM_IR_VERSION = 1

export class UnsupportedProgramIRVersionError extends Error {
  constructor(
    readonly actual: number,
    readonly expected = PROGRAM_IR_VERSION
  ) {
    super(`Unsupported ProgramIR version ${actual}; expected ${expected}`)
    this.name = "UnsupportedProgramIRVersionError"
  }
}

export function assertProgramIRVersion(ir: ProgramIR): void {
  if (ir.version !== PROGRAM_IR_VERSION) {
    throw new UnsupportedProgramIRVersionError(ir.version)
  }
}

export class ProgramIrGraph {
  readonly #declarationsByName = new Map<string, DeclId>()

  constructor(readonly ir: ProgramIR) {
    for (let index = 0; index < ir.declarations.length; index++) {
      const declaration = ir.declarations[index]!
      if (this.#declarationsByName.has(declaration.name)) {
        throw new Error(
          `duplicate ProgramIR declaration name ${JSON.stringify(declaration.name)}`
        )
      }
      this.#declarationsByName.set(declaration.name, index)
    }

    this.#validateMethodArena()
  }

  declarations(): readonly ProgramTypeDeclIR[] {
    return this.ir.declarations
  }

  methods(): readonly ProgramMethodIR[] {
    return this.ir.methods
  }

  typeKind(id: TypeId): ProgramTypeKindIR {
    const node = this.ir.types[id]
    if (!node) {
      throw new Error(`missing ProgramIR type node ${id}`)
    }
    return node.kind
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

  actorMethods(): readonly ProgramMethodIR[] {
    return this.actorMethodIds().map((id) => this.method(id))
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
    const actor = this.ir.actor
    if (!actor) {
      return []
    }
    return this.serviceMethodIds(actor.service)
  }

  runtimeProgram(): RuntimeProgramIR {
    const actor = this.ir.actor
    return {
      version: this.ir.version,
      types: this.ir.declarations.map((declaration) =>
        this.runtimeDeclaration(declaration)
      ),
      actor: actor
        ? {
            initArgs: actor.initArgs.map((arg) => this.runtimeArg(arg)),
            service: {
              methods: this.actorMethodIds().map((id) =>
                this.runtimeMethod(id, this.method(id))
              ),
            },
          }
        : null,
    }
  }

  runtimeTypeByName(name: string): CandidTypeIR | undefined {
    const declaration = this.declarationByName(name)
    return declaration ? this.runtimeTypeId(declaration.type) : undefined
  }

  runtimeTypeId(id: TypeId): CandidTypeIR {
    return this.runtimeTypeKind(this.typeKind(id))
  }

  runtimeTypeRef(reference: ProgramTypeRefIR): CandidTypeIR {
    switch (reference.kind) {
      case "decl":
        return { kind: "ref", name: this.declaration(reference.id).name }
      case "type":
        return this.runtimeTypeId(reference.id)
    }
  }

  private runtimeDeclaration(declaration: ProgramTypeDeclIR): CandidTypeDeclIR {
    return withMetadata(
      {
        name: declaration.name,
        type: this.runtimeTypeId(declaration.type),
      },
      declaration.metadata
    )
  }

  private runtimeMethod(id: MethodId, method: ProgramMethodIR): CandidMethodIR {
    return withMetadata(
      {
        id,
        name: method.name,
        mode: method.mode,
        args: method.args.map((arg) => this.runtimeArg(arg)),
        returns: method.returns.map((arg) => this.runtimeArg(arg)),
      },
      method.metadata
    )
  }

  private runtimeArg(arg: ProgramArgIR): CandidArgIR {
    const out: CandidArgIR = withMetadata(
      {
        type: this.runtimeTypeRef(arg.type),
      },
      arg.metadata
    )
    if (arg.name !== undefined) {
      out.name = arg.name
    }
    return out
  }

  private runtimeField(field: ProgramFieldIR): CandidFieldIR {
    const label = runtimeFieldLabel(field.label)
    return withMetadata(
      {
        label,
        candidId: fieldLabelCandidId(field.label),
        type: this.runtimeTypeRef(field.type),
      },
      field.metadata
    )
  }

  private runtimeTypeKind(kind: ProgramTypeKindIR): CandidTypeIR {
    switch (kind.kind) {
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
        return { kind: kind.kind }
      case "opt":
        return { kind: "opt", inner: this.runtimeTypeRef(kind.inner) }
      case "vec":
        return this.isNat8Ref(kind.inner)
          ? { kind: "blob" }
          : { kind: "vec", inner: this.runtimeTypeRef(kind.inner) }
      case "record":
        return {
          kind: "record",
          fields: kind.fields.map((field) => this.runtimeField(field)),
        }
      case "variant":
        return {
          kind: "variant",
          fields: kind.fields.map((field) => this.runtimeField(field)),
        }
      case "func":
        return {
          kind: "func",
          args: kind.args.map((arg) => this.runtimeArg(arg)),
          returns: kind.returns.map((arg) => this.runtimeArg(arg)),
          mode: kind.mode,
        }
      case "service":
        return {
          kind: "service",
          methods: kind.methods.map((id) =>
            this.runtimeMethod(id, this.method(id))
          ),
        }
    }
  }

  private isNat8Ref(reference: ProgramTypeRefIR): boolean {
    return this.typeKind(this.resolveRef(reference)).kind === "nat8"
  }

  #validateMethodArena(): void {
    const referencedMethodIds = new Set<MethodId>()

    for (let typeId = 0; typeId < this.ir.types.length; typeId++) {
      const kind = this.ir.types[typeId]!.kind
      if (kind.kind !== "service") {
        continue
      }

      const methodNames = new Set<string>()
      for (const methodId of kind.methods) {
        if (referencedMethodIds.has(methodId)) {
          throw new Error(`duplicate ProgramIR method reference ${methodId}`)
        }
        referencedMethodIds.add(methodId)

        const method = this.method(methodId)
        if (methodNames.has(method.name)) {
          throw new Error(
            `duplicate ProgramIR method name ${JSON.stringify(method.name)} in service ${typeId}`
          )
        }
        methodNames.add(method.name)
      }
    }

    for (let methodId = 0; methodId < this.ir.methods.length; methodId++) {
      if (!referencedMethodIds.has(methodId)) {
        throw new Error(
          `ProgramIR method ${methodId} is not referenced by a service`
        )
      }
    }
  }
}

export function runtimeProgramView(ir: ProgramIR): RuntimeProgramIR {
  return new ProgramIrGraph(ir).runtimeProgram()
}

export function fieldObjectKey(field: CandidFieldIR | ProgramFieldIR): string {
  switch (field.label.kind) {
    case "named":
      return field.label.name
    case "id":
    case "unnamed":
      return `_${fieldCandidId(field)}_`
  }
}

function runtimeFieldLabel(label: ProgramFieldLabelIR): CandidFieldLabelIR {
  switch (label.kind) {
    case "named":
      return { kind: "named", name: label.name }
    case "id":
      return { kind: "id", id: fieldLabelCandidId(label) }
    case "unnamed":
      return { kind: "unnamed", id: fieldLabelCandidId(label) }
  }
}

function fieldCandidId(field: CandidFieldIR | ProgramFieldIR): number {
  if ("candidId" in field && typeof field.candidId === "number") {
    return field.candidId
  }
  return fieldLabelCandidId(field.label)
}

function fieldLabelCandidId(
  label: CandidFieldLabelIR | ProgramFieldLabelIR
): number {
  if ("id" in label && typeof label.id === "number") {
    return label.id
  }
  const labelWithId = label as { candidId?: number; candid_id?: number }
  const candidId = labelWithId.candidId ?? labelWithId.candid_id
  if (typeof candidId === "number") {
    return candidId
  }
  throw new Error(`ProgramIR field label ${label.kind} is missing candid id`)
}

function withMetadata<T extends object>(
  value: T,
  metadata: ProgramMetadataIR | undefined
): T & {
  docs?: string[]
  rawDocs?: string[]
  docTags?: DocTag[]
} {
  const out: T & {
    docs?: string[]
    rawDocs?: string[]
    docTags?: DocTag[]
  } = { ...value }
  if (metadata?.docs?.length) {
    out.docs = metadata.docs
  }
  if (metadata?.rawDocs?.length) {
    out.rawDocs = metadata.rawDocs
  }
  if (metadata?.docTags?.length) {
    out.docTags = metadata.docTags
  }
  return out
}
