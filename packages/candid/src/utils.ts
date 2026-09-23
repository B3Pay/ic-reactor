import type { CandidDefinition } from "./types.js"
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

  // Comments are dropped first. Every scan below reads delimiters, semicolons
  // and `type` as code, and a trailing `// note` would otherwise comment out the
  // closing brace of the service built from the signature.
  const trimmed = stripCandidComments(rawInput).trim()

  assertBalancedCandidInterface(trimmed)

  // The declarations come first, each ended by its `;`, and the signature is
  // what follows them. They are read one after another from the start rather
  // than matched as lines beginning with `type`: that missed every indented
  // declaration after the first, which is how a template literal holds them,
  // and every declaration sharing a line with another.
  let signatureStartIndex = 0
  let hasDeclarations = false
  for (;;) {
    const offset = trimmed.slice(signatureStartIndex).search(/\S/)
    if (offset === -1) break
    const start = signatureStartIndex + offset
    if (!TYPE_DECLARATION.test(trimmed.slice(start))) break
    hasDeclarations = true
    const end = declarationEnd(trimmed, start)
    if (end === -1) {
      signatureStartIndex = -1
      break
    }
    signatureStartIndex = end + 1
  }

  // If there is no type keyword, wrap the whole string in a mock service
  if (!hasDeclarations) {
    let methodSignature = trimmed
    if (methodSignature.endsWith(";")) {
      methodSignature = methodSignature.slice(0, -1)
    }
    return `service : { "${functionName}": ${methodSignature}; }`
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

/** The start of a type declaration, `type Name =`. */
const TYPE_DECLARATION = /^type\s+[a-zA-Z0-9_]+\s*=/

/**
 * The index of the `;` ending the declaration that starts at `start`: the
 * first one outside quoted names, parentheses and braces, or -1 if there is
 * none.
 */
function declarationEnd(source: string, start: number): number {
  let depth = 0
  for (let i = start; i < source.length; i++) {
    const char = source[i]
    if (char === '"') {
      for (i++; i < source.length && source[i] !== '"'; i++) {
        if (source[i] === "\\") i++
      }
    } else if (char === "{" || char === "(") {
      depth++
    } else if (char === "}" || char === ")") {
      depth--
    } else if (char === ";" && depth === 0) {
      return i
    }
  }
  return -1
}

/**
 * Candid source with its `//` and `/* *\/` comments removed. Quoted names are
 * copied as they are, so a `//` inside one survives. Block comments may nest.
 */
function stripCandidComments(source: string): string {
  let out = ""
  let inString = false

  for (let i = 0; i < source.length; i++) {
    const char = source[i]

    if (inString) {
      out += char
      if (char === "\\") {
        out += source[++i] ?? ""
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      out += char
    } else if (char === "/" && source[i + 1] === "/") {
      while (i + 1 < source.length && source[i + 1] !== "\n") i++
    } else if (char === "/" && source[i + 1] === "*") {
      let depth = 1
      i += 2
      for (; i < source.length && depth > 0; i++) {
        if (source[i] === "/" && source[i + 1] === "*") {
          depth++
          i++
        } else if (source[i] === "*" && source[i + 1] === "/") {
          depth--
          i++
        }
      }
      if (depth > 0) {
        throw new Error("Malformed candid interface: unterminated comment")
      }
      i--
      out += " "
    } else {
      out += char
    }
  }

  return out
}

function assertBalancedCandidInterface(source: string) {
  const pairs: Record<string, string> = {
    "(": ")",
    "{": "}",
    "[": "]",
  }
  const stack: string[] = []
  let inString = false

  for (let i = 0; i < source.length; i++) {
    const char = source[i]

    if (char === '"' && source[i - 1] !== "\\") {
      inString = !inString
      continue
    }

    if (inString) continue

    if (char in pairs) {
      stack.push(char)
      continue
    }

    if (Object.values(pairs).includes(char)) {
      const last = stack.pop()
      if (!last || pairs[last] !== char) {
        throw new Error("Malformed candid interface: unbalanced delimiters")
      }
    }
  }

  if (inString || stack.length > 0) {
    throw new Error("Malformed candid interface: unbalanced delimiters")
  }
}
