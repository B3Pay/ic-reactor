import { CandidAdapter } from "./classes/candid"
import { CandidAdapterParameters } from "./types"

/**
 * The `CandidAdapter` class is used to interact with a canister and retrieve its Candid interface definition.
 * It provides methods to fetch the Candid definition either from the canister's metadata or by using a temporary hack method.
 * If both methods fail, it throws an error.
 *
 * @category Main
 * @includeExample ./packages/core/README.md:151-192
 */
export const createCandidAdapter = (config: CandidAdapterParameters) => {
  return new CandidAdapter(config)
}
