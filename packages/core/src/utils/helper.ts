import { sha256 } from "@noble/hashes/sha2"
import { bytesToHex } from "@noble/hashes/utils"
import {
  DevtoolsOptions,
  devtools,
  subscribeWithSelector,
} from "zustand/middleware"
import { createStore, StateCreator } from "zustand"
import type {
  CompiledResult,
  BaseActor,
  CandidDefenition,
  IDL,
  ExtractOk,
  StoreWithAllMiddleware,
  WithSubscribeSelector,
  WithDevtools,
} from "../types"
import { createSimpleHash } from "./hash"
import { LOCAL_HOSTS, REMOTE_HOSTS } from "./constants"

/**
 * Creates a Zustand store with optional DevTools middleware.
 *
 * @param initialState - The initial state of the store.
 * @param config - Configuration options for DevTools.
 * @returns A Zustand store with DevTools enabled if configured, otherwise a standard store.
 */
export function createStoreWithOptionalDevtools<T extends object>(
  initialState: T,
  config: DevtoolsOptions & { withDevtools?: boolean }
): StoreWithAllMiddleware<T> {
  const createState: StateCreator<T> = () => initialState

  return createStore<T, [WithSubscribeSelector, WithDevtools]>(
    subscribeWithSelector(
      devtools(createState, {
        enabled: !!config.withDevtools,
        serialize: {
          replacer: (_: string, value: unknown) =>
            typeof value === "bigint" ? value.toString() : value,
        },
        ...config,
      })
    )
  )
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

/**
 * Checks if the current environment is local or development.
 *
 * @returns `true` if running in a local or development environment, otherwise `false`.
 */
export const isInLocalOrDevelopment = () => {
  return typeof process !== "undefined" && process.env.DFX_NETWORK === "local"
}

/**
 * Retrieves the network from the process environment variables.
 *
 * @returns The network name, defaulting to "ic" if not specified.
 */
export const getProcessEnvNetwork = () => {
  if (typeof process === "undefined") return "ic"
  else return process.env.DFX_NETWORK ?? "ic"
}

/**
 * Determines the network type based on the provided hostname.
 *
 * @param hostname - The hostname to evaluate.
 * @returns A string indicating the network type: "local", "remote", or "ic".
 */
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

/**
 * Checks if a given IDL function is a query.
 *
 * @param func - The IDL function to check.
 * @returns `true` if the function is a query or composite query, otherwise `false`.
 */
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

export const stringToHash = (str: string): `0x${string}` => {
  const hashBytes = sha256(str)
  return `0x${bytesToHex(hashBytes)}`
}

/**
 * Helper function for extracting the value from a compiled result { Ok: T } or { Err: E }
 *
 * @param result - The compiled result to extract from.
 * @returns A `CompiledResult` object indicating success or failure.
 */
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

/**
 * Helper function for extracting the value from a compiled result { Ok: T } or throw the error if { Err: E }
 *
 * @param result - The compiled result to extract from.
 * @returns The extracted value from the compiled result.
 * @throws The error from the compiled result.
 */
export function extractOkResult<T>(result: T): ExtractOk<T> {
  const compiledResult = createCompiledResult(result)
  if (compiledResult.isErr) {
    throw compiledResult.error
  }

  return compiledResult.value as ExtractOk<T>
}
