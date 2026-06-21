import type {
  CandidSchema,
  CandidType,
  CandidTypeDeclaration,
} from "@ic-reactor/parser"

/**
 * Checks if a string is a valid JavaScript identifier that can be used
 * as an unquoted property key in an object.
 */
function isValidIdentifier(name: string): boolean {
  const regex = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/
  const reserved = new Set([
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
  return regex.test(name) && !reserved.has(name)
}

/**
 * Returns a list of all type names referenced by the given type.
 */
function getReferencedNames(type: CandidType): string[] {
  const refs: string[] = []
  function visit(node: CandidType) {
    if (!node) return
    if (node.kind === "reference") {
      refs.push(node.name)
    } else if (node.kind === "opt" || node.kind === "vec") {
      visit(node.type)
    } else if (node.kind === "record" || node.kind === "variant") {
      for (const field of node.fields) {
        visit(field.type)
      }
    } else if (node.kind === "tuple") {
      for (const t of node.types) {
        visit(t)
      }
    }
  }
  visit(type)
  return refs
}

/**
 * Sorts type declarations topologically so that dependencies are defined before they are referenced.
 */
export function sortDeclarations(
  declarations: CandidTypeDeclaration[]
): CandidTypeDeclaration[] {
  const sorted: CandidTypeDeclaration[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()

  const declMap = new Map(declarations.map((d) => [d.name, d]))

  function visit(name: string) {
    if (visited.has(name)) return
    if (visiting.has(name)) {
      // Cycle detected: break cycle and return
      return
    }
    visiting.add(name)
    const decl = declMap.get(name)
    if (decl) {
      const deps = getReferencedNames(decl.type)
      for (const dep of deps) {
        visit(dep)
      }
      sorted.push(decl)
    }
    visiting.delete(name)
    visited.add(name)
  }

  for (const decl of declarations) {
    visit(decl.name)
  }

  return sorted
}

/**
 * Recursively renders a CandidType AST node into `@ic-reactor/cod` codec builder syntax.
 */
export function renderType(type: CandidType, indent: string = ""): string {
  const nextIndent = indent + "  "
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
      return type.name
    case "opt":
      return `c.opt(${renderType(type.type, indent)})`
    case "vec":
      return `c.vec(${renderType(type.type, indent)})`
    case "record": {
      if (type.fields.length === 0) return "c.record({})"
      const fields = type.fields
        .map((f) => {
          const key = isValidIdentifier(f.name)
            ? f.name
            : JSON.stringify(f.name)
          return `${nextIndent}${key}: ${renderType(f.type, nextIndent)}`
        })
        .join(",\n")
      return `c.record({\n${fields}\n${indent}})`
    }
    case "variant": {
      if (type.fields.length === 0) return "c.variant({})"
      const fields = type.fields
        .map((f) => {
          const key = isValidIdentifier(f.name)
            ? f.name
            : JSON.stringify(f.name)
          return `${nextIndent}${key}: ${renderType(f.type, nextIndent)}`
        })
        .join(",\n")
      return `c.variant({\n${fields}\n${indent}})`
    }
    case "tuple": {
      if (type.types.length === 0) return "c.tuple([])"
      const elements = type.types.map((t) => renderType(t, indent)).join(", ")
      return `c.tuple([${elements}])`
    }
    case "func":
    case "service":
    case "class":
    case "unknown":
    case "knot":
    case "future":
      return `/* c.${type.kind} is not supported */ c.reserved()`
    default:
      return "c.reserved()"
  }
}

/**
 * Converts a structured CandidSchema JSON AST into readable `@ic-reactor/cod` codec declarations.
 *
 * @param schema The parsed CandidSchema AST
 * @param name The name of the generated top-level service variable (defaults to "service")
 */
export function generateCodecDeclarations(
  schema: CandidSchema,
  name: string = "service"
): string {
  // Sort the custom type declarations topologically to resolve references
  const sortedDecls = sortDeclarations(schema.types)

  // Render type declarations
  const declsCode = sortedDecls
    .map((decl) => {
      const rendered = renderType(decl.type)
      return `export const ${decl.name} = ${rendered};\nexport type ${decl.name} = c.infer<typeof ${decl.name}>;`
    })
    .join("\n\n")

  // Render service methods
  let serviceCode = ""
  if (schema.service) {
    const methodsCode = schema.service.methods
      .map((method) => {
        const argsCode = `[${method.args.map((a) => renderType(a, "    ")).join(", ")}]`
        let retCode = ""
        if (method.mode === "oneway") {
          retCode = ""
        } else {
          if (method.returns.length === 0) {
            retCode = ", undefined as any"
          } else if (method.returns.length === 1) {
            retCode = `, ${renderType(method.returns[0], "    ")}`
          } else {
            retCode = `, c.tuple([${method.returns.map((r) => renderType(r, "    ")).join(", ")}])`
          }
        }
        const key = isValidIdentifier(method.name)
          ? method.name
          : JSON.stringify(method.name)
        return `  ${key}: c.${method.mode}(${argsCode}${retCode})`
      })
      .join(",\n")

    serviceCode = `export const ${name} = c.service({\n${methodsCode}\n});\nexport type ${name} = c.ServiceOf<typeof ${name}>;`
  }

  return `import { c } from "@ic-reactor/cod";

${declsCode ? declsCode + "\n\n" : ""}${serviceCode}
`
}
