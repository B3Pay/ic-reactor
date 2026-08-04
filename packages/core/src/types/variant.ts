export type IsCandidVariant<T> = [T] extends [CandidVariantToIntersection<T>]
  ? false
  : true

export type CandidVariantToIntersection<U> = (
  U extends object ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never

/**
 * The selectable keys of a variant.
 *
 * Display variants carry a `_type` discriminant alongside a payload key. A
 * null-payload arm has no payload key at all (`{ _type: "Pending" }`), so the
 * discriminant value is the only key that identifies it — `CandidVariantValue`
 * already resolves such a key to `null`.
 */
export type CandidVariantKey<T> = T extends any
  ? | Exclude<keyof T, "_type">
    // Only a *literal* discriminant names an arm. When `_type` is the wide
    // `string` (an unresolved or hand-written shape), folding it in would
    // collapse the whole key union to `string` and every key/value helper
    // would stop type-checking its argument.
    | (T extends { _type: infer D extends string }
        ? string extends D
          ? never
          : D
        : never)
  : never

export type CandidVariantValue<T, K extends CandidVariantKey<T>> =
  T extends Record<K, infer U> ? U : T extends { _type: K } ? null : never

export type CandidVariant<T> =
  IsCandidVariant<T> extends true
    ? {
        _type: CandidVariantKey<T> & string
      } & {
        [
          K in CandidVariantKey<T> & string as CandidVariantValue<
            T,
            K
          > extends null
            ? never
            : K
        ]: CandidVariantValue<T, K>
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
