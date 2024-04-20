import React from "react"
import { CandidAdapterContextType } from "./types"

/**
 * Adapter context for the Candid adapter.
 */
const CandidAdapterContext =
  React.createContext<CandidAdapterContextType | null>(null)

CandidAdapterContext.displayName = "CandidAdapterContext"

export { CandidAdapterContext }
