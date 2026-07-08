import { fieldLabelCandidId, ProgramIrGraph } from "./program-ir.js"
import type {
  ProgramFieldIR,
  ProgramIR,
  ProgramSemanticsIR,
  ProgramTypeKindIR,
  ProgramTypeRefIR,
  ProgramTypeSemanticIR,
  ProgramTypeSemanticsIR,
  TypeId,
} from "./types.js"

export function analyzeProgramSemantics(
  input: ProgramIR | ProgramIrGraph
): ProgramSemanticsIR {
  const graph =
    input instanceof ProgramIrGraph ? input : new ProgramIrGraph(input)
  return {
    types: graph
      .typeNodes()
      .map((node) => typeSemantics(detectTypeSemantic(graph, node.kind))),
  }
}

export class ProgramSemanticsGraph {
  constructor(
    readonly graph: ProgramIrGraph,
    readonly semantics: ProgramSemanticsIR = analyzeProgramSemantics(graph)
  ) {
    if (semantics.types.length !== graph.typeNodes().length) {
      throw new Error(
        `ProgramSemantics type count ${semantics.types.length} does not match ProgramIR type count ${graph.typeNodes().length}`
      )
    }
  }

  type(id: TypeId): ProgramTypeSemanticsIR {
    this.graph.typeNode(id)
    const semantics = this.semantics.types[id]
    if (!semantics) {
      throw new Error(`missing ProgramSemantics type ${id}`)
    }
    return semantics
  }

  semantic(id: TypeId): ProgramTypeSemanticIR | undefined {
    return this.type(id).semantic
  }

  isBlobType(id: TypeId): boolean {
    return this.semantic(id)?.kind === "blob"
  }

  isBlobRef(reference: ProgramTypeRefIR): boolean {
    return this.isBlobType(this.graph.resolveRef(reference))
  }

  isTupleType(id: TypeId): boolean {
    return this.semantic(id)?.kind === "tuple"
  }

  resultType(
    id: TypeId
  ): (ProgramTypeSemanticIR & { kind: "result" }) | undefined {
    const semantic = this.semantic(id)
    return semantic?.kind === "result" ? semantic : undefined
  }
}

function typeSemantics(
  semantic: ProgramTypeSemanticIR | undefined
): ProgramTypeSemanticsIR {
  return semantic ? { semantic } : {}
}

function detectTypeSemantic(
  graph: ProgramIrGraph,
  kind: ProgramTypeKindIR
): ProgramTypeSemanticIR | undefined {
  switch (kind.kind) {
    case "vec":
      return isBlobInner(graph, kind.inner) ? { kind: "blob" } : undefined
    case "record":
      return fieldsAreTuple(kind.fields) ? { kind: "tuple" } : undefined
    case "variant":
      return resultSemantic(kind.fields)
    default:
      return undefined
  }
}

function isBlobInner(
  graph: ProgramIrGraph,
  reference: ProgramTypeRefIR
): boolean {
  return graph.typeKind(graph.resolveRef(reference)).kind === "nat8"
}

function fieldsAreTuple(fields: readonly ProgramFieldIR[]): boolean {
  return (
    fields.length > 0 &&
    fields.every(
      (field, index) =>
        field.label.kind === "unnamed" &&
        fieldLabelCandidId(field.label) === index
    )
  )
}

function resultSemantic(
  fields: readonly ProgramFieldIR[]
): ProgramTypeSemanticIR | undefined {
  if (fields.length !== 2) {
    return undefined
  }

  let okField: number | undefined
  let errField: number | undefined
  for (const field of fields) {
    if (field.label.kind !== "named") {
      return undefined
    }
    switch (field.label.name.toLowerCase()) {
      case "ok":
        okField = fieldLabelCandidId(field.label)
        break
      case "err":
        errField = fieldLabelCandidId(field.label)
        break
      default:
        return undefined
    }
  }

  return okField === undefined || errField === undefined
    ? undefined
    : { kind: "result", okField, errField }
}
