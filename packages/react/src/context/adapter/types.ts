import type { PropsWithChildren } from "react"
import type { CandidAdapterParameters } from "../../types"
import type { CandidAdapter } from "@ic-reactor/core/dist/classes"

export type { CandidAdapter }

export interface CandidAdapterContextType extends CandidAdapter {}

export interface CandidAdapterProviderProps
  extends PropsWithChildren,
    CandidAdapterParameters {
  withParser?: boolean
  loadingComponent?: React.ReactNode
}
