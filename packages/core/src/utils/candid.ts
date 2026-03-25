import {
  CandidVariant,
  CandidVariantKey,
  CandidVariantValue,
  CandidKeyValue,
} from "../types"

const VARIANT_DISCRIMINATOR = "_type"

function extractVariantDetails<T extends Record<string, any>>(
  variant: T
): CandidKeyValue<T> {
  const keys = Object.keys(variant)

  if (
    VARIANT_DISCRIMINATOR in variant &&
    typeof variant[VARIANT_DISCRIMINATOR] === "string"
  ) {
    const key = variant[VARIANT_DISCRIMINATOR] as CandidKeyValue<T>[0]
    const payloadKeys = keys.filter((item) => item !== VARIANT_DISCRIMINATOR)

    if (payloadKeys.length > 1) {
      throw new Error(
        `Invalid variant: must have at most one payload key when using ${VARIANT_DISCRIMINATOR}, found ${payloadKeys}`
      )
    }

    if (payloadKeys.length === 1 && payloadKeys[0] !== key) {
      throw new Error(
        `Invalid variant: discriminator ${VARIANT_DISCRIMINATOR}=${key} does not match payload key ${payloadKeys[0]}`
      )
    }

    const value = (key in variant ? variant[key] : null) as CandidKeyValue<T>[1]

    return [key, value] as CandidKeyValue<T>
  }

  if (keys.length !== 1) {
    const msg = `Invalid variant: must have exactly one key but found ${keys.length} keys: ${keys}`
    throw new Error(msg)
  }

  const key = keys[0] as CandidKeyValue<T>[0]
  const value = variant[key] as CandidKeyValue<T>[1]

  return [key, value] as CandidKeyValue<T>
}

/**
 * Creates a Candid variant from a string value.
 * @param str - The string to convert into a variant
 * @returns An object representing the Candid variant
 */
export function createNullVariant<T extends string>(str: T): Record<T, null> {
  return { [str]: null } as Record<T, null>
}

/**
 * Creates a Candid variant from a record.
 * @param variant - The record to convert into a variant
 * @returns An object representing the Candid variant
 */
export function createVariant<T extends Record<string, any>>(
  variant: T
): CandidVariant<T> {
  const keys = Object.keys(variant)
  if (keys.length !== 1) {
    throw new Error(`
      Invalid variant: must have exactly one key but found ${keys.length} keys: ${keys.map(
        (key) => `${key}: ${variant[key]}`
      )}
    `)
  }
  const key = keys[0] as keyof T
  const value = variant[key]

  return {
    _type: key,
    ...(value !== null ? { [key]: value } : {}),
  } as CandidVariant<T>
}

/**
 * Extract variant key and value from a variant type
 * Works with types like:
 * type User = { 'Business': BusinessUser } | { 'Individual': IndividualUser }
 * Also supports display variants shaped like:
 * { _type: "Business", Business: value } or { _type: "Individual" }
 *
 * @template T - The variant type
 * @returns A tuple containing the key and value of the variant
 * @throws Error if the variant object is malformed
 */
export function getVariantKeyValue<T extends Record<string, any>>(
  variant: T
): CandidKeyValue<T> {
  return extractVariantDetails(variant)
}

/**
 * Extracts the key from a Candid variant type.
 * Supports both raw Candid variants ({ Ok: value }) and display variants
 * ({ _type: "Ok", Ok: value }).
 * @param variant - The variant object
 * @returns The key of the variant
 */
export function getVariantKey<T extends Record<string, any>>(
  variant: T
): CandidVariantKey<T> {
  return extractVariantDetails(variant)[0] as CandidVariantKey<T>
}

/**
 * Extracts the value from a Candid variant type.
 * Supports both raw Candid variants and display variants.
 * @param variant - The variant object
 * @returns The value associated with the variant's key
 */
export function getVariantValue<
  T extends Record<string, any>,
  K extends CandidVariantKey<T> = CandidVariantKey<T>,
>(variant: T): CandidVariantValue<T, K> {
  return getVariantKeyValue(variant)[1] as CandidVariantValue<T, K>
}

export function getVariantValueByKey<
  T extends Record<string, any>,
  K extends CandidVariantKey<T>,
>(variant: T, key: K): CandidVariantValue<T, K> {
  const [actualKey, value] = getVariantKeyValue(variant)

  if (actualKey !== key) {
    throw new Error(`Variant key mismatch: expected ${key}, got ${actualKey}`)
  }

  return value as CandidVariantValue<T, K>
}

export function isKeyMatchVariant<
  T extends Record<string, any>,
  K extends CandidVariantKey<T>,
>(variant: T, key: K): variant is T & Record<K, unknown> {
  return getVariantKey(variant) === key
}
