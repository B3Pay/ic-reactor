import { hash } from "@dfinity/agent"
import { IDL, toHexString } from "@dfinity/candid"
import { devtools } from "zustand/middleware"
import { createStore } from "zustand/vanilla"
import { ExtractField } from "./actor/candid"

import type { ActorSubclass, ActorMethodField } from "./actor/types"

interface StoreOptions {
  withDevtools?: boolean
  store: string
}

export function createStoreWithOptionalDevtools(
  initialState: any,
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

export function extractMethodField<A extends ActorSubclass<any>>(
  idlFactory: IDL.InterfaceFactory
): ActorMethodField<A>[] {
  type M = keyof A & string
  const methods = idlFactory({ IDL })._fields as [M, IDL.FuncClass][]

  const allFunction = methods.map(([functionName, method]) => {
    const field = method.accept(new ExtractField(), functionName)
    return {
      ...field,
      functionName,
    }
  })

  return allFunction
}

export const generateRequestHash = (args?: any[]) => {
  const serializedArgs = args
    ?.map((arg) => {
      if (typeof arg === "bigint") {
        return arg.toString()
      }

      return JSON.stringify(arg)
    })
    .join("|")

  const hashBytes = hash(new TextEncoder().encode(serializedArgs ?? ""))
  return toHexString(hashBytes)
}
