import type {
  CandidMetadata,
  CandidSchema,
  CandidType,
  CandidTypeDeclaration,
} from "@ic-reactor/parser"

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

export const BUILT_IN_JSDOC_FORMAT_TYPES: Readonly<
  Record<string, JSDocFormatDefinition>
> = {
  email: {
    regex: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
    jsonSchemaFormat: "email",
    errorMessage: "Must be a valid email address",
  },
  "date-time": {
    regex:
      "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z|[+-](?:[01]\\d|2[0-3]):[0-5]\\d))$",
    jsonSchemaFormat: "date-time",
    errorMessage: "Must be a valid ISO datetime",
  },
  datetime: {
    regex:
      "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z|[+-](?:[01]\\d|2[0-3]):[0-5]\\d))$",
    jsonSchemaFormat: "date-time",
    errorMessage: "Must be a valid ISO datetime",
  },
  date: {
    regex:
      "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$",
    jsonSchemaFormat: "date",
    errorMessage: "Must be a valid ISO date",
  },
  time: {
    regex: "^(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?$",
    errorMessage: "Must be a valid ISO time",
  },
  duration: {
    regex:
      "^P(?:(\\d+W)|(?!.*W)(?=\\d|T\\d)(\\d+Y)?(\\d+M)?(\\d+D)?(T(?=\\d)(\\d+H)?(\\d+M)?(\\d+([.,]\\d+)?S)?)?)$",
    jsonSchemaFormat: "duration",
    errorMessage: "Must be a valid ISO duration",
  },
  url: {
    regex: "^[a-zA-Z][a-zA-Z\\d+.-]*:.+",
    jsonSchemaFormat: "uri",
    errorMessage: "Must be a valid URL",
  },
  uri: {
    regex: "^[a-zA-Z][a-zA-Z\\d+.-]*:.+",
    jsonSchemaFormat: "uri",
    errorMessage: "Must be a valid URI",
  },
  httpsUrl: {
    regex: "^https://.+",
    jsonSchemaFormat: "uri",
    errorMessage: "Must be a valid HTTPS URL",
  },
  ipv4: {
    regex: "^(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)(?:\\.|$)){4}$",
    jsonSchemaFormat: "ipv4",
    errorMessage: "Must be a valid IPv4 address",
  },
  ipv6: {
    regex:
      "^((?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|::1|::|(?:[0-9A-Fa-f]{1,4}:){1,7}:|(?:[0-9A-Fa-f]{1,4}:){1,6}:[0-9A-Fa-f]{1,4}|(?:[0-9A-Fa-f]{1,4}:){1,5}(?::[0-9A-Fa-f]{1,4}){1,2}|(?:[0-9A-Fa-f]{1,4}:){1,4}(?::[0-9A-Fa-f]{1,4}){1,3}|(?:[0-9A-Fa-f]{1,4}:){1,3}(?::[0-9A-Fa-f]{1,4}){1,4}|(?:[0-9A-Fa-f]{1,4}:){1,2}(?::[0-9A-Fa-f]{1,4}){1,5}|[0-9A-Fa-f]{1,4}:(?:(?::[0-9A-Fa-f]{1,4}){1,6}))$",
    jsonSchemaFormat: "ipv6",
    errorMessage: "Must be a valid IPv6 address",
  },
  uuid: {
    regex:
      "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
    jsonSchemaFormat: "uuid",
    errorMessage: "Must be a valid UUID",
  },
  guid: {
    regex:
      "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
    jsonSchemaFormat: "uuid",
    errorMessage: "Must be a valid GUID",
  },
  base64: {
    regex: "^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$",
    contentEncoding: "base64",
    errorMessage: "Must be valid base64",
  },
  base64url: {
    regex: "^[A-Za-z0-9_-]+$",
    errorMessage: "Must be valid base64url",
  },
  cuid: {
    regex: "^c[a-z0-9]{24}$",
    errorMessage: "Must be a valid CUID",
  },
  cuid2: {
    regex: "^[a-z][a-z0-9]*$",
    errorMessage: "Must be a valid CUID2",
  },
  ulid: {
    regex: "^[0-9A-HJKMNP-TV-Z]{26}$",
    errorMessage: "Must be a valid ULID",
  },
  nanoid: {
    regex: "^[A-Za-z0-9_-]{21}$",
    errorMessage: "Must be a valid nanoid",
  },
  emoji: {
    regex: "^\\p{Extended_Pictographic}+$",
    errorMessage: "Must contain only emoji characters",
  },
  cidrv4: {
    regex:
      "^(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)/(?:3[0-2]|[12]?\\d)$",
    errorMessage: "Must be a valid IPv4 CIDR range",
  },
  cidrv6: {
    regex: "^[0-9A-Fa-f:]+/(?:12[0-8]|1[01]\\d|\\d?\\d)$",
    errorMessage: "Must be a valid IPv6 CIDR range",
  },
  mac: {
    regex: "^(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$",
    errorMessage: "Must be a valid MAC address",
  },
}

export interface GenerateCodecDeclarationsOptions {
  /**
   * Canister name used to derive the service export name.
   * Converted to SCREAMING_SNAKE_CASE (e.g. `"my-backend"` → `MY_BACKEND`).
   * Ignored when `serviceExportName` is set explicitly.
   */
  canisterName?: string
  /** Explicit service export name. Takes priority over `canisterName`. */
  serviceExportName?: string
  customJSDocFormatTypes?: CustomJSDocFormatTypes
  includeCompatibilityExports?: boolean
}

const BUILT_IN_FORMAT_HELPERS: Readonly<Record<string, string>> = {
  email: "email",
  "date-time": "dateTime",
  datetime: "datetime",
  date: "date",
  time: "time",
  duration: "duration",
  url: "url",
  uri: "uri",
  httpsUrl: "httpsUrl",
  ipv4: "ipv4",
  ipv6: "ipv6",
  uuid: "uuid",
  guid: "guid",
  base64: "base64",
  base64url: "base64url",
  cuid: "cuid",
  cuid2: "cuid2",
  ulid: "ulid",
  nanoid: "nanoid",
  emoji: "emoji",
  cidrv4: "cidrv4",
  cidrv6: "cidrv6",
  mac: "mac",
}

const reservedWords = new Set([
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
  "let",
  "package",
  "private",
  "protected",
  "public",
  "static",
])

function isValidIdentifier(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) && !reservedWords.has(name)
}

function assertIdentifier(name: string, label: string): void {
  if (!isValidIdentifier(name)) {
    throw new Error(`${label} must be a valid TypeScript identifier: ${name}`)
  }
}

function propertyName(name: string): string {
  return isValidIdentifier(name) ? name : JSON.stringify(name)
}

function normalizeOptions(
  options: string | GenerateCodecDeclarationsOptions = {}
): GenerateCodecDeclarationsOptions {
  return typeof options === "string" ? { serviceExportName: options } : options
}

/**
 * Convert a canister name to a SCREAMING_SNAKE_CASE identifier.
 * Hyphens and spaces are replaced with underscores.
 */
function toServiceExportName(canisterName: string): string {
  return canisterName.replace(/[-\s]+/g, "_").toUpperCase()
}

function resolveServiceExportName(
  options: GenerateCodecDeclarationsOptions,
  declaredTypeNames: Set<string>
): string {
  if (options.serviceExportName) return options.serviceExportName

  if (options.canisterName) {
    let name = toServiceExportName(options.canisterName)
    if (declaredTypeNames.has(name)) {
      name = `${name}_SERVICE`
    }
    return name
  }

  return "_SERVICE"
}

function hasMetadata(
  metadata: CandidMetadata | undefined
): metadata is CandidMetadata {
  return metadata != null && Object.keys(metadata).length > 0
}

function normalizeFormatDefinition(
  definition: CustomJSDocFormatTypes[string] | undefined
): JSDocFormatDefinition | undefined {
  if (!definition) return undefined
  return typeof definition === "string" ? { regex: definition } : definition
}

function formatDefinitionFor(
  type: string,
  options: GenerateCodecDeclarationsOptions
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

function isEmptyObject(value: unknown): boolean {
  return (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  )
}

function textFormatHelperFor(
  expression: string,
  metadata: CandidMetadata,
  options: GenerateCodecDeclarationsOptions
): string | undefined {
  const format = metadata.validation?.format
  if (!format || expression !== "c.text()") return undefined
  if (options.customJSDocFormatTypes?.[format.type]) {
    return undefined
  }
  return BUILT_IN_FORMAT_HELPERS[format.type]
}

function hasOnlyDescriptionDocs(
  docs: string[] | undefined,
  description: string | undefined
): boolean {
  return (
    docs != null &&
    description != null &&
    docs.length === 1 &&
    docs[0] === description
  )
}

function defaultBoundMessage(
  kind: "minimum" | "maximum" | "minLength" | "maxLength",
  value: string
): string {
  switch (kind) {
    case "minimum":
      return `Must be at least ${value}`
    case "maximum":
      return `Must be at most ${value}`
    case "minLength":
      return `Must be at least ${value} character${value === "1" ? "" : "s"}`
    case "maxLength":
      return `Must be at most ${value} character${value === "1" ? "" : "s"}`
  }
}

function withDefaultBoundMessage<
  T extends { value: string; message?: string } | undefined,
>(bound: T, kind: "minimum" | "maximum" | "minLength" | "maxLength"): T {
  if (!bound || bound.message) return bound
  return {
    ...bound,
    message: defaultBoundMessage(kind, bound.value),
  } as T
}

function metadataForRender(
  metadata: CandidMetadata,
  options: GenerateCodecDeclarationsOptions
): CandidMetadata {
  if (!metadata.validation) {
    return metadata
  }

  const validation = {
    ...metadata.validation,
    minimum: withDefaultBoundMessage(metadata.validation.minimum, "minimum"),
    maximum: withDefaultBoundMessage(metadata.validation.maximum, "maximum"),
    minLength: withDefaultBoundMessage(
      metadata.validation.minLength,
      "minLength"
    ),
    maxLength: withDefaultBoundMessage(
      metadata.validation.maxLength,
      "maxLength"
    ),
  }

  const format = metadata.validation.format
  const formatDefinition = format
    ? formatDefinitionFor(format.type, options)
    : undefined

  if (format && formatDefinition) {
    validation.format = stripUndefined({
      ...format,
      regex: formatDefinition.regex,
      jsonSchemaFormat: formatDefinition.jsonSchemaFormat,
      contentEncoding: formatDefinition.contentEncoding,
      errorMessage: format.message ?? formatDefinition.errorMessage,
    })
  }

  return {
    ...metadata,
    validation,
  }
}

function applyMetadata(
  expression: string,
  metadata: CandidMetadata | undefined,
  options: GenerateCodecDeclarationsOptions
): string {
  if (!hasMetadata(metadata)) return expression

  const textFormatHelper = textFormatHelperFor(expression, metadata, options)
  const textFormatMessage = metadata.validation?.format?.message
  const renderedMetadata = metadataForRender(metadata, options)
  const { description, ...metadataRest } = renderedMetadata
  const rest: Partial<CandidMetadata> = { ...metadataRest }
  let result = textFormatHelper
    ? `c.${textFormatHelper}(${textFormatMessage ? JSON.stringify(textFormatMessage) : ""})`
    : expression

  if (textFormatHelper) {
    delete rest.docs
    if (rest.validation) {
      const { format: _format, ...validationRest } = rest.validation
      rest.validation = stripUndefined(validationRest)

      if (isEmptyObject(rest.validation)) {
        delete rest.validation
      }
    }
  } else if (hasOnlyDescriptionDocs(rest.docs, description)) {
    delete rest.docs
  }

  if (description) {
    result += `.describe(${JSON.stringify(description)})`
  }

  if (Object.keys(rest).length > 0) {
    result += `.meta(${JSON.stringify(rest)})`
  }

  return result
}

function getReferencedNames(type: CandidType): string[] {
  const refs: string[] = []

  function visit(node: CandidType): void {
    switch (node.kind) {
      case "reference":
        refs.push(node.name)
        break
      case "opt":
      case "vec":
        visit(node.type)
        break
      case "record":
      case "variant":
        for (const field of node.fields) {
          visit(field.type)
        }
        break
      case "tuple":
        for (const item of node.types) {
          visit(item)
        }
        break
    }
  }

  visit(type)
  return refs
}

export function sortDeclarations(
  declarations: CandidTypeDeclaration[]
): CandidTypeDeclaration[] {
  const sorted: CandidTypeDeclaration[] = []
  const visited = new Set<string>()
  const visiting: string[] = []
  const declarationByName = new Map(
    declarations.map((decl) => [decl.name, decl])
  )

  function visit(name: string): void {
    if (visited.has(name)) return

    const cycleStart = visiting.indexOf(name)
    if (cycleStart !== -1) {
      const cycle = [...visiting.slice(cycleStart), name].join(" -> ")
      throw new Error(`Recursive Candid types are not supported yet: ${cycle}`)
    }

    const declaration = declarationByName.get(name)
    if (!declaration) return

    visiting.push(name)
    for (const dependency of getReferencedNames(declaration.type)) {
      visit(dependency)
    }
    visiting.pop()

    visited.add(name)
    sorted.push(declaration)
  }

  for (const declaration of declarations) {
    visit(declaration.name)
  }

  return sorted
}

export function renderType(
  type: CandidType,
  indent = "",
  options: GenerateCodecDeclarationsOptions = {}
): string {
  const nextIndent = `${indent}  `
  let expression: string

  switch (type.kind) {
    case "null":
      expression = "c.null()"
      break
    case "bool":
      expression = "c.bool()"
      break
    case "nat":
      expression = "c.nat()"
      break
    case "int":
      expression = "c.int()"
      break
    case "nat8":
      expression = "c.nat8()"
      break
    case "nat16":
      expression = "c.nat16()"
      break
    case "nat32":
      expression = "c.nat32()"
      break
    case "nat64":
      expression = "c.nat64()"
      break
    case "int8":
      expression = "c.int8()"
      break
    case "int16":
      expression = "c.int16()"
      break
    case "int32":
      expression = "c.int32()"
      break
    case "int64":
      expression = "c.int64()"
      break
    case "float32":
      expression = "c.float32()"
      break
    case "float64":
      expression = "c.float64()"
      break
    case "text":
      expression = "c.text()"
      break
    case "reserved":
      expression = "c.reserved()"
      break
    case "empty":
      expression = "c.empty()"
      break
    case "principal":
      expression = "c.principal()"
      break
    case "blob":
      expression = "c.blob()"
      break
    case "reference":
      assertIdentifier(type.name, "Type reference")
      expression = type.name
      break
    case "opt":
      expression = `c.opt(${renderType(type.type, indent, options)})`
      break
    case "vec":
      expression = `c.vec(${renderType(type.type, indent, options)})`
      break
    case "record": {
      if (type.fields.length === 0) {
        expression = "c.record({})"
      } else {
        const fields = type.fields
          .map((field) => {
            const fieldExpression = applyMetadata(
              renderType(field.type, nextIndent, options),
              field.metadata,
              options
            )
            return `${nextIndent}${propertyName(field.name)}: ${fieldExpression},`
          })
          .join("\n")
        expression = `c.record({\n${fields}\n${indent}})`
      }
      break
    }
    case "variant": {
      if (type.fields.length === 0) {
        expression = "c.variant({})"
      } else {
        const fields = type.fields
          .map((field) => {
            const fieldExpression = applyMetadata(
              renderType(field.type, nextIndent, options),
              field.metadata,
              options
            )
            return `${nextIndent}${propertyName(field.name)}: ${fieldExpression},`
          })
          .join("\n")
        expression = `c.variant({\n${fields}\n${indent}})`
      }
      break
    }
    case "tuple":
      expression = `c.tuple([${type.types
        .map((item) => renderType(item, indent, options))
        .join(", ")}])`
      break
    case "func":
    case "service":
    case "class":
    case "unknown":
    case "knot":
    case "future":
      expression = `/* c.${type.kind} is not supported */ c.reserved()`
      break
  }

  return applyMetadata(expression, type.metadata, options)
}

function renderMethodReturn(
  method: NonNullable<CandidSchema["service"]>["methods"][number],
  options: GenerateCodecDeclarationsOptions
): string {
  if (method.mode === "oneway") return ""
  if (method.returns.length === 0) return ""
  if (method.returns.length === 1) {
    return `, ${renderType(method.returns[0], "    ", options)}`
  }
  return `, c.tuple([${method.returns
    .map((returnType) => renderType(returnType, "    ", options))
    .join(", ")}])`
}

/**
 * Converts a structured CandidSchema AST into readable `@ic-reactor/cod`
 * codec declarations.
 */
export function generateCodecDeclarations(
  schema: CandidSchema,
  optionsOrServiceExportName: string | GenerateCodecDeclarationsOptions = {}
): string {
  const options = normalizeOptions(optionsOrServiceExportName)
  const lines: string[] = ['import { c } from "@ic-reactor/cod"', ""]

  for (const declaration of sortDeclarations(schema.types)) {
    assertIdentifier(declaration.name, "Type declaration name")

    lines.push(
      `export const ${declaration.name} = ${applyMetadata(
        renderType(declaration.type, "", options),
        declaration.metadata,
        options
      )}`
    )
    lines.push(
      `export type ${declaration.name} = c.infer<typeof ${declaration.name}>`
    )
    lines.push("")
  }

  if (schema.service) {
    const includeCompatibilityExports =
      options.includeCompatibilityExports ?? false
    const declaredTypeNames = new Set(schema.types.map((t) => t.name))
    const serviceExportName = resolveServiceExportName(
      options,
      declaredTypeNames
    )
    assertIdentifier(serviceExportName, "Service export name")
    const methods = schema.service.methods
      .map((method) => {
        const args = method.args
          .map((arg) => renderType(arg, "    ", options))
          .join(", ")
        const methodExpression = `c.${method.mode}([${args}]${renderMethodReturn(
          method,
          options
        )})`
        return `  ${propertyName(method.name)}: ${applyMetadata(
          methodExpression,
          method.metadata,
          options
        )},`
      })
      .join("\n")

    const serviceExpression =
      methods.length > 0 ? `c.service({\n${methods}\n})` : "c.service({})"
    lines.push(
      `export const ${serviceExportName} = ${applyMetadata(
        serviceExpression,
        schema.service.metadata,
        options
      )}`
    )
    lines.push("")

    if (includeCompatibilityExports) {
      lines.push(`export const idlFactory = ${serviceExportName}.idlFactory`)
      lines.push(
        `export type _SERVICE = c.ServiceOf<typeof ${serviceExportName}>`
      )
      lines.push("")
      lines.push(`export const manifest = ${serviceExportName}.manifest()`)
    }
  }

  return `${lines.join("\n").trimEnd()}\n`
}
