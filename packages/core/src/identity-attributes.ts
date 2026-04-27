import { IDL } from "@icp-sdk/core/candid"

import type {
  IdentityAttributeOpenIdProvider,
  IdentityAttributeValues,
  SignedIdentityAttributes,
} from "./types/client"

export const IDENTITY_ATTRIBUTES_BETA_PROVIDER = "https://beta.id.ai/authorize"

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

  const decodedValues = decodeCandidAttributeValues(data, requestedKeyMap)
  if (Object.keys(decodedValues).length > 0) {
    return decodedValues
  }

  return extractPrintableAttributeValues(data, requestedKeys)
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
    const value = printableRuns.find(
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
