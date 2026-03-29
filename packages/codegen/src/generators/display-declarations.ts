/**
 * Display Declarations Generator
 *
 * Transforms standard Candid TypeScript declarations into display-friendly types.
 * The standard .d.ts emitted by @ic-reactor/parser uses raw Candid types
 * (bigint, Principal, [] | [T], etc.) — this module post-processes those
 * into display types that match what DisplayReactor actually returns at runtime.
 *
 * Transformation rules:
 *   bigint                → string
 *   Principal             → string
 *   [] | [T]              → T | undefined        (Candid opt)
 *   Uint8Array | number[] → string | Uint8Array   (Candid blob / vec nat8)
 *   Variant unions get _type discriminator added
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface DisplayDeclarationsOptions {
  /** The standard .d.ts content produced by didToTs() */
  standardDts: string
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ENTRY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transform a standard Candid .d.ts string into display-friendly types.
 *
 * This is a text-level transform that operates on the predictable output
 * format of `candid_parser::bindings::typescript::compile()`.
 */
export function transformToDisplayDts(
  options: DisplayDeclarationsOptions
): string {
  const { standardDts } = options

  let result = standardDts

  // ── Step 1: Replace bigint → string ────────────────────────────────────
  result = replaceType(result, "bigint", "string")

  // ── Step 2: Replace Principal → string ─────────────────────────────────
  result = replaceType(result, "Principal", "string")

  // ── Step 3: Remove the now-unused Principal import ─────────────────────
  result = result.replace(
    /import type \{ string \} from '[^']+';?\n/,
    "// Display types: Principal is represented as string\n"
  )

  // ── Step 4: Replace Candid opt pattern: [] | [T] → T | undefined ──────
  result = transformOptionals(result)

  // ── Step 5: Replace blob type: Uint8Array | number[] → string | Uint8Array
  result = transformBlobs(result)

  // ── Step 6: Add _type discriminator to variant type declarations ───────
  result = transformVariantTypeDeclarations(result)

  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSFORMS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replace a type name with another, using word boundaries to avoid partial matches.
 */
function replaceType(source: string, from: string, to: string): string {
  const regex = new RegExp(`\\b${from}\\b`, "g")
  return source.replace(regex, to)
}

/**
 * Transform Candid optional pattern `[] | [T]` into `T | undefined`.
 *
 * Handles simple and complex inner types by iterating until stable.
 */
function transformOptionals(source: string): string {
  let result = source
  let prev = ""

  while (result !== prev) {
    prev = result
    result = result.replace(
      /\[\]\s*\|\s*\[([^\[\]]*(?:\[[^\[\]]*\])*[^\[\]]*)\]/g,
      (_match, inner: string) => {
        const trimmed = inner.trim()
        if (trimmed.includes(" | ")) {
          return `(${trimmed}) | undefined`
        }
        return `${trimmed} | undefined`
      }
    )
  }

  return result
}

/**
 * Transform blob type `Uint8Array | number[]` into `string | Uint8Array`.
 */
function transformBlobs(source: string): string {
  return source.replace(/Uint8Array\s*\|\s*number\[\]/g, "string | Uint8Array")
}

/**
 * Transform variant type declarations to include `_type` discriminators.
 *
 * Targets `export type X = { 'A' : T } | { 'B' : U }` patterns (both
 * single-line and multi-line) which are how candid_parser emits Candid variants.
 *
 * Strategy: collect each `export type ... = ...;` declaration as a whole,
 * decide whether it's a variant union, and if so rewrite its members.
 */
function transformVariantTypeDeclarations(source: string): string {
  const lines = source.split("\n")
  const result: string[] = []

  let inTypeDecl = false
  let typeBuffer: string[] = []

  for (const line of lines) {
    // Detect start of a type alias declaration
    if (!inTypeDecl && line.startsWith("export type ") && line.includes("=")) {
      if (line.trimEnd().endsWith(";")) {
        // Single-line type declaration — check and optionally transform
        result.push(maybeTransformVariant(line))
      } else {
        // Multi-line: start buffering
        inTypeDecl = true
        typeBuffer = [line]
      }
      continue
    }

    if (inTypeDecl) {
      typeBuffer.push(line)

      // Check if type declaration is complete (ends with ;)
      if (line.trimEnd().endsWith(";")) {
        const fullDecl = typeBuffer.join("\n")
        result.push(maybeTransformVariant(fullDecl))
        inTypeDecl = false
        typeBuffer = []
      }
      continue
    }

    result.push(line)
  }

  // Flush remaining buffer
  if (typeBuffer.length > 0) {
    result.push(...typeBuffer)
  }

  return result.join("\n")
}

/**
 * Given a full `export type X = ...;` declaration, decide if it's a variant
 * union and transform it if so.
 */
function maybeTransformVariant(declaration: string): string {
  // Extract the RHS (everything after "=")
  const eqIdx = declaration.indexOf("=")
  if (eqIdx < 0) return declaration

  const rhs = declaration.substring(eqIdx + 1)

  // A variant union in candid_parser output is a `|`-separated list of
  // single-key objects: `{ 'Key' : Value }`. Check if the RHS matches
  // this pattern by looking for `|` between `}` and `{` at the top level.
  if (!isVariantUnion(rhs)) {
    return declaration
  }

  return transformVariantMembers(declaration)
}

/**
 * Check if a type RHS is a variant union (union of single-key objects).
 *
 * Detects patterns like:
 * - `{ 'Ok' : T } | { 'Err' : E };`
 * - `{ 'A' : null } | { 'B' : { 'x': string } };` (with nested records)
 *
 * Non-variant patterns (records with multiple keys) don't have `} |` at
 * the top brace level.
 */
function isVariantUnion(rhs: string): boolean {
  // Must contain at least one `|` between `}` and `{` at brace depth 0
  let depth = 0
  let seenCloseBrace = false

  for (let i = 0; i < rhs.length; i++) {
    const ch = rhs[i]

    if (ch === "{") {
      depth++
      seenCloseBrace = false
    } else if (ch === "}") {
      depth--
      if (depth === 0) seenCloseBrace = true
    } else if (ch === "|" && depth === 0 && seenCloseBrace) {
      return true
    }
  }

  return false
}

/**
 * Transform each variant member in a declaration by adding `_type` discriminator.
 *
 * Uses brace-depth tracking to correctly handle nested records inside variant values.
 */
function transformVariantMembers(declaration: string): string {
  // Split at the = sign to preserve the type name
  const eqIdx = declaration.indexOf("=")
  const prefix = declaration.substring(0, eqIdx + 1)
  const rhs = declaration.substring(eqIdx + 1)

  // Parse variant members by tracking brace depth
  const transformed = transformVariantRhs(rhs)

  return prefix + transformed
}

/**
 * Transform the RHS of a variant type by adding `_type` to each member.
 *
 * Handles:
 * - `{ 'Ok' : BlockIndex }` → `{ '_type' : 'Ok', 'Ok' : BlockIndex }`
 * - `{ 'TooOld' : null }` → `{ '_type' : 'TooOld' }`
 * - `{ 'GenericError' : { 'message' : string, 'error_code' : string } }`
 *   → `{ '_type' : 'GenericError', 'GenericError' : { ... } }`
 */
function transformVariantRhs(rhs: string): string {
  let result = ""
  let i = 0

  while (i < rhs.length) {
    // Look for the start of a variant member: `{`
    if (rhs[i] === "{") {
      // Find the matching closing brace at depth 0
      const memberStart = i
      let depth = 1
      i++

      while (i < rhs.length && depth > 0) {
        if (rhs[i] === "{") depth++
        else if (rhs[i] === "}") depth--
        i++
      }

      const memberContent = rhs.substring(memberStart, i)
      result += transformSingleVariantMember(memberContent)
    } else {
      result += rhs[i]
      i++
    }
  }

  return result
}

/**
 * Transform a single variant member like `{ 'Ok' : BlockIndex }`
 * into `{ '_type' : 'Ok', 'Ok' : BlockIndex }`.
 */
function transformSingleVariantMember(member: string): string {
  // Extract the key from the member: { 'Key' : Value }
  const keyMatch = member.match(/\{\s*'([^']+)'\s*:\s*/)
  if (!keyMatch) return member

  const key = keyMatch[1]
  // Extract everything after the key:value separator
  const afterKey = member.substring(keyMatch[0].length)
  // Remove trailing `}`
  const value = afterKey.replace(/\s*\}\s*$/, "").trim()

  if (value === "null") {
    return `{ '_type' : '${key}' }`
  }

  return `{ '_type' : '${key}', '${key}' : ${value} }`
}
