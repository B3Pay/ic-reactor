import type { CandidDefinition } from "./types"
import { IDL } from "@icp-sdk/core/candid"

/**
 * Imports and evaluates a Candid definition from JavaScript code.
 *
 * This function evaluates JavaScript code in a controlled manner to extract
 * the idlFactory and init exports. The evaluation is done using Function constructor
 * which is safer than dynamic imports with data URLs and more CSP-friendly.
 *
 * @param candidJs - The JavaScript code containing the Candid definition.
 * @returns A promise that resolves to the CandidDefinition.
 * @throws Error if the import fails.
 */
export async function importCandidDefinition(
  candidJs: string
): Promise<CandidDefinition> {
  try {
    // Create a module exports object
    const exports: Record<string, unknown> = {}

    // Transform ES6 export statements to assignments
    // This is safe because we're only transforming the syntax pattern,
    // not evaluating arbitrary code
    const transformedJs = candidJs
      // Replace 'export const name = value' with 'const name = value; exports.name = name'
      .replace(/export\s+const\s+(\w+)\s*=/g, "const $1 =")
      // Replace 'export function name' with 'function name'
      .replace(/export\s+function\s+(\w+)/g, "function $1")

    // Create a safe evaluation context with necessary globals
    // We provide IDL from the trusted @icp-sdk/core/candid package
    const evalFunction = new Function(
      "exports",
      "IDL",
      `
      ${transformedJs}
      
      // Capture exports
      if (typeof idlFactory !== 'undefined') {
        exports.idlFactory = idlFactory;
      }
      if (typeof init !== 'undefined') {
        exports.init = init;
      }
      return exports;
      `
    )

    // Execute the function with the exports object and IDL
    const result = evalFunction(exports, IDL)

    return {
      idlFactory: result.idlFactory as CandidDefinition["idlFactory"],
      init: result.init as CandidDefinition["init"],
    }
  } catch (error) {
    throw new Error(`Failed to import Candid definition: ${error}`)
  }
}

/**
 * Normalizes a raw Candid interface string by extracting the dynamic method signature
 * and wrapping it inside a proper service block, accommodating preceding type definitions.
 *
 * @param rawInput - The raw string (e.g., shorthand candid or string with type definitions followed by shorthand).
 * @param functionName - The function name to use when wrapping the signature.
 * @returns A valid `.did` format string with a service block containing the functionName.
 */
export function normalizeCandidInterface(
  rawInput: string,
  functionName: string = "dynamic_method"
): string {
  if (!rawInput || typeof rawInput !== "string") {
    return rawInput
  }

  const trimmed = rawInput.trim()

  // Match all type declarations to find the last one
  const typeMatches = [...trimmed.matchAll(/^type\s+[a-zA-Z0-9_]+\s*=/gm)]

  // If there is no type keyword, wrap the whole string in a mock service
  if (typeMatches.length === 0) {
    let methodSignature = trimmed
    if (methodSignature.endsWith(";")) {
      methodSignature = methodSignature.slice(0, -1)
    }
    return `service : { "${functionName}": ${methodSignature}; }`
  }

  const lastTypeMatch = typeMatches[typeMatches.length - 1]
  const startIndex = lastTypeMatch.index!

  let braceDepth = 0
  let parenDepth = 0
  let inString = false
  let signatureStartIndex = -1

  for (let i = startIndex; i < trimmed.length; i++) {
    const char = trimmed[i]
    if (char === '"' && i > 0 && trimmed[i - 1] !== "\\") {
      inString = !inString
      continue
    }
    if (inString) continue

    if (char === "{") braceDepth++
    else if (char === "}") braceDepth--
    else if (char === "(") parenDepth++
    else if (char === ")") parenDepth--
    else if (char === ";" && braceDepth === 0 && parenDepth === 0) {
      // End of the last type declaration
      signatureStartIndex = i + 1
      break
    }
  }

  // If we couldn't properly find the end of the type, fallback to assuming it's the last line (old behavior)
  if (signatureStartIndex === -1) {
    const lines = trimmed.split(/\r?\n/)
    const typeLines: string[] = []
    let methodSignature = ""

    for (let i = lines.length - 1; i >= 0; i--) {
      const lineTrimmed = lines[i].trim()
      if (lineTrimmed !== "") {
        methodSignature = lineTrimmed
        if (methodSignature.endsWith(";")) {
          methodSignature = methodSignature.slice(0, -1)
        }
        typeLines.push(...lines.slice(0, i))
        break
      }
    }

    const typeDefinitions = typeLines.join("\n")
    return `${typeDefinitions}\nservice : { "${functionName}": ${methodSignature}; }`
  }

  const typeDefinitions = trimmed.slice(0, signatureStartIndex).trim()
  let methodSignature = trimmed.slice(signatureStartIndex).trim()
  if (methodSignature.endsWith(";")) {
    methodSignature = methodSignature.slice(0, -1)
  }

  return `${typeDefinitions}\nservice : { "${functionName}": ${methodSignature}; }`
}
