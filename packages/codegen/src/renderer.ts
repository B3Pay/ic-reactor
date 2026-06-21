import type {
  CandidSchema,
  CandidType,
  CandidTypeDeclaration,
} from "@ic-reactor/parser"

const reservedWords = new Set([
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
  "let",
  "package",
  "private",
  "protected",
  "public",
  "static",
])

function isValidIdentifier(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) && !reservedWords.has(name)
}

function assertIdentifier(name: string, label: string): void {
  if (!isValidIdentifier(name)) {
    throw new Error(`${label} must be a valid TypeScript identifier: ${name}`)
  }
}

function propertyName(name: string): string {
  return isValidIdentifier(name) ? name : JSON.stringify(name)
}

function getReferencedNames(type: CandidType): string[] {
  const refs: string[] = []

  function visit(node: CandidType): void {
    switch (node.kind) {
      case "reference":
        refs.push(node.name)
        break
      case "opt":
      case "vec":
        visit(node.type)
        break
      case "record":
      case "variant":
        for (const field of node.fields) {
          visit(field.type)
        }
        break
      case "tuple":
        for (const item of node.types) {
          visit(item)
        }
        break
    }
  }

  visit(type)
  return refs
}

export function sortDeclarations(
  declarations: CandidTypeDeclaration[]
): CandidTypeDeclaration[] {
  const sorted: CandidTypeDeclaration[] = []
  const visited = new Set<string>()
  const visiting: string[] = []
  const declarationByName = new Map(
    declarations.map((decl) => [decl.name, decl])
  )

  function visit(name: string): void {
    if (visited.has(name)) return

    const cycleStart = visiting.indexOf(name)
    if (cycleStart !== -1) {
      const cycle = [...visiting.slice(cycleStart), name].join(" -> ")
      throw new Error(`Recursive Candid types are not supported yet: ${cycle}`)
    }

    const declaration = declarationByName.get(name)
    if (!declaration) return

    visiting.push(name)
    for (const dependency of getReferencedNames(declaration.type)) {
      visit(dependency)
    }
    visiting.pop()

    visited.add(name)
    sorted.push(declaration)
  }

  for (const declaration of declarations) {
    visit(declaration.name)
  }

  return sorted
}

export function renderType(type: CandidType, indent = ""): string {
  const nextIndent = `${indent}  `

  switch (type.kind) {
    case "null":
      return "c.null()"
    case "bool":
      return "c.bool()"
    case "nat":
      return "c.nat()"
    case "int":
      return "c.int()"
    case "nat8":
      return "c.nat8()"
    case "nat16":
      return "c.nat16()"
    case "nat32":
      return "c.nat32()"
    case "nat64":
      return "c.nat64()"
    case "int8":
      return "c.int8()"
    case "int16":
      return "c.int16()"
    case "int32":
      return "c.int32()"
    case "int64":
      return "c.int64()"
    case "float32":
      return "c.float32()"
    case "float64":
      return "c.float64()"
    case "text":
      return "c.text()"
    case "reserved":
      return "c.reserved()"
    case "empty":
      return "c.empty()"
    case "principal":
      return "c.principal()"
    case "blob":
      return "c.blob()"
    case "reference":
      assertIdentifier(type.name, "Type reference")
      return type.name
    case "opt":
      return `c.opt(${renderType(type.type, indent)})`
    case "vec":
      return `c.vec(${renderType(type.type, indent)})`
    case "record": {
      if (type.fields.length === 0) return "c.record({})"
      const fields = type.fields
        .map(
          (field) =>
            `${nextIndent}${propertyName(field.name)}: ${renderType(
              field.type,
              nextIndent
            )},`
        )
        .join("\n")
      return `c.record({\n${fields}\n${indent}})`
    }
    case "variant": {
      if (type.fields.length === 0) return "c.variant({})"
      const fields = type.fields
        .map(
          (field) =>
            `${nextIndent}${propertyName(field.name)}: ${renderType(
              field.type,
              nextIndent
            )},`
        )
        .join("\n")
      return `c.variant({\n${fields}\n${indent}})`
    }
    case "tuple":
      return `c.tuple([${type.types.map((item) => renderType(item, indent)).join(", ")}])`
    case "func":
    case "service":
    case "class":
    case "unknown":
    case "knot":
    case "future":
      return `/* c.${type.kind} is not supported */ c.reserved()`
  }
}

function renderMethodReturn(
  method: NonNullable<CandidSchema["service"]>["methods"][number]
): string {
  if (method.mode === "oneway") return ""
  if (method.returns.length === 0) return ""
  if (method.returns.length === 1) {
    return `, ${renderType(method.returns[0], "    ")}`
  }
  return `, c.tuple([${method.returns
    .map((returnType) => renderType(returnType, "    "))
    .join(", ")}])`
}

/**
 * Converts a structured CandidSchema AST into readable `@ic-reactor/cod`
 * codec declarations.
 */
export function generateCodecDeclarations(
  schema: CandidSchema,
  serviceExportName = "service"
): string {
  assertIdentifier(serviceExportName, "Service export name")

  const lines: string[] = ['import { c } from "@ic-reactor/cod"', ""]

  for (const declaration of sortDeclarations(schema.types)) {
    assertIdentifier(declaration.name, "Type declaration name")

    lines.push(
      `export const ${declaration.name} = ${renderType(declaration.type)}`
    )
    lines.push(
      `export type ${declaration.name} = c.infer<typeof ${declaration.name}>`
    )
    lines.push("")
  }

  if (schema.service) {
    const methods = schema.service.methods
      .map((method) => {
        const args = method.args
          .map((arg) => renderType(arg, "    "))
          .join(", ")
        return `  ${propertyName(method.name)}: c.${method.mode}([${args}]${renderMethodReturn(method)}),`
      })
      .join("\n")

    lines.push(`export const ${serviceExportName} = c.service({`)
    if (methods.length > 0) {
      lines.push(methods)
    }
    lines.push("})")
    lines.push("")
    lines.push(`export const idlFactory = ${serviceExportName}.idlFactory`)
    lines.push(
      `export type _SERVICE = c.ServiceOf<typeof ${serviceExportName}>`
    )
    lines.push("")
    lines.push(`export const manifest = ${serviceExportName}.manifest()`)
  }

  return `${lines.join("\n").trimEnd()}\n`
}
