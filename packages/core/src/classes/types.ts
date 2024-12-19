export * from "./agent/types"
export * from "./actor/types"
export * from "./adapter/types"

import type { NamedSet } from "zustand/middleware"
import type { StoreApi } from "zustand"

export interface StoreApiWithDevtools<T> extends StoreApi<T> {
  setState: NamedSet<T>
}
