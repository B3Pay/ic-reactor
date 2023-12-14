import { Actor, hash } from "@dfinity/agent"
import { toHexString } from "@dfinity/candid"
import { FuncClass } from "@dfinity/candid/lib/cjs/idl"
import { devtools } from "zustand/middleware"
import { createStore } from "zustand/vanilla"
import { ActorSubclass, ReActorMethodStates } from "./types"

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

export function createMethodStates<A extends ActorSubclass<any>>(
  actor: A
): ReActorMethodStates<A> {
  const actorState = {} as ReActorMethodStates<A>
  const methods: [string, FuncClass][] = Actor.interfaceOf(
    actor as Actor
  )._fields

  for (const [method, types] of methods) {
    actorState[method as keyof A] = {
      types,
      states: {},
    }
  }

  return actorState
}

export const generateRequestHash = (args?: any[]) => {
  const serializedArgs = args
    ?.map((arg) => {
      if (typeof arg === "bigint") {
        return arg.toString()
      }
      // Add more conditions for other special types
      return JSON.stringify(arg)
    })
    .join("|")

  const hashBytes = hash(new TextEncoder().encode(serializedArgs ?? ""))
  return toHexString(hashBytes)
}
