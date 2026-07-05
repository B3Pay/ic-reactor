import type { CandidMetadata } from "./parser-types.js"
import metadataRules from "./metadata-rules.json"

export type JSDocFormatDefinition = {
  regex?: string
  errorMessage?: string
  jsonSchemaFormat?: string
  contentEncoding?: string
}

export type CustomJSDocFormatTypes = Record<
  string,
  string | JSDocFormatDefinition
>

type ValidationBoundRule = {
  template?: string
}

type MetadataRulesFile = {
  defaultValidationMessages?: Record<string, ValidationBoundRule>
}

const metadataRulesFile = metadataRules as MetadataRulesFile
const defaultValidationMessages =
  metadataRulesFile.defaultValidationMessages ?? {}

const rawRuleEntries = Object.entries(metadataRules).filter(
  ([type]) => type !== "defaultValidationMessages"
) as Array<
  [
    string,
    {
      helper?: string
      regex?: string
      jsonSchemaFormat?: string
      contentEncoding?: string
      errorMessage?: string
    },
  ]
>

export const BUILT_IN_JSDOC_FORMAT_TYPES: Readonly<
  Record<string, JSDocFormatDefinition>
> = Object.fromEntries(
  rawRuleEntries.map(([type, rule]) => [
    type,
    {
      regex: rule.regex,
      jsonSchemaFormat: rule.jsonSchemaFormat,
      contentEncoding: rule.contentEncoding,
      errorMessage: rule.errorMessage,
    },
  ])
) as Record<string, JSDocFormatDefinition>

export const BUILT_IN_FORMAT_HELPERS: Readonly<Record<string, string>> =
  Object.fromEntries(
    rawRuleEntries
      .filter(([, rule]) => rule.helper)
      .map(([type, rule]) => [type, rule.helper as string])
  )

export interface FormatResolutionOptions {
  customJSDocFormatTypes?: CustomJSDocFormatTypes
}

export function normalizeFormatDefinition(
  definition: CustomJSDocFormatTypes[string] | undefined
): JSDocFormatDefinition | undefined {
  if (!definition) return undefined
  return typeof definition === "string" ? { regex: definition } : definition
}

export function formatDefinitionFor(
  type: string,
  options: FormatResolutionOptions
): JSDocFormatDefinition | undefined {
  const builtIn = BUILT_IN_JSDOC_FORMAT_TYPES[type]
  const custom = normalizeFormatDefinition(
    options.customJSDocFormatTypes?.[type]
  )

  if (!custom) return builtIn
  return {
    ...builtIn,
    ...custom,
    errorMessage: custom.errorMessage ?? builtIn?.errorMessage,
  }
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  ) as T
}

function defaultBoundMessage(
  kind: "minimum" | "maximum" | "minLength" | "maxLength",
  value: string
): string {
  const template =
    defaultValidationMessages[kind]?.template ??
    (kind === "minimum"
      ? "Must be at least {value}"
      : kind === "maximum"
        ? "Must be at most {value}"
        : kind === "minLength"
          ? "Must be at least {value} character{plural}"
          : "Must be at most {value} character{plural}")

  return template
    .replace("{value}", value)
    .replace("{plural}", value === "1" ? "" : "s")
}

function withDefaultBoundMessage<
  T extends { value: string; message?: string } | undefined,
>(bound: T, kind: "minimum" | "maximum" | "minLength" | "maxLength"): T {
  if (!bound || bound.message !== undefined) return bound
  return {
    ...bound,
    message: defaultBoundMessage(kind, bound.value),
  } as T
}

export function normalizeValidationMetadata(
  validation: NonNullable<CandidMetadata["validation"]>,
  options: FormatResolutionOptions
): NonNullable<CandidMetadata["validation"]> {
  const normalized = {
    ...validation,
    minimum: withDefaultBoundMessage(validation.minimum, "minimum"),
    maximum: withDefaultBoundMessage(validation.maximum, "maximum"),
    minLength: withDefaultBoundMessage(validation.minLength, "minLength"),
    maxLength: withDefaultBoundMessage(validation.maxLength, "maxLength"),
  }

  const format = validation.format
  const formatDefinition = format
    ? formatDefinitionFor(format.type, options)
    : undefined

  if (format && formatDefinition) {
    normalized.format = stripUndefined({
      ...format,
      regex: formatDefinition.regex,
      jsonSchemaFormat: formatDefinition.jsonSchemaFormat,
      contentEncoding: formatDefinition.contentEncoding,
      errorMessage: format.message ?? formatDefinition.errorMessage,
    })
  } else if (format) {
    normalized.format = format
  }

  return normalized
}
