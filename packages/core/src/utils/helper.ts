import { hash } from "@dfinity/agent"
import { DevtoolsOptions, devtools } from "zustand/middleware"
import { createStore } from "zustand/vanilla"
import type { BaseActor, IDL } from "../types"

export function createStoreWithOptionalDevtools<T>(
  initialState: T,
  config: DevtoolsOptions
) {
  if (config.withDevtools) {
    return createStore(
      devtools(() => initialState, {
        serialize: {
          replacer: (_: string, value: unknown) =>
            typeof value === "bigint" ? value.toString() : value,
        },
        ...config,
      })
    )
  } else {
    return createStore(() => initialState)
  }
}

export const isInLocalOrDevelopment = () => {
  return (
    typeof process !== "undefined" &&
    (process.env.DFX_NETWORK === "local" ||
      process.env.NODE_ENV === "development")
  )
}

export function isQuery(func: IDL.FuncClass): boolean {
  return (
    func.annotations.includes("query") ||
    func.annotations.includes("composite_query")
  )
}

export const jsonToString = (json: unknown, space = 2) => {
  return JSON.stringify(
    json,
    (_, value) => (typeof value === "bigint" ? `BigInt(${value})` : value),
    space
  )
}

export const generateRequestHash = (args: unknown[] = []) => {
  const serializedArgs = args
    .map((arg) => {
      if (typeof arg === "bigint") {
        return arg.toString()
      }

      return JSON.stringify(arg)
    })
    .join("|")

  return stringToHash(serializedArgs ?? "")
}

export const generateHash = (field?: unknown) => {
  const serializedArgs = JSON.stringify(field)
  return stringToHash(serializedArgs ?? "")
}

export const generateActorHash = (actor: BaseActor) => {
  const serializedArgs = JSON.stringify(actor)
  return stringToHash(serializedArgs ?? "")
}

export const stringToHash = (str: string) => {
  const hashBytes = hash(new TextEncoder().encode(str))
  return `0x${toHexString(hashBytes)}` as `0x${string}`
}

function toHexString(bytes: ArrayBuffer) {
  return new Uint8Array(bytes).reduce(
    (str, byte) => str + byte.toString(16).padStart(2, "0"),
    ""
  )
}
