import type { FunctionCategory, BaseActor, FunctionName } from "../types"

export interface GridLayout<A = BaseActor> {
  i: FunctionName<A>
  x: number
  y: number
  w: number
  h: number
  minH?: number
  minW?: number
}

export interface GridLayoutRecord<A = BaseActor> {
  [key: string]: GridLayout<A>[]
}

export type ServiceLayout<A = BaseActor> = {
  [K in FunctionCategory]: GridLayoutRecord<A>
}
