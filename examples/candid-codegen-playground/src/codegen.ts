/**
 * Candid → Cod Codegen Engine
 *
 * Converts Candid .did source into @ic-reactor/cod codec TypeScript code.
 * Uses the parser's didToJs output and regex-parses the IDL structure
 * to produce clean cod schema declarations.
 */

// ─── Candid Type Mapping ──────────────────────────────────────────────────

const PRIMITIVE_MAP: Record<string, string> = {
  "IDL.Text": "c.text()",
  "IDL.Bool": "c.bool()",
  "IDL.Nat": "c.nat()",
  "IDL.Int": "c.int()",
  "IDL.Nat8": "c.nat8()",
  "IDL.Nat16": "c.nat16()",
  "IDL.Nat32": "c.nat32()",
  "IDL.Nat64": "c.nat64()",
  "IDL.Int8": "c.int8()",
  "IDL.Int16": "c.int16()",
  "IDL.Int32": "c.int32()",
  "IDL.Int64": "c.int64()",
  "IDL.Float32": "c.float32()",
  "IDL.Float64": "c.float64()",
  "IDL.Principal": "c.principal()",
  "IDL.Null": "c.null()",
  "IDL.Reserved": "c.reserved()",
  "IDL.Empty": "c.empty()",
}

/**
 * Convert an IDL type expression into a cod codec expression.
 */
function convertIdlType(
  expr: string,
  namedTypes: Map<string, string>,
  indent: number = 2
): string {
  const trimmed = expr.trim()

  // Check primitives first
  if (PRIMITIVE_MAP[trimmed]) {
    return PRIMITIVE_MAP[trimmed]
  }

  // Check if it's a reference to a named type
  if (namedTypes.has(trimmed)) {
    return trimmed
  }

  // IDL.Opt(...)
  const optMatch = trimmed.match(/^IDL\.Opt\((.+)\)$/)
  if (optMatch) {
    return `c.opt(${convertIdlType(optMatch[1], namedTypes, indent)})`
  }

  // IDL.Vec(IDL.Nat8) → c.blob()
  if (trimmed === "IDL.Vec(IDL.Nat8)") {
    return "c.blob()"
  }

  // IDL.Vec(...)
  const vecMatch = trimmed.match(/^IDL\.Vec\((.+)\)$/)
  if (vecMatch) {
    return `c.vec(${convertIdlType(vecMatch[1], namedTypes, indent)})`
  }

  // IDL.Record({...})
  const recordMatch = trimmed.match(/^IDL\.Record\(\{([\s\S]*)\}\)$/)
  if (recordMatch) {
    return convertRecordFields(recordMatch[1], namedTypes, indent)
  }

  // IDL.Variant({...})
  const variantMatch = trimmed.match(/^IDL\.Variant\(\{([\s\S]*)\}\)$/)
  if (variantMatch) {
    return convertVariantFields(variantMatch[1], namedTypes, indent)
  }

  // IDL.Tuple(...)
  const tupleMatch = trimmed.match(/^IDL\.Tuple\(([\s\S]*)\)$/)
  if (tupleMatch) {
    const elements = splitTopLevelArgs(tupleMatch[1])
    const converted = elements.map((e) =>
      convertIdlType(e, namedTypes, indent + 2)
    )
    return `c.tuple([${converted.join(", ")}])`
  }

  // Fallback: return raw expression as comment
  return `/* ${trimmed} */ c.reserved()`
}

/**
 * Convert IDL.Record fields into a c.record({...}) expression.
 */
function convertRecordFields(
  fieldsStr: string,
  namedTypes: Map<string, string>,
  indent: number
): string {
  const fields = parseFields(fieldsStr)
  if (fields.length === 0) return "c.record({})"

  const pad = " ".repeat(indent)
  const innerPad = " ".repeat(indent + 2)
  const lines = fields.map(
    ([key, val]) =>
      `${innerPad}${formatFieldName(key)}: ${convertIdlType(val, namedTypes, indent + 2)},`
  )
  return `c.record({\n${lines.join("\n")}\n${pad}})`
}

/**
 * Convert IDL.Variant fields into a c.variant({...}) expression.
 */
function convertVariantFields(
  fieldsStr: string,
  namedTypes: Map<string, string>,
  indent: number
): string {
  const fields = parseFields(fieldsStr)
  if (fields.length === 0) return "c.variant({})"

  const pad = " ".repeat(indent)
  const innerPad = " ".repeat(indent + 2)
  const lines = fields.map(
    ([key, val]) =>
      `${innerPad}${formatFieldName(key)}: ${convertIdlType(val, namedTypes, indent + 2)},`
  )
  return `c.variant({\n${lines.join("\n")}\n${pad}})`
}

/**
 * Parse the inside of a record/variant `{ key: Value, ... }` body.
 * Handles nested braces/parens correctly.
 */
function parseFields(body: string): [string, string][] {
  const fields: [string, string][] = []
  const trimmed = body.trim()
  if (!trimmed) return fields

  // Split by commas at the top level
  const entries = splitTopLevelArgs(trimmed)

  for (const entry of entries) {
    const colonIdx = entry.indexOf(":")
    if (colonIdx === -1) continue

    const key = entry.slice(0, colonIdx).trim().replace(/['"]/g, "")
    const value = entry.slice(colonIdx + 1).trim()
    if (key && value) {
      fields.push([key, value])
    }
  }

  return fields
}

/**
 * Split a string by commas, but only at the top nesting level
 * (respecting parens and braces).
 */
function splitTopLevelArgs(str: string): string[] {
  const result: string[] = []
  let depth = 0
  let current = ""

  for (const char of str) {
    if (char === "(" || char === "{" || char === "[") {
      depth++
      current += char
    } else if (char === ")" || char === "}" || char === "]") {
      depth--
      current += char
    } else if (char === "," && depth === 0) {
      const trimmed = current.trim()
      if (trimmed) result.push(trimmed)
      current = ""
    } else {
      current += char
    }
  }

  const trimmed = current.trim()
  if (trimmed) result.push(trimmed)
  return result
}

/**
 * Format a field name: if it contains special chars, quote it.
 */
function formatFieldName(name: string): string {
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) {
    return name
  }
  return `"${name}"`
}

// ─── JS Output → Cod Schema ────────────────────────────────────────────────

/**
 * Main entry: convert raw didToJs output into cod schema TypeScript.
 */
export function generateCodSchema(jsOutput: string): string {
  const lines: string[] = []
  const namedTypes = new Map<string, string>()

  lines.push(`import { c } from "@ic-reactor/cod"`)
  lines.push(`import type { Principal } from "@icp-sdk/core/principal"`)
  lines.push("")

  // We need a more robust approach: find all `const X = IDL.Something(...)` blocks
  const typeBlocks = extractTypeBlocks(jsOutput)

  for (const [name, idlExpr] of typeBlocks) {
    namedTypes.set(name, idlExpr)
  }

  // Generate named type declarations
  for (const [name, idlExpr] of typeBlocks) {
    const codExpr = convertIdlType(idlExpr, namedTypes, 2)
    lines.push(`export const ${name} = ${codExpr}`)
    lines.push("")
    lines.push(`export type ${name} = c.infer<typeof ${name}>`)
    lines.push("")
  }

  // Extract service methods
  const serviceMatch = jsOutput.match(/IDL\.Service\(\{([\s\S]*?)\}\s*\)/)

  if (serviceMatch) {
    const methodsStr = serviceMatch[1]
    const methods = parseServiceMethods(methodsStr, namedTypes)

    if (methods.length > 0) {
      lines.push("export const service = c.service({")
      for (const method of methods) {
        lines.push(`  ${method},`)
      }
      lines.push("})")
      lines.push("")
      lines.push("export const idlFactory = service.idlFactory")
      lines.push("export type _SERVICE = c.ServiceOf<typeof service>")
      lines.push("")
      lines.push("export const manifest = service.manifest()")
    }
  }

  return lines.join("\n")
}

/**
 * Extract named type blocks from JS output.
 * Handles multi-line IDL expressions with balanced parens.
 */
function extractTypeBlocks(js: string): [string, string][] {
  const blocks: [string, string][] = []
  const regex = /const\s+(\w+)\s*=\s*(IDL\.[a-zA-Z0-9_]+)/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(js)) !== null) {
    const name = match[1]
    const startIdx = match.index + match[0].length

    // Check if the next non-whitespace char is an opening parenthesis '('
    let nextChar = ""
    let nextCharIdx = startIdx
    while (nextCharIdx < js.length) {
      const char = js[nextCharIdx]
      if (/\s/.test(char)) {
        nextCharIdx++
      } else {
        nextChar = char
        break
      }
    }

    let fullExpr = ""
    if (nextChar === "(") {
      // Find the balanced closing paren
      let depth = 0
      let endIdx = nextCharIdx
      for (let i = nextCharIdx; i < js.length; i++) {
        if (js[i] === "(") depth++
        else if (js[i] === ")") {
          depth--
          if (depth === 0) {
            endIdx = i
            break
          }
        }
      }
      const exprStart = js.indexOf("IDL.", match.index)
      fullExpr = js.slice(exprStart, endIdx + 1)
    } else {
      // No parenthesis, read up to semicolon
      const exprStart = js.indexOf("IDL.", match.index)
      let endIdx = js.indexOf(";", exprStart)
      if (endIdx === -1) {
        endIdx = js.length
      }
      fullExpr = js.slice(exprStart, endIdx).trim()
    }

    blocks.push([name, fullExpr])
  }

  return blocks
}

/**
 * Parse service method declarations from the IDL.Service({...}) body.
 */
function parseServiceMethods(
  body: string,
  namedTypes: Map<string, string>
): string[] {
  const methods: string[] = []

  // Match: 'methodName' : IDL.Func([args], [rets], ['query'|'oneway'|<none>])
  const methodRegex =
    /['"](\w+)['"]\s*:\s*IDL\.Func\(\s*\[([\s\S]*?)\],\s*\[([\s\S]*?)\],\s*\[([\s\S]*?)\]\)/g
  let match: RegExpExecArray | null

  while ((match = methodRegex.exec(body)) !== null) {
    const [, name, argsStr, retsStr, annotationsStr] = match

    const args = splitTopLevelArgs(argsStr)
      .filter((a) => a.trim())
      .map((a) => convertIdlType(a, namedTypes))

    const rets = splitTopLevelArgs(retsStr)
      .filter((r) => r.trim())
      .map((r) => convertIdlType(r, namedTypes))

    const isQuery = annotationsStr.includes("'query'")
    const isOneway = annotationsStr.includes("'oneway'")

    const mode = isOneway ? "oneway" : isQuery ? "query" : "update"
    const argsArray = `[${args.join(", ")}]`

    if (mode === "oneway") {
      methods.push(`${formatFieldName(name)}: c.oneway(${argsArray})`)
    } else {
      const ret = rets.length > 0 ? rets[0] : "c.null()"
      methods.push(`${formatFieldName(name)}: c.${mode}(${argsArray}, ${ret})`)
    }
  }

  return methods
}
