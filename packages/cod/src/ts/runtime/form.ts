import { candidTypeText } from "./candid-format.js"
import { fieldObjectKey } from "./program-ir.js"
import type {
  CandidArgIR,
  CandidFieldIR,
  CandidMethodIR,
  CandidTypeIR,
  CustomJSDocFormat,
  DocTag,
  FormField,
  FormSchemaOptions,
  FormValidationRule,
  FormVariantOption,
  MethodFormSchema,
  ProgramFormSchema,
  RuntimeProgramIR,
} from "./types.js"

type NormalizedCustomFormat = {
  regex: string
  errorMessage?: string
}

export function programToFormSchema(
  ir: RuntimeProgramIR,
  options: FormSchemaOptions = {}
): ProgramFormSchema {
  const context = new FormContext(ir, options)
  return {
    methods: (ir.actor?.service.methods ?? []).map((method) =>
      methodToFormSchema(method, context)
    ),
  }
}

export function methodToFormSchema(
  method: CandidMethodIR,
  context: FormContext
): MethodFormSchema {
  const schema: MethodFormSchema = {
    name: method.name,
    mode: method.mode,
    args: method.args.map((arg, index) =>
      argToField(arg, `arg${index}`, `args[${index}]`, true, context)
    ),
    returns: method.returns.map((arg, index) =>
      argToField(arg, `return${index}`, `returns[${index}]`, true, context)
    ),
  }
  const docs = presentDocLines(method.docs)
  if (docs) {
    schema.docs = docs
  }
  const rawDocs = presentDocLines(method.rawDocs)
  if (rawDocs) {
    schema.rawDocs = rawDocs
  }
  const docTags = presentDocTags(method.docTags)
  if (docTags) {
    schema.docTags = docTags
  }
  return schema
}

export class FormContext {
  readonly #types = new Map<string, CandidTypeIR>()
  readonly #docs = new Map<string, string[]>()
  readonly #rawDocs = new Map<string, string[]>()
  readonly #docTags = new Map<string, DocTag[]>()
  readonly #customFormats = new Map<string, NormalizedCustomFormat>()

  constructor(
    readonly ir: RuntimeProgramIR,
    options: FormSchemaOptions = {}
  ) {
    for (const declaration of ir.types) {
      this.#types.set(declaration.name, declaration.type)
      const docs = presentDocLines(declaration.docs)
      if (docs) {
        this.#docs.set(declaration.name, docs)
      }
      const rawDocs = presentDocLines(declaration.rawDocs)
      if (rawDocs) {
        this.#rawDocs.set(declaration.name, rawDocs)
      }
      const docTags = presentDocTags(declaration.docTags)
      if (docTags) {
        this.#docTags.set(declaration.name, docTags)
      }
    }

    for (const [name, format] of Object.entries(customFormatTypes(options))) {
      this.#customFormats.set(name, normalizeCustomFormat(format))
    }
  }

  typeByName(name: string): CandidTypeIR | undefined {
    return this.#types.get(name)
  }

  docsByName(name: string): string[] | undefined {
    return this.#docs.get(name)
  }

  rawDocsByName(name: string): string[] | undefined {
    return this.#rawDocs.get(name)
  }

  docTagsByName(name: string): DocTag[] | undefined {
    return this.#docTags.get(name)
  }

  customFormat(name: string): NormalizedCustomFormat | undefined {
    return this.#customFormats.get(name)
  }
}

function argToField(
  arg: CandidArgIR,
  fallbackName: string,
  path: string,
  required: boolean,
  context: FormContext
): FormField {
  return typeToField(arg.type, {
    name: arg.name ?? fallbackName,
    path,
    required,
    docs: arg.docs,
    rawDocs: arg.rawDocs,
    docTags: arg.docTags,
    context,
    refs: new Set(),
  })
}

type FieldOptions = {
  name: string
  path: string
  required: boolean
  docs?: readonly string[] | undefined
  rawDocs?: readonly string[] | undefined
  docTags?: readonly DocTag[] | undefined
  validationDocTags?: readonly DocTag[] | undefined
  context: FormContext
  refs: Set<string>
}

function typeToField(type: CandidTypeIR, options: FieldOptions): FormField {
  if (type.kind === "ref") {
    const docs = options.docs ?? options.context.docsByName(type.name)
    const rawDocs = options.rawDocs ?? options.context.rawDocsByName(type.name)
    const docTags = options.docTags ?? options.context.docTagsByName(type.name)

    if (options.refs.has(type.name)) {
      return baseField(
        type,
        "unsupported",
        { ...options, docs, rawDocs, docTags },
        type.name
      )
    }

    const target = options.context.typeByName(type.name)
    if (!target) {
      return baseField(
        type,
        "unsupported",
        { ...options, docs, rawDocs, docTags },
        type.name
      )
    }

    return typeToField(target, {
      ...options,
      docs,
      rawDocs,
      docTags,
      refs: new Set([...options.refs, type.name]),
    })
  }

  switch (type.kind) {
    case "null":
      return baseField(type, "null", options)
    case "bool":
      return baseField(type, "boolean", options)
    case "text":
      return baseField(type, "text", options)
    case "nat":
    case "int":
    case "nat64":
    case "int64":
      return baseField(type, "bigint", options)
    case "nat8":
    case "nat16":
    case "nat32":
    case "int8":
    case "int16":
    case "int32":
    case "float32":
    case "float64":
      return baseField(type, "number", options)
    case "principal":
      return baseField(type, "principal", options)
    case "blob":
      return baseField(type, "blob", options)
    case "opt": {
      const field = baseField(type, "option", { ...options, required: false })
      field.children = [
        typeToField(type.inner, {
          ...options,
          name: "value",
          path: `${options.path}.value`,
          required: true,
          docs: undefined,
          rawDocs: undefined,
          docTags: undefined,
          validationDocTags: combinedDocTags(
            options.docTags,
            options.validationDocTags
          ),
        }),
      ]
      return field
    }
    case "vec": {
      const field = baseField(type, "array", options)
      const elementTags = elementDocTags(
        combinedDocTags(options.docTags, options.validationDocTags)
      )
      field.children = [
        typeToField(type.inner, {
          ...options,
          name: "item",
          path: `${options.path}[0]`,
          required: true,
          docs: undefined,
          rawDocs: undefined,
          docTags: undefined,
          validationDocTags: elementTags,
        }),
      ]
      return field
    }
    case "record": {
      const field = baseField(type, "record", options)
      field.children = type.fields.map((recordField) =>
        recordFieldToFormField(recordField, options)
      )
      return field
    }
    case "variant": {
      const field = baseField(type, "variant", options)
      field.options = type.fields.map((variantField) =>
        variantOption(variantField, options)
      )
      return field
    }
    case "reserved":
    case "empty":
    case "func":
    case "service":
      return baseField(type, "unsupported", options)
  }
}

function recordFieldToFormField(
  field: CandidFieldIR,
  parent: FieldOptions
): FormField {
  const name = fieldDisplayName(field)
  const key = fieldObjectKey(field)
  return typeToField(field.type, {
    ...parent,
    name,
    path: `${parent.path}${pathSegment(key)}`,
    required: true,
    docs: field.docs,
    rawDocs: field.rawDocs,
    docTags: field.docTags,
  })
}

function variantOption(
  field: CandidFieldIR,
  parent: FieldOptions
): FormVariantOption {
  const name = fieldDisplayName(field)
  const key = fieldObjectKey(field)
  const option: FormVariantOption = {
    name,
    label: labelFromDocTags(field.docTags) ?? name,
  }
  const docs = presentDocLines(field.docs)
  if (docs) {
    option.docs = docs
  }
  const rawDocs = presentDocLines(field.rawDocs)
  if (rawDocs) {
    option.rawDocs = rawDocs
  }
  const docTags = presentDocTags(field.docTags)
  if (docTags) {
    option.docTags = docTags
  }
  if (field.type.kind !== "null") {
    option.field = typeToField(field.type, {
      ...parent,
      name,
      path: `${parent.path}${pathSegment(key)}`,
      required: true,
      docs: field.docs,
      rawDocs: field.rawDocs,
      docTags: field.docTags,
    })
  }
  return option
}

function fieldDisplayName(field: CandidFieldIR): string {
  return field.label.kind === "named" ? field.label.name : fieldObjectKey(field)
}

function baseField(
  type: CandidTypeIR,
  kind: FormField["kind"],
  options: FieldOptions,
  candidType = candidTypeText(type, options.context),
  docs = options.docs
): FormField {
  const field: FormField = {
    name: options.name,
    label: labelFromDocTags(options.docTags) ?? options.name,
    path: options.path,
    candidType,
    kind,
    required: options.required,
  }
  const presentDocs = presentDocLines(docs)
  if (presentDocs) {
    field.docs = presentDocs
  }
  const rawDocs = presentDocLines(options.rawDocs)
  if (rawDocs) {
    field.rawDocs = rawDocs
  }
  const docTags = presentDocTags(options.docTags)
  if (docTags) {
    field.docTags = docTags
  }
  const validation = validationRulesForField(
    kind,
    combinedDocTags(options.docTags, options.validationDocTags),
    options.context
  )
  if (validation.length > 0) {
    field.validation = validation
  }
  return field
}

function pathSegment(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? `.${key}`
    : `[${JSON.stringify(key)}]`
}

function presentDocTags(
  tags: readonly DocTag[] | undefined
): DocTag[] | undefined {
  return tags && tags.length > 0 ? [...tags] : undefined
}

function labelFromDocTags(
  tags: readonly DocTag[] | undefined
): string | undefined {
  const label = tags?.find((tag) => tag.name === "label")?.value.trim()
  return label || undefined
}

function presentDocLines(
  lines: readonly string[] | undefined
): string[] | undefined {
  return lines && lines.length > 0 ? [...lines] : undefined
}

function combinedDocTags(
  ...tagGroups: Array<readonly DocTag[] | undefined>
): DocTag[] | undefined {
  const tags = tagGroups.flatMap((group) => group ?? [])
  return tags.length > 0 ? tags : undefined
}

function customFormatTypes(
  options: FormSchemaOptions
): Record<string, CustomJSDocFormat> {
  return (
    options.customJSDocFormatTypes ?? options.custom_js_doc_format_types ?? {}
  )
}

function normalizeCustomFormat(
  format: CustomJSDocFormat
): NormalizedCustomFormat {
  if (typeof format === "string") {
    return { regex: format }
  }
  const normalized: NormalizedCustomFormat = { regex: format.regex }
  if (format.errorMessage !== undefined) {
    normalized.errorMessage = format.errorMessage
  }
  return normalized
}

function validationRulesForField(
  kind: FormField["kind"],
  tags: readonly DocTag[] | undefined,
  context: FormContext
): FormValidationRule[] {
  if (!tags) {
    return []
  }

  const rules: FormValidationRule[] = []
  for (const tag of tags) {
    switch (tag.name) {
      case "minimum":
      case "maximum": {
        if (kind !== "number" && kind !== "bigint") {
          break
        }
        const rule = numericRule(tag.name, tag.value)
        if (rule) {
          rules.push(rule)
        }
        break
      }
      case "minLength":
      case "maxLength": {
        if (kind !== "text") {
          break
        }
        const rule = lengthRule(tag.name, tag.value)
        if (rule) {
          rules.push(rule)
        }
        break
      }
      case "format": {
        if (kind !== "text") {
          break
        }
        const rule = formatRule(tag.value, context)
        if (rule) {
          rules.push(rule)
        }
        break
      }
      case "pattern": {
        if (kind !== "text") {
          break
        }
        const source = tag.value.trim()
        if (source) {
          rules.push({ kind: "pattern", value: source })
        }
        break
      }
    }
  }
  return rules
}

function numericRule(
  kind: "minimum" | "maximum",
  value: string
): FormValidationRule | undefined {
  const parsed = firstTokenAndMessage(value)
  if (!parsed) {
    return undefined
  }
  const numericValue = Number(parsed.token)
  if (!Number.isFinite(numericValue)) {
    return undefined
  }
  const rule: FormValidationRule = {
    kind,
    value: numericValue,
    rawValue: parsed.token,
  }
  if (parsed.message) {
    rule.message = parsed.message
  }
  return rule
}

function lengthRule(
  kind: "minLength" | "maxLength",
  value: string
): FormValidationRule | undefined {
  const parsed = firstTokenAndMessage(value)
  if (!parsed) {
    return undefined
  }
  const numericValue = Number(parsed.token)
  if (!Number.isInteger(numericValue) || numericValue < 0) {
    return undefined
  }
  const rule: FormValidationRule = {
    kind,
    value: numericValue,
    rawValue: parsed.token,
  }
  if (parsed.message) {
    rule.message = parsed.message
  }
  return rule
}

function formatRule(
  value: string,
  context: FormContext
): FormValidationRule | undefined {
  const parsed = firstTokenAndMessage(value)
  if (!parsed) {
    return undefined
  }
  const customFormat = context.customFormat(parsed.token)
  const rule: FormValidationRule = {
    kind: "format",
    value: parsed.token,
  }
  if (parsed.message) {
    rule.message = parsed.message
  }
  if (customFormat) {
    rule.regex = customFormat.regex
    if (customFormat.errorMessage !== undefined) {
      rule.errorMessage = customFormat.errorMessage
    }
  }
  return rule
}

function firstTokenAndMessage(
  value: string
): { token: string; message?: string } | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }
  const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(trimmed)
  if (!match) {
    return undefined
  }
  const parsed: { token: string; message?: string } = { token: match[1]! }
  const message = match[2]?.trim()
  if (message) {
    parsed.message = message
  }
  return parsed
}

function elementDocTags(
  tags: readonly DocTag[] | undefined
): DocTag[] | undefined {
  if (!tags) {
    return undefined
  }
  const mapped = tags.flatMap((tag): DocTag[] => {
    const name = elementRuleName(tag.name)
    return name ? [{ name, value: tag.value }] : []
  })
  return mapped.length > 0 ? mapped : undefined
}

function elementRuleName(name: string): string | undefined {
  switch (name) {
    case "elementMinLength":
      return "minLength"
    case "elementMaxLength":
      return "maxLength"
    case "elementFormat":
      return "format"
    case "elementPattern":
      return "pattern"
    case "elementMinimum":
      return "minimum"
    case "elementMaximum":
      return "maximum"
    default:
      return undefined
  }
}
