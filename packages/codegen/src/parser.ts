/**
 * Candid Parser Utilities
 *
 * Parses Candid .did files to extract service method signatures.
 * Used by the CLI for listing methods and by advanced generators.
 */

import { didToJs } from "@ic-reactor/parser"
import fs from "node:fs"

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type MethodType = "query" | "mutation"

export interface MethodInfo {
  /** Method name as it appears in the Candid service */
  name: string
  /** "query" for read-only calls, "mutation" for update calls */
  type: MethodType
  /** True if the method takes at least one argument */
  hasArgs: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract method information from raw Candid source text.
 *
 * Compiles the Candid to JS and inspects the IDL.Service definition.
 */
export function extractMethods(didContent: string): MethodInfo[] {
  try {
    const jsContent = didToJs(didContent)

    const methods: MethodInfo[] = []

    // Find the IDL.Service({...}) body
    const serviceMatch = /IDL\.Service\(\{([\s\S]*?)\}\)/.exec(jsContent)
    if (!serviceMatch) return methods

    const serviceBody = serviceMatch[1]

    // Match each method: 'methodName': IDL.Func([args], [rets], [annotations])
    const methodRegex =
      /['"]([\w]+)['"]\s*:\s*IDL\.Func\(\s*\[(.*?)\],\s*\[.*?\],\s*\[(.*?)\]\)/g

    let match: RegExpExecArray | null
    while ((match = methodRegex.exec(serviceBody)) !== null) {
      const [, name, args, annotations] = match
      methods.push({
        name,
        type: annotations.includes("'query'") ? "query" : "mutation",
        hasArgs: args.trim().length > 0,
      })
    }

    return methods
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse Candid: ${msg}`)
  }
}

/**
 * Parse a .did file from disk and return its methods.
 *
 * @throws if the file does not exist or fails to parse
 */
export function parseDIDFile(didFilePath: string): MethodInfo[] {
  if (!fs.existsSync(didFilePath)) {
    throw new Error(`DID file not found: ${didFilePath}`)
  }
  const content = fs.readFileSync(didFilePath, "utf-8")
  return extractMethods(content)
}
