import { candidTypeTextId } from "./candid-format.js"
import { fieldObjectKey, ProgramIrGraph } from "./program-ir.js"
import { ProgramSemanticsGraph } from "./semantics.js"
import type {
  CustomJSDocFormat,
  DeclId,
  DocTag,
  FormField,
  FormSchemaOptions,
  FormValidationRule,
  FormVariantOption,
  MethodFormSchema,
  MethodId,
  ProgramArgIR,
  ProgramFieldIR,
  ProgramFormSchema,
  ProgramIR,
  ProgramTypeRefIR,
  TypeId,
} from "./types.js"

type NormalizedCustomFormat = {
  regex: string
  errorMessage?: string
}

export function programToFormSchema(
  ir: ProgramIR,
  options: FormSchemaOptions = {}
): ProgramFormSchema {
  const context = new FormContext(ir, options)
  return {
    methods: context.graph
      .actorMethodIds()
      .map((methodId) => methodToFormSchema(methodId, context)),
  }
}

export function methodToFormSchema(
  methodId: MethodId,
  context: FormContext
): MethodFormSchema {
  const method = context.graph.method(methodId)
  const schema: MethodFormSchema = {
    methodId,
    name: method.name,
    mode: method.mode,
    args: method.args.map((arg, index) =>
      argToField(arg, `arg${index}`, `args[${index}]`, true, context)
    ),
    returns: method.returns.map((arg, index) =>
      argToField(arg, `return${index}`, `returns[${index}]`, true, context)
    ),
  }
  const docs = presentDocLines(method.metadata?.docs)
  if (docs) {
    schema.docs = docs
  }
  const rawDocs = presentDocLines(method.metadata?.rawDocs)
  if (rawDocs) {
    schema.rawDocs = rawDocs
  }
  const docTags = presentDocTags(method.metadata?.docTags)
  if (docTags) {
    schema.docTags = docTags
  }
  return schema
}

export class FormContext {
  readonly graph: ProgramIrGraph
  readonly semantics: ProgramSemanticsGraph
  readonly #customFormats = new Map<string, NormalizedCustomFormat>()

  constructor(
    readonly ir: ProgramIR,
    options: FormSchemaOptions = {}
  ) {
    this.graph = new ProgramIrGraph(ir)
    this.semantics = new ProgramSemanticsGraph(this.graph)

    for (const [name, format] of Object.entries(customFormatTypes(options))) {
      this.#customFormats.set(name, normalizeCustomFormat(format))
    }
  }

  customFormat(name: string): NormalizedCustomFormat | undefined {
    return this.#customFormats.get(name)
  }
}

function argToField(
  arg: ProgramArgIR,
  fallbackName: string,
  path: string,
  required: boolean,
  context: FormContext
): FormField {
  return typeRefToField(arg.type, {
    name: arg.name ?? fallbackName,
    path,
    required,
    docs: arg.metadata?.docs,
    rawDocs: arg.metadata?.rawDocs,
    docTags: arg.metadata?.docTags,
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
  refs: Set<DeclId>
}

function typeRefToField(
  reference: ProgramTypeRefIR,
  options: FieldOptions
): FormField {
  if (reference.kind === "decl") {
    return declarationRefToField(reference.id, options)
  }
  return typeIdToField(reference.id, options)
}

function declarationRefToField(id: DeclId, options: FieldOptions): FormField {
  const declaration = options.context.graph.declaration(id)
  const docs = options.docs ?? declaration.metadata?.docs
  const rawDocs = options.rawDocs ?? declaration.metadata?.rawDocs
  const docTags = options.docTags ?? declaration.metadata?.docTags

  if (options.refs.has(id)) {
    return baseField(
      "unsupported",
      { ...options, docs, rawDocs, docTags },
      declaration.name
    )
  }

  return typeIdToField(declaration.type, {
    ...options,
    docs,
    rawDocs,
    docTags,
    refs: new Set([...options.refs, id]),
  })
}

function typeIdToField(id: TypeId, options: FieldOptions): FormField {
  const graph = options.context.graph
  const semantics = options.context.semantics
  const candidType = candidTypeTextId(graph, semantics, id)

  if (semantics.isBlobType(id)) {
    return baseField("blob", options, candidType)
  }

  const type = graph.typeKind(id)
  switch (type.kind) {
    case "null":
      return baseField("null", options, candidType)
    case "bool":
      return baseField("boolean", options, candidType)
    case "text":
      return baseField("text", options, candidType)
    case "nat":
    case "int":
    case "nat64":
    case "int64":
      return baseField("bigint", options, candidType)
    case "nat8":
    case "nat16":
    case "nat32":
    case "int8":
    case "int16":
    case "int32":
    case "float32":
    case "float64":
      return baseField("number", options, candidType)
    case "principal":
      return baseField("principal", options, candidType)
    case "opt": {
      const field = baseField(
        "option",
        { ...options, required: false },
        candidType
      )
      field.children = [
        typeRefToField(type.inner, {
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
      const field = baseField("array", options, candidType)
      const elementTags = elementDocTags(
        combinedDocTags(options.docTags, options.validationDocTags)
      )
      field.children = [
        typeRefToField(type.inner, {
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
      const field = baseField("record", options, candidType)
      field.children = type.fields.map((recordField) =>
        recordFieldToFormField(recordField, options)
      )
      return field
    }
    case "variant": {
      const field = baseField("variant", options, candidType)
      field.options = type.fields.map((variantField) =>
        variantOption(variantField, options)
      )
      return field
    }
    case "reserved":
    case "empty":
    case "func":
    case "service":
      return baseField("unsupported", options, candidType)
  }
}

function recordFieldToFormField(
  field: ProgramFieldIR,
  parent: FieldOptions
): FormField {
  const name = fieldDisplayName(field)
  const key = fieldObjectKey(field)
  return typeRefToField(field.type, {
    ...parent,
    name,
    path: `${parent.path}${pathSegment(key)}`,
    required: true,
    docs: field.metadata?.docs,
    rawDocs: field.metadata?.rawDocs,
    docTags: field.metadata?.docTags,
  })
}

function variantOption(
  field: ProgramFieldIR,
  parent: FieldOptions
): FormVariantOption {
  const name = fieldDisplayName(field)
  const key = fieldObjectKey(field)
  const option: FormVariantOption = {
    name,
    label: labelFromDocTags(field.metadata?.docTags) ?? name,
  }
  const docs = presentDocLines(field.metadata?.docs)
  if (docs) {
    option.docs = docs
  }
  const rawDocs = presentDocLines(field.metadata?.rawDocs)
  if (rawDocs) {
    option.rawDocs = rawDocs
  }
  const docTags = presentDocTags(field.metadata?.docTags)
  if (docTags) {
    option.docTags = docTags
  }
  if (!isDirectNullRef(parent.context.graph, field.type)) {
    option.field = typeRefToField(field.type, {
      ...parent,
      name,
      path: `${parent.path}${pathSegment(key)}`,
      required: true,
      docs: field.metadata?.docs,
      rawDocs: field.metadata?.rawDocs,
      docTags: field.metadata?.docTags,
    })
  }
  return option
}

function fieldDisplayName(field: ProgramFieldIR): string {
  return field.label.kind === "named" ? field.label.name : fieldObjectKey(field)
}

function baseField(
  kind: FormField["kind"],
  options: FieldOptions,
  candidType: string,
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

function isDirectNullRef(
  graph: ProgramIrGraph,
  reference: ProgramTypeRefIR
): boolean {
  return (
    reference.kind === "type" && graph.typeKind(reference.id).kind === "null"
  )
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
