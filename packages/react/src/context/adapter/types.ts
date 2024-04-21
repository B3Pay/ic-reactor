import type { PropsWithChildren } from "react"
import type { CandidAdapterParameters } from "@src/types"
import type { CandidAdapter } from "@ic-reactor/core/dist/classes"

export type { CandidAdapter }

export interface CandidAdapterContextType extends CandidAdapter {}

export interface CandidAdapterProviderProps
  extends PropsWithChildren,
    CandidAdapterParameters {
  withParser?: boolean
  loadingComponent?: React.ReactNode
}

export interface CreateCandidAdapterCotextParameters
  extends CandidAdapterParameters {
  withParser?: boolean
}

export interface CreateCandidAdapterContextReturnType {
  useCandidAdapter: () => CandidAdapter
  CandidAdapterProvider: React.FC<CandidAdapterProviderProps>
}
