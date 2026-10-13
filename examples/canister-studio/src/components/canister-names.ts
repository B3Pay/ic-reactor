import { shortPrincipal } from "../lib/format.ts"
import { knownCanisterName } from "../lib/registry.ts"

/**
 * The name the studio shows for a canister id: the registry's or the curated
 * list's name, otherwise the shortened id. Known before any interface loads,
 * so page titles (`head()`) can use it.
 */
export function canisterDisplayName(id: string): string {
  return knownCanisterName(id) ?? `Canister ${shortPrincipal(id)}`
}
