type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (
  x: infer I
) => void
  ? I
  : never

// The "Last" type extracts the last member of a union type
type Last<T> =
  UnionToIntersection<T extends any ? (x: T) => void : never> extends (
    x: infer L
  ) => void
    ? L
    : never

/// Convert a union type to a tuple type (order is not guaranteed)
/// (Note: there are several variants of this trick – choose one that suits your needs.)
export type UnionToTuple<T, L = Last<T>> = [T] extends [never]
  ? []
  : [...UnionToTuple<Exclude<T, L>>, L]

export type IsBlobType<T> = T extends Uint8Array
  ? true
  : T extends number[]
    ? number[] extends T
      ? true
      : false
    : false

export type IsOptionalType<T> = [T] extends [[] | [any]] ? true : false
