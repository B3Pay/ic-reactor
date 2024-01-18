import { hash } from "@dfinity/agent"
import { IDL, toHexString } from "@dfinity/candid"
import { devtools } from "zustand/middleware"
import { createStore } from "zustand/vanilla"
import { ExtractField, ExtractedService } from "./actor/candid"

import type { ActorSubclass, CanisterId } from "./actor/types"

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

export function extractServiceField<A extends ActorSubclass<any>>(
  idlFactory: IDL.InterfaceFactory,
  name: CanisterId
): ExtractedService<A> {
  const canisterId = typeof name === "string" ? name : name.toString()
  const methods = idlFactory({ IDL })

  const extractor = new ExtractField<A>()

  return extractor.visitService(methods, canisterId)
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
