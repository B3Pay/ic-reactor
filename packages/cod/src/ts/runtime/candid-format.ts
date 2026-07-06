import type { CandidFieldIR, CandidTypeIR } from "./types.js"

export function candidTypeText(
  type: CandidTypeIR,
  context?: { typeByName(name: string): CandidTypeIR | undefined },
  refs: Set<string> = new Set()
): string {
  switch (type.kind) {
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
    case "blob":
    case "reserved":
    case "empty":
      return type.kind
    case "opt":
      return `opt ${candidTypeText(type.inner, context, refs)}`
    case "vec":
      return `vec ${candidTypeText(type.inner, context, refs)}`
    case "record":
      return `record { ${type.fields.map((field) => fieldTypeText(field, context, refs)).join("; ")} }`
    case "variant":
      return `variant { ${type.fields.map((field) => fieldTypeText(field, context, refs)).join("; ")} }`
    case "ref": {
      if (!context || refs.has(type.name)) {
        return type.name
      }
      const target = context.typeByName(type.name)
      if (!target) {
        return type.name
      }
      return candidTypeText(target, context, new Set([...refs, type.name]))
    }
    case "func": {
      const args = type.args
        .map((arg) => candidTypeText(arg.type, context, refs))
        .join(", ")
      const returns = type.returns
        .map((arg) => candidTypeText(arg.type, context, refs))
        .join(", ")
      const mode = type.mode !== "update" ? ` ${type.mode}` : ""
      return `func (${args}) -> (${returns})${mode}`
    }
    case "service":
      return `service { ${type.methods
        .map((method) => {
          const args = method.args
            .map((arg) => candidTypeText(arg.type, context, refs))
            .join(", ")
          const returns = method.returns
            .map((arg) => candidTypeText(arg.type, context, refs))
            .join(", ")
          const mode = method.mode !== "update" ? ` ${method.mode}` : ""
          return `${candidLabel(method.name)} : (${args}) -> (${returns})${mode}`
        })
        .join("; ")} }`
  }
}

export function candidFieldLabel(field: CandidFieldIR): string {
  switch (field.label.kind) {
    case "named":
      return candidLabel(field.label.name)
    case "id":
    case "unnamed":
      return String(field.label.id)
  }
}

export function candidLabel(value: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) && !CANDID_KEYWORDS.has(value)
    ? value
    : JSON.stringify(value)
}

function fieldTypeText(
  field: CandidFieldIR,
  context: { typeByName(name: string): CandidTypeIR | undefined } | undefined,
  refs: Set<string>
): string {
  const type = candidTypeText(field.type, context, refs)
  const label = candidFieldLabel(field)
  if (field.type.kind === "null") {
    return label
  }
  return `${label} : ${type}`
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
