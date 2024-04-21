import {
  GOVERNANCE_TEST,
  SETTING_TEST,
  STATUS_TEST,
  WALLET_TEST,
} from "./constants"

import type {
  AllReturnTypes,
  IDL,
  FunctionCategory,
  OptionalReturns,
} from "./types"

export const isFieldInTable = (field: AllReturnTypes<IDL.Type>): boolean => {
  if (field.type === "optional") {
    return isFieldInTable((field as OptionalReturns).field)
  }

  return !["record", "tuple", "vector"].includes(field.type)
}

export const findCategory = (name: string): FunctionCategory => {
  const categories = [
    { name: "home", test: [] },
    {
      name: "wallet",
      test: WALLET_TEST,
    },
    {
      name: "status",
      test: STATUS_TEST,
    },
    {
      name: "setting",
      test: SETTING_TEST,
    },
    { name: "governance", test: GOVERNANCE_TEST },
  ]
  const category = categories.find((c) =>
    c.test.some((t) => name.toLowerCase().includes(t))
  )?.name as FunctionCategory
  return category || "home"
}

export const extractAndSortArgs = <T extends Record<string, unknown>>(
  argsObject: T
): Array<T[keyof T]> => {
  if (!argsObject || typeof argsObject !== "object") return []

  const args: Array<T[keyof T]> = []
  let index = 0

  while (Object.prototype.hasOwnProperty.call(argsObject, `arg${index}`)) {
    args.push(argsObject[`arg${index}`] as T[keyof T])
    index++
  }

  return args
}

export const convertNanoToDate = (nano: bigint) => {
  return new Date(Number(nano) / 1000000)
}

export const convertToCycle = (cycles: bigint) => {
  const mcycles = cycles / BigInt(1_000_000)
  if (mcycles >= BigInt(1_000_000)) {
    const tcycles = mcycles / BigInt(1_000_000)
    return `${tcycles.toLocaleString()} T`
  }
  return `${mcycles.toLocaleString()} M`
}

export const convertStringToNumber = (value: string) => {
  const bits = value.length
  if (bits >= 16) {
    return BigInt(value)
  } else {
    return Number(value)
  }
}

export const validateNumberError = (t: IDL.Type) => {
  return function validate(value: string) {
    if (value === "") {
      return true
    }

    const bits = value.length
    if (bits >= 16) {
      try {
        const valueAsBigInt = BigInt(value)
        t.covariant(valueAsBigInt)
        return true
      } catch (error) {
        return (error as Error).message || "Failed to convert to BigInt"
      }
    } else {
      try {
        const valueAsNumber = Number(value)
        t.covariant(valueAsNumber)
        return true
      } catch (error) {
        return (error as Error).message || "Failed to convert to number"
      }
    }
  }
}

export const validateError = (t: IDL.Type) => {
  return function validate(value: unknown) {
    try {
      t.covariant(value)
      return true
    } catch (error) {
      return (error as Error).message || "An error occurred"
    }
  }
}

export function isQuery(func: IDL.FuncClass): boolean {
  return (
    func.annotations.includes("query") ||
    func.annotations.includes("composite_query")
  )
}

export function isUrl(str: string): boolean {
  if (typeof str !== "string") return false
  return str.startsWith("http") || str.startsWith("https")
}

export function isImage(str: string): boolean {
  if (typeof str !== "string") return false
  // Check if the string starts with 'data:image' (indicating base64-encoded image)
  if (str.startsWith("data:image")) {
    return true
  }

  // List of common image file extensions
  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".svg"]

  // Check if the string ends with any of the image extensions (indicating image URL)
  if (imageExtensions.some((ext) => str.endsWith(ext))) {
    return true
  }

  return false
}
