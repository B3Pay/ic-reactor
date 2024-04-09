import type { IDL } from "@ic-reactor/core/dist/types"
import type { AllReturnTypes, OptionalReturns } from "./types"

export const isFieldInTable = (field: AllReturnTypes<IDL.Type>): boolean => {
  if (field.type === "optional") {
    return isFieldInTable((field as OptionalReturns).field)
  }

  return !["record", "tuple", "vector"].includes(field.type)
}
