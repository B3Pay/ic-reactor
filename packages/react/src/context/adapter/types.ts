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
  /**
   * The error message encountered during the fetch operation, or `null` if no error occurred.
   */
  fetchError: string | null

  /**
   * @deprecated Use `isFetching` instead.
   * Indicates whether a fetch operation is currently in progress.
   */
  fetching: boolean

  /**
   * Indicates whether a fetch operation is currently in progress.
   */
  isFetching: boolean

  /**
   * @deprecated Use `isCandidValid` instead.
   * Validates the provided Candid interface definition string.
   * @param candidString - The Candid definition to validate.
   * @returns `true` if the string is valid, `false` otherwise.
   */
  validateCandid: (candidString: string) => boolean | undefined

  /**
   * Validates the provided Candid interface definition string.
   * @param candidString - The Candid definition to validate.
   * @returns `true` if valid, `false` otherwise.
   */
  isCandidValid: (candidString: string) => boolean | undefined

  /**
   * Evaluates the provided Candid interface definition string.
   * @param candidString - The Candid definition to evaluate.
   * @returns A promise resolving to the corresponding InterfaceFactory if the evaluation succeeds, otherwise `undefined`.
   */
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
