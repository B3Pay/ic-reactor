/**
 * Reactor file template generator
 *
 * Generates the reactor instance file for a canister using DisplayReactor.
 * Standardizes the output to include typed hooks and clean imports.
 */

import path from "node:path"
import { toPascalCase, getReactorName, getServiceTypeName } from "../naming.js"

export type ReactorGeneratorOptions = {
  canisterName: string
  didFile: string
  clientManagerPath?: string
}

/**
 * Generate the reactor file content
 */
export function generateReactorFile(options: ReactorGeneratorOptions): string {
  const pascalName = toPascalCase(options.canisterName)
  const reactorName = getReactorName(options.canisterName)
  const serviceName = getServiceTypeName(options.canisterName)
  // Always use DisplayReactor
  const reactorType = "DisplayReactor"

  const didFileName = path.basename(options.didFile)
  const declarationsPath = `./declarations/${didFileName}`
  const clientManagerPath = options.clientManagerPath ?? "../../clients"

  const vars: TemplateVars = {
    canisterName: options.canisterName,
    pascalName,
    reactorName,
    serviceName,
    reactorType,
    clientManagerPath,
    declarationsPath,
  }

  // If we have DID content, we can generate method-specific hooks (clean & typed)
  return generateStandardReactorFile(vars)
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface TemplateVars {
  canisterName: string
  pascalName: string
  reactorName: string
  serviceName: string
  reactorType: string
  clientManagerPath: string
  declarationsPath: string
}

// ═══════════════════════════════════════════════════════════════════════════
// STANDARD MODE
// ═══════════════════════════════════════════════════════════════════════════

function generateStandardReactorFile(vars: TemplateVars): string {
  const {
    pascalName,
    reactorName,
    serviceName,
    reactorType,
    clientManagerPath,
    declarationsPath,
    canisterName,
  } = vars

  return `import { ${reactorType}, createActorHooks } from "@ic-reactor/react"
import { clientManager } from "${clientManagerPath}"
import { idlFactory, type _SERVICE } from "${declarationsPath}"

export type ${serviceName} = _SERVICE

/**
 * ${pascalName} Display Reactor
 */
export const ${reactorName} = new ${reactorType}<${serviceName}>({
  clientManager,
  idlFactory,
  name: "${canisterName}",
})

export const {
  useActorQuery: use${pascalName}Query,
  useActorSuspenseQuery: use${pascalName}SuspenseQuery,
  useActorInfiniteQuery: use${pascalName}InfiniteQuery,
  useActorSuspenseInfiniteQuery: use${pascalName}SuspenseInfiniteQuery,
  useActorMutation: use${pascalName}Mutation,
  useActorMethod: use${pascalName}Method,
} = createActorHooks(${reactorName})
`
}
