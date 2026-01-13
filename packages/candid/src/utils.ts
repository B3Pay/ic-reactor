import type { CandidDefinition } from "./types"

/**
 * Imports and evaluates a Candid definition from JavaScript code.
 *
 * @param candidJs - The JavaScript code containing the Candid definition.
 * @returns A promise that resolves to the CandidDefinition.
 * @throws Error if the import fails.
 */
export async function importCandidDefinition(
  candidJs: string
): Promise<CandidDefinition> {
  try {
    // Create a data URL with the JavaScript code
    const dataUri =
      "data:text/javascript;charset=utf-8," + encodeURIComponent(candidJs)

    // Dynamically import the module
    const module = await import(/* webpackIgnore: true */ dataUri)

    return {
      idlFactory: module.idlFactory,
      init: module.init,
    }
  } catch (error) {
    throw new Error(`Failed to import Candid definition: ${error}`)
  }
}
