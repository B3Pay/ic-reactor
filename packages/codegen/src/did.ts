/**
 * DID file parser
 *
 * Extracts method information from Candid interface definition files.
 * Based on the CLI's parser implementation (with comment stripping).
 */

import fs from "node:fs"
import type { MethodInfo } from "./types.js"

/**
 * Parse a .did file and extract method information
 */
export function parseDIDFile(didFilePath: string): MethodInfo[] {
  if (!fs.existsSync(didFilePath)) {
    throw new Error(`DID file not found: ${didFilePath}`)
  }

  const content = fs.readFileSync(didFilePath, "utf-8")
  return extractMethods(content)
}

/**
 * Extract methods from DID content
 *
 * Handles formats like:
 * - `name : (args) -> (result)`
 * - `name : (args) -> (result) query`
 * - `name : (args) -> (result) composite_query`
 * - `name : func (args) -> (result)`
 */
export function extractMethods(didContent: string): MethodInfo[] {
  const methods: MethodInfo[] = []

  // Remove comments
  const cleanContent = didContent
    .replace(/\/\/.*$/gm, "") // Single line comments
    .replace(/\/\*[\s\S]*?\*\//g, "") // Multi-line comments

  // Match method definitions
  // Pattern: name : [func] (args) -> (result) [query|composite_query]
  const methodRegex =
    /([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(?:func\s*)?\(([^)]*)\)\s*->\s*\(([^)]*)\)\s*(query|composite_query)?/g

  let match
  while ((match = methodRegex.exec(cleanContent)) !== null) {
    const name = match[1]
    const args = match[2].trim()
    const returnType = match[3].trim()
    const queryAnnotation = match[4]

    // Determine if it's a query or mutation
    const isQuery =
      queryAnnotation === "query" || queryAnnotation === "composite_query"

    methods.push({
      name,
      type: isQuery ? "query" : "mutation",
      hasArgs: args.length > 0 && args !== "",
      argsDescription: args || undefined,
      returnDescription: returnType || undefined,
    })
  }

  return methods
}

/**
 * Get methods by type
 */
export function getMethodsByType(
  methods: MethodInfo[],
  type: "query" | "mutation"
): MethodInfo[] {
  return methods.filter((m) => m.type === type)
}

/**
 * Format method info for display
 */
export function formatMethodForDisplay(method: MethodInfo): string {
  const typeLabel = method.type === "query" ? "query" : "update"
  const argsLabel = method.hasArgs ? "with args" : "no args"
  return `${method.name} (${typeLabel}, ${argsLabel})`
}
