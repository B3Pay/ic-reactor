export type IsCandidVariant<T> = [T] extends [CandidVariantToIntersection<T>]
  ? false
  : true

export type CandidVariantToIntersection<U> = (
  U extends object ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never

export type CandidVariantKey<T> = T extends any
  ? Exclude<keyof T, "_type">
  : never

export type CandidVariantValue<T, K extends CandidVariantKey<T>> =
  T extends Record<K, infer U> ? U : T extends { _type: K } ? null : never

export type CandidVariant<T> =
  IsCandidVariant<T> extends true
    ? {
        _type: CandidVariantKey<T> & string
      } & {
        [K in CandidVariantKey<T> & string as CandidVariantValue<
          T,
          K
        > extends null
          ? never
          : K]: CandidVariantValue<T, K>
      }
    : T

/**
 * A type that represents the extracted key and value from a variant
 * Designed to be used with the extractVariant function
 */
export type CandidKeyValue<T> = T extends infer U
  ? [
      CandidVariantKey<U> & string,
      CandidVariantValue<U, CandidVariantKey<U> & string>,
    ]
  : never
