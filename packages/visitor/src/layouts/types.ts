import type { BaseActor, FunctionName } from "@ic-reactor/core/dist/types"
import { FunctionCategory } from "../types"

export interface GridLayout<A = BaseActor> {
  i: FunctionName<A>
  x: number
  y: number
  w: number
  h: number
  minH?: number
  minW?: number
}

export interface GridLayouts<A = BaseActor> {
  [key: string]: GridLayout<A>[]
}

export type ServiceLayouts<A = BaseActor> = {
  [K in FunctionCategory]: GridLayouts<A>
}
