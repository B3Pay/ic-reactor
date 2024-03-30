import { MethodResult } from "./types"

export const isValueInTable = (value: MethodResult): boolean => {
  if (value.type === "optional" && value.value) {
    return isValueInTable(value.value)
  }

  return !["record", "tuple", "vector"].includes(value.type)
}
