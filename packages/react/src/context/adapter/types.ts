import type { PropsWithChildren } from "react"
import type { CandidAdapterParameters, IDL } from "../../types"
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

export interface UseCandidEvaluationReturnType {
  fetchError: string | null
  fetching: boolean
  evaluateCandid: () => Promise<IDL.InterfaceFactory | undefined>
}

export interface CreateCandidAdapterContextReturnType {
  CandidAdapterContext: React.Context<CandidAdapterContextType | null>
  CandidAdapterProvider: React.FC<CandidAdapterProviderProps>
  useCandidEvaluation: (candidString: string) => UseCandidEvaluationReturnType
  useCandidAdapter: () => CandidAdapter
}
