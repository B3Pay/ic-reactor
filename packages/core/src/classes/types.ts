// Re-export existing types
export * from "./agent/types"
export * from "./actor/types"
export * from "./adapter/types"

import {
  type StateCreator,
  type StoreApi,
  type StoreMutatorIdentifier,
  type Mutate,
} from "zustand"

// Helper type for creating store with multiple middleware
export type StoreWithMiddleware<
  T,
  Mis extends [StoreMutatorIdentifier, unknown][] = [],
  Mos extends [StoreMutatorIdentifier, unknown][] = []
> = StateCreator<T, Mis, Mos>

// Type for the final store API with middleware mutations
export type StoreApiWithMiddleware<
  T,
  Mos extends [StoreMutatorIdentifier, unknown][] = []
> = Mutate<StoreApi<T>, Mos>

export type WithDevtools = ["zustand/devtools", never]
export type WithSubscribeSelector = ["zustand/subscribeWithSelector", never]

export type StoreWithAllMiddleware<T> = StoreApiWithMiddleware<
  T,
  [WithDevtools, WithSubscribeSelector]
>
export type StoreWithSubscribeOnly<T> = StoreApiWithMiddleware<
  T,
  [WithSubscribeSelector]
>
