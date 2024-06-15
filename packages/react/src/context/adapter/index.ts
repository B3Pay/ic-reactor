import { createAdapterContext } from "./create"

/** @ignore */
export const AdapterHooks = createAdapterContext()

export const CandidAdapterContext = AdapterHooks.CandidAdapterContext

export * from "./provider"

export * from "./hooks/useCandidAdapter"
export * from "./hooks/useCandidEvaluation"
