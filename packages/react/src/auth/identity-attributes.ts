import { IDL } from "@icp-sdk/core/candid"

import type {
  IdentityAttributeOpenIdProvider,
  IdentityAttributeValues,
  SignedIdentityAttributes,
} from "./types.js"
import { IC_INTERNET_IDENTITY_PROVIDER } from "./constants.js"

export const IDENTITY_ATTRIBUTES_PROVIDER = IC_INTERNET_IDENTITY_PROVIDER

/**
 * @deprecated Use the default ClientManager identity provider or
 * `IDENTITY_ATTRIBUTES_PROVIDER` instead.
 */
export const IDENTITY_ATTRIBUTES_BETA_PROVIDER = IDENTITY_ATTRIBUTES_PROVIDER

const OPEN_ID_PROVIDER_URLS = {
  apple: "https://appleid.apple.com",
  google: "https://accounts.google.com",
  microsoft: "https://login.microsoftonline.com/{tid}/v2.0",
} as const

export function identityAttributeKeys({
  openIdProvider,
  keys,
}: {
  openIdProvider: IdentityAttributeOpenIdProvider
  keys: string[]
}): string[] {
  const provider = normalizeOpenIdProvider(openIdProvider)
  return keys.map((key) => `openid:${provider}:${key}`)
}

export function normalizeOpenIdProvider(
  openIdProvider: IdentityAttributeOpenIdProvider
): string {
  return (
    OPEN_ID_PROVIDER_URLS[
      openIdProvider as keyof typeof OPEN_ID_PROVIDER_URLS
    ] ?? openIdProvider
  )
}

export async function resolveIdentityAttributeKeys({
  openIdProvider,
  keys,
}: {
  openIdProvider: IdentityAttributeOpenIdProvider
  keys: string[]
}): Promise<string[]> {
  return identityAttributeKeys({ openIdProvider, keys })
}

export function decodeIdentityAttributeValues(
  data: Uint8Array,
  requestedKeys: string[]
): IdentityAttributeValues {
  const requestedKeyMap = requestedKeys.reduce<Record<string, string>>(
    (acc, key) => {
      acc[key] = identityAttributeDisplayKey(key)
      acc[identityAttributeDisplayKey(key)] = identityAttributeDisplayKey(key)
      return acc
    },
    {}
  )

  // Internet Identity's own format, read by its type. Once a message is known
  // to be one, a key it does not hold is absent: the text fallback below
  // cannot add anything true, only a neighbouring value under the wrong name.
  const icrc3Entries = decodeIcrc3AttributeMap(data)
  if (icrc3Entries) {
    return collectIcrc3TextValues(icrc3Entries, requestedKeyMap)
  }

  const decodedValues = decodeCandidAttributeValues(data, requestedKeyMap)
  if (Object.keys(decodedValues).length > 0) {
    return decodedValues
  }

  return extractPrintableAttributeValues(data, requestedKeys)
}

/** The ICRC-3 `Value` an Internet Identity attribute message is encoded as. */
type Icrc3Value =
  | { Nat: bigint }
  | { Int: bigint }
  | { Blob: Uint8Array | number[] }
  | { Text: string }
  | { Array: Icrc3Value[] }
  | { Map: Array<[string, Icrc3Value]> }

/**
 * The entries of an Internet Identity attribute message, or `undefined` when
 * `data` is not one.
 *
 * The canister certifies `Encode!(&Icrc3Value::Map(..))`: the requested
 * attributes under the keys they were requested by (bare, such as `email`, for
 * an unscoped request), plus `implicit:nonce`, `implicit:origin` and
 * `implicit:issued_at_timestamp_ns`. None of the shapes
 * {@link decodeCandidAttributeValues} tries match it, so without this every
 * real response was read by scraping printable text, which returned the
 * neighbouring length byte as part of a value, cut names at the first
 * non-ASCII character, and matched keys inside other values.
 *
 * @see https://github.com/dfinity/ICRC-1/blob/main/standards/ICRC-3/README.md
 */
function decodeIcrc3AttributeMap(
  data: Uint8Array
): Array<[string, Icrc3Value]> | undefined {
  const value = IDL.Rec()
  value.fill(
    IDL.Variant({
      Nat: IDL.Nat,
      Int: IDL.Int,
      Blob: IDL.Vec(IDL.Nat8),
      Text: IDL.Text,
      Array: IDL.Vec(value),
      Map: IDL.Vec(IDL.Tuple(IDL.Text, value)),
    })
  )

  try {
    const [decoded] = IDL.decode([value], data) as [Icrc3Value]
    return "Map" in decoded ? decoded.Map : undefined
  } catch {
    return undefined
  }
}

/**
 * The requested attributes in an ICRC-3 map, as certified.
 *
 * Only `Text` entries are attribute values; the `implicit:` entries are there
 * for the verifier and are returned only if asked for by name.
 */
function collectIcrc3TextValues(
  entries: Array<[string, Icrc3Value]>,
  requestedKeyMap: Record<string, string>
): IdentityAttributeValues {
  const values: IdentityAttributeValues = {}
  for (const [key, value] of entries) {
    if (!Object.prototype.hasOwnProperty.call(requestedKeyMap, key)) continue
    if ("Text" in value) {
      values[requestedKeyMap[key]] = value.Text
    }
  }
  return values
}

function decodeCandidAttributeValues(
  data: Uint8Array,
  requestedKeyMap: Record<string, string>
): IdentityAttributeValues {
  const textPairs = IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text))
  const recordPairs = IDL.Vec(
    IDL.Record({
      key: IDL.Text,
      value: IDL.Text,
    })
  )

  const candidates = [
    [textPairs],
    [recordPairs],
    [IDL.Record({ attributes: textPairs })],
    [IDL.Record({ values: textPairs })],
    [IDL.Record({ attributes: recordPairs })],
    [IDL.Record({ values: recordPairs })],
  ]

  for (const candidate of candidates) {
    try {
      const decoded = IDL.decode(candidate, data)
      const values = collectDecodedAttributeValues(decoded, requestedKeyMap)
      if (Object.keys(values).length > 0) {
        return values
      }
    } catch {
      // Try the next known beta payload shape, then fall back to text extraction.
    }
  }

  return {}
}

function collectDecodedAttributeValues(
  value: unknown,
  requestedKeyMap: Record<string, string>,
  activeKey?: string
): IdentityAttributeValues {
  const values: IdentityAttributeValues = {}

  if (typeof value === "string") {
    const displayKey = requestedKeyMap[value]
    if (displayKey) {
      return values
    }
    if (activeKey && isPrintableTextValue(value)) {
      values[activeKey] = value
    }
    return values
  }

  if (Array.isArray(value)) {
    if (value.length === 2 && typeof value[0] === "string") {
      const displayKey = requestedKeyMap[value[0]]
      if (
        displayKey &&
        typeof value[1] === "string" &&
        isPrintableTextValue(value[1])
      ) {
        values[displayKey] = value[1]
        return values
      }
    }

    for (const item of value) {
      Object.assign(
        values,
        collectDecodedAttributeValues(item, requestedKeyMap, activeKey)
      )
    }
    return values
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    if (typeof record.key === "string" && typeof record.value === "string") {
      const displayKey = requestedKeyMap[record.key]
      if (displayKey && isPrintableTextValue(record.value)) {
        values[displayKey] = record.value
        return values
      }
    }

    for (const [key, nested] of Object.entries(record)) {
      const displayKey = requestedKeyMap[key] ?? activeKey
      if (
        displayKey &&
        typeof nested === "string" &&
        isPrintableTextValue(nested)
      ) {
        values[displayKey] = nested
        continue
      }
      Object.assign(
        values,
        collectDecodedAttributeValues(nested, requestedKeyMap, displayKey)
      )
    }
  }

  return values
}

function extractPrintableAttributeValues(
  data: Uint8Array,
  requestedKeys: string[]
): IdentityAttributeValues {
  const text = new TextDecoder().decode(data)
  const values: IdentityAttributeValues = {}

  for (const requestedKey of requestedKeys) {
    const start = text.indexOf(requestedKey)
    if (start === -1) {
      continue
    }

    const tail = text.slice(start + requestedKey.length)
    const printableRuns = tail.match(/[\x20-\x7E]{2,512}/g) ?? []
    const value = printableRuns
      .map((candidate) =>
        cleanPrintableAttributeValue(candidate, requestedKeys)
      )
      .find(
        (candidate) =>
          isPrintableTextValue(candidate) &&
          candidate !== requestedKey &&
          !candidate.startsWith("openid:")
      )

    if (value) {
      values[identityAttributeDisplayKey(requestedKey)] = value.trim()
    }
  }

  return values
}

function cleanPrintableAttributeValue(
  value: string,
  requestedKeys: string[]
): string {
  let cleaned = value

  for (const requestedKey of requestedKeys) {
    const nextKeyIndex = cleaned.indexOf(requestedKey)
    if (nextKeyIndex > 0) {
      cleaned = cleaned.slice(
        0,
        trimCandidTextLengthPrefix(cleaned, nextKeyIndex)
      )
    }
  }

  const nextOpenIdKeyIndex = cleaned.indexOf("openid:")
  if (nextOpenIdKeyIndex > 0) {
    cleaned = cleaned.slice(
      0,
      trimCandidTextLengthPrefix(cleaned, nextOpenIdKeyIndex)
    )
  }

  return cleaned.trim()
}

function trimCandidTextLengthPrefix(value: string, index: number): number {
  let trimmedIndex = index
  while (trimmedIndex > 0 && isAsciiDigit(value.charCodeAt(trimmedIndex - 1))) {
    trimmedIndex -= 1
  }
  return trimmedIndex
}

function isAsciiDigit(charCode: number): boolean {
  return charCode >= 48 && charCode <= 57
}

function identityAttributeDisplayKey(key: string): string {
  return key.split(":").pop() || key
}

function isPrintableTextValue(value: string): boolean {
  return value.length > 0 && value.length <= 512 && /^[\x20-\x7E]+$/.test(value)
}

export function normalizeSignedIdentityAttributes(
  attributes: SignedIdentityAttributes
): SignedIdentityAttributes {
  return {
    data: new Uint8Array(attributes.data),
    signature: new Uint8Array(attributes.signature),
  }
}
