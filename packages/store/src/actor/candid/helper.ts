import { IDL } from "@dfinity/candid"

export const extractAndSortArgs = <T extends Record<string, unknown>>(
  argsObject: T
): Array<T[keyof T]> => {
  if (!argsObject || typeof argsObject !== "object") return []

  const args: Array<T[keyof T]> = []
  let index = 0

  while (argsObject.hasOwnProperty(`arg${index}`)) {
    args.push(argsObject[`arg${index}`] as T[keyof T])
    index++
  }

  return args
}

export const validateError = (t: IDL.Type<any>) => {
  return function validate(value: any) {
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
  return str.startsWith("http") || str.startsWith("https")
}

export function isImage(str: string): boolean {
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
