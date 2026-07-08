import {
  fieldLabelCandidId,
  isBlobRef,
  isBlobTypeId,
  ProgramIrGraph,
} from "./program-ir.js"
import type {
  DeclId,
  ProgramFieldIR,
  ProgramTypeRefIR,
  TypeId,
} from "./types.js"

export function candidTypeTextRef(
  graph: ProgramIrGraph,
  reference: ProgramTypeRefIR,
  refs: Set<DeclId> = new Set()
): string {
  if (isBlobRef(graph, reference)) {
    return "blob"
  }

  switch (reference.kind) {
    case "type":
      return candidTypeTextId(graph, reference.id, refs)
    case "decl": {
      const declaration = graph.declaration(reference.id)
      if (refs.has(reference.id)) {
        return declaration.name
      }
      return candidTypeTextId(
        graph,
        declaration.type,
        new Set([...refs, reference.id])
      )
    }
  }
}

export function candidTypeTextId(
  graph: ProgramIrGraph,
  id: TypeId,
  refs: Set<DeclId> = new Set()
): string {
  if (isBlobTypeId(graph, id)) {
    return "blob"
  }

  const kind = graph.typeKind(id)
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
      return kind.kind
    case "opt":
      return `opt ${candidTypeTextRef(graph, kind.inner, refs)}`
    case "vec":
      return `vec ${candidTypeTextRef(graph, kind.inner, refs)}`
    case "record":
      return `record { ${kind.fields.map((field) => fieldTypeText(graph, field, refs)).join("; ")} }`
    case "variant":
      return `variant { ${kind.fields.map((field) => fieldTypeText(graph, field, refs)).join("; ")} }`
    case "func": {
      const args = kind.args
        .map((arg) => candidTypeTextRef(graph, arg.type, refs))
        .join(", ")
      const returns = kind.returns
        .map((arg) => candidTypeTextRef(graph, arg.type, refs))
        .join(", ")
      const mode = kind.mode !== "update" ? ` ${kind.mode}` : ""
      return `func (${args}) -> (${returns})${mode}`
    }
    case "service":
      return `service { ${kind.methods
        .map((methodId) => {
          const method = graph.method(methodId)
          const args = method.args
            .map((arg) => candidTypeTextRef(graph, arg.type, refs))
            .join(", ")
          const returns = method.returns
            .map((arg) => candidTypeTextRef(graph, arg.type, refs))
            .join(", ")
          const mode = method.mode !== "update" ? ` ${method.mode}` : ""
          return `${candidLabel(method.name)} : (${args}) -> (${returns})${mode}`
        })
        .join("; ")} }`
  }
}

export function candidFieldLabel(field: ProgramFieldIR): string {
  switch (field.label.kind) {
    case "named":
      return candidLabel(field.label.name)
    case "id":
    case "unnamed":
      return String(fieldLabelCandidId(field.label))
  }
}

export function candidLabel(value: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) && !CANDID_KEYWORDS.has(value)
    ? value
    : JSON.stringify(value)
}

function fieldTypeText(
  graph: ProgramIrGraph,
  field: ProgramFieldIR,
  refs: Set<DeclId>
): string {
  const type = candidTypeTextRef(graph, field.type, refs)
  const label = candidFieldLabel(field)
  if (isDirectNullRef(graph, field.type)) {
    return label
  }
  return `${label} : ${type}`
}

function isDirectNullRef(
  graph: ProgramIrGraph,
  reference: ProgramTypeRefIR
): boolean {
  return (
    reference.kind === "type" && graph.typeKind(reference.id).kind === "null"
  )
}

const CANDID_KEYWORDS = new Set([
  "blob",
  "bool",
  "decimal",
  "empty",
  "float32",
  "float64",
  "func",
  "import",
  "int",
  "int8",
  "int16",
  "int32",
  "int64",
  "nat",
  "nat8",
  "nat16",
  "nat32",
  "nat64",
  "null",
  "opt",
  "principal",
  "query",
  "record",
  "reserved",
  "service",
  "text",
  "type",
  "variant",
  "vec",
])
