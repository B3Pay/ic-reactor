import type { PropsWithChildren } from "react"
import type { IDL } from "@dfinity/candid"
import { CandidAdapter } from "@ic-reactor/core/dist/classes"
import { CandidAdapterParameters } from "../../types"

export type CandidAdapterContextType = CandidAdapter

export interface CandidAdapterProviderProps
  extends PropsWithChildren,
    CandidAdapterParameters {
  withParser?: boolean
  loadingComponent?: React.ReactNode
}

export interface CreateCandidAdapterContextParameters
  extends CandidAdapterParameters {
  withParser?: boolean
}

export interface UseCandidEvaluationReturnType {
  fetchError: string | null
  fetching: boolean
  validateCandid: (candidString: string) => boolean | undefined
  evaluateCandid: (
    candidString: string
  ) => Promise<IDL.InterfaceFactory | undefined>
}

export interface CreateCandidAdapterContextReturnType {
  CandidAdapterContext: React.Context<CandidAdapterContextType | null>
  CandidAdapterProvider: React.FC<CandidAdapterProviderProps>
  useCandidEvaluation: () => UseCandidEvaluationReturnType
  useCandidAdapter: () => CandidAdapter
}
