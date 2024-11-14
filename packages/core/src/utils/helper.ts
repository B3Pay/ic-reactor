import { hash, toHex } from "@dfinity/agent"
import { DevtoolsOptions, devtools } from "zustand/middleware"
import { createStore } from "zustand/vanilla"

import type { CompiledResult, BaseActor, CandidDefenition, IDL } from "../types"
import { createSimpleHash } from "./hash"
import { LOCAL_HOSTS, REMOTE_HOSTS } from "./constants"

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

export const importCandidDefinition = async (
  candidDef: string
): Promise<CandidDefenition> => {
  if (typeof window === "undefined") {
    // Node.js environment
    try {
      const loaderFunction = new Function(`
        return import("data:text/javascript;charset=utf-8, ${encodeURIComponent(
          candidDef
        )}")
      `)

      return loaderFunction()
    } catch (error) {
      throw new Error(`Error importing candid definition in NodeJs: ${error}`)
    }
  } else {
    // Browser environment
    try {
      const loaderFunction = new Function(`
        const blob = new Blob([\`${candidDef}\`], { type: "application/javascript" })
        const url = URL.createObjectURL(blob)
        return import(url)
      `)

      return loaderFunction()
    } catch (error) {
      throw new Error(`Error importing candid definition: ${error}`)
    }
  }
}

export const isInLocalOrDevelopment = () => {
  return typeof process !== "undefined" && process.env.DFX_NETWORK === "local"
}

export const getProcessEnvNetwork = () => {
  if (typeof process === "undefined") return "ic"
  else return process.env.DFX_NETWORK ?? "ic"
}

export function getNetworkByHostname(
  hostname: string
): "local" | "remote" | "ic" {
  if (LOCAL_HOSTS.some((host) => hostname.endsWith(host))) {
    return "local"
  } else if (REMOTE_HOSTS.some((host) => hostname.endsWith(host))) {
    return "remote"
  } else {
    return "ic"
  }
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

export const generateRequestHash = (args: unknown[] = []): `0x${string}` => {
  const serializedArgs = createSimpleHash(args)

  return `0x${serializedArgs}`
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
  return toHex(bytes)
}

/// Helper function for extracting the value from a compiled result { Ok: T } or { Err: E }
export function createCompiledResult<T>(result: T): CompiledResult<T> {
  if (result && typeof result === "object" && "Ok" in result) {
    return {
      isOk: true,
      isErr: false,
      value: (result as { Ok: unknown }).Ok,
      error: null,
    } as CompiledResult<T>
  } else if (result && typeof result === "object" && "Err" in result) {
    return {
      isOk: false,
      isErr: true,
      value: null,
      error: (result as { Err: unknown }).Err,
    } as CompiledResult<T>
  } else {
    // For non-Result types
    return {
      isOk: false,
      isErr: false,
      value: undefined,
      error: null,
    } as never
  }
}
