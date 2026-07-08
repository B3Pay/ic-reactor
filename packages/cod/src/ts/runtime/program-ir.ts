import type {
  DeclId,
  MethodId,
  ProgramFieldIR,
  ProgramFieldLabelIR,
  ProgramIR,
  ProgramMethodIR,
  ProgramTypeDeclIR,
  ProgramTypeKindIR,
  ProgramTypeNodeIR,
  ProgramTypeRefIR,
  TypeId,
} from "./types.js"

export const PROGRAM_IR_VERSION = 1

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

export function assertProgramIRVersion(ir: ProgramIR): void {
  if (ir.version !== PROGRAM_IR_VERSION) {
    throw new UnsupportedProgramIRVersionError(ir.version)
  }
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

    this.#validateMethodArena()
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
    const actor = this.ir.actor
    if (!actor) {
      return []
    }
    return this.serviceMethodIds(actor.service)
  }

  actorMethods(): readonly ProgramMethodIR[] {
    return this.actorMethodIds().map((id) => this.method(id))
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
  const candidId = label.candidId ?? label.candid_id
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

export function isBlobTypeId(graph: ProgramIrGraph, id: TypeId): boolean {
  const kind = graph.typeKind(id)
  return kind.kind === "vec" && isNat8Ref(graph, kind.inner)
}

export function isBlobRef(
  graph: ProgramIrGraph,
  reference: ProgramTypeRefIR
): boolean {
  return isBlobTypeId(graph, graph.resolveRef(reference))
}

export function isNat8Ref(
  graph: ProgramIrGraph,
  reference: ProgramTypeRefIR
): boolean {
  return graph.typeKind(graph.resolveRef(reference)).kind === "nat8"
}
