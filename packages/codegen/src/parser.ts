import { initCod, CandidProgram } from "@ic-reactor/cod"
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
export async function extractMethods(
  didContent: string
): Promise<MethodInfo[]> {
  try {
    await initCod()
    const program = new CandidProgram(didContent)
    const summary = program.summary()

    return summary.methods.map((m) => ({
      name: m.name,
      type:
        m.modes.includes("query") || m.modes.includes("composite_query")
          ? "query"
          : "mutation",
      hasArgs: m.args.length > 0,
    }))
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
export async function parseDIDFile(didFilePath: string): Promise<MethodInfo[]> {
  if (!fs.existsSync(didFilePath)) {
    throw new Error(`DID file not found: ${didFilePath}`)
  }
  const content = fs.readFileSync(didFilePath, "utf-8")
  return extractMethods(content)
}
