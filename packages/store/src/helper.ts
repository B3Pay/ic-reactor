import { hash } from "@dfinity/agent"
import { toHexString } from "@dfinity/candid"
import { devtools } from "zustand/middleware"
import { createStore } from "zustand/vanilla"
import { BaseActor } from "./actor"

interface StoreOptions {
  withDevtools?: boolean
  store: string
}

export function createStoreWithOptionalDevtools<T>(
  initialState: T,
  options: StoreOptions
) {
  if (options.withDevtools) {
    return createStore(
      devtools(() => initialState, {
        name: "ReActor",
        store: options.store,
      })
    )
  } else {
    return createStore(() => initialState)
  }
}

export function jsonToString(json: unknown) {
  return JSON.stringify(
    json,
    (_, value) => (typeof value === "bigint" ? `BigInt(${value})` : value),
    2
  )
}

export const generateRequestHash = (args?: unknown[]) => {
  const serializedArgs = args
    ?.map((arg) => {
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
