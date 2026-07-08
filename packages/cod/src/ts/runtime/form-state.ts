import type { FormField, FormValidationRule } from "./types.js"

export type FieldValue = string | boolean | null

type NumericValidationRule = {
  kind: "minimum" | "maximum"
  value: number
  rawValue: string
  message?: string
}

type FormatValidationRule = {
  kind: "format"
  value: string
  message?: string
  regex?: string
  errorMessage?: string
}

export type FieldState = {
  value: FieldValue
  children?: Record<string, FieldState>
  items?: FieldState[]
  enabled?: boolean
  inner?: FieldState
  selectedCase?: string
  cases?: Record<string, FieldState>
}

export type FormState = FieldState[]

export type FormStateIssue = {
  path: string
  message: string
}

export class FormStateError extends Error {
  readonly path: string

  constructor(path: string, message: string) {
    super(`${path}: ${message}`)
    this.name = "FormStateError"
    this.path = path
  }
}

export function createFormState(fields: readonly FormField[]): FormState {
  return fields.map((field) => createFieldState(field))
}

export const createInitialState = createFormState

export function formStateToArgs(
  state: readonly FieldState[],
  fields: readonly FormField[]
): unknown[] {
  return fields.map((field, index) => {
    const fieldState = state[index]
    if (!fieldState) {
      throw new FormStateError(field.path, "missing form field state")
    }
    return fieldStateToValue(fieldState, field)
  })
}

export function fieldStateToValue(
  state: FieldState,
  field: FormField
): unknown {
  switch (field.kind) {
    case "text":
    case "principal":
      return String(state.value ?? "")
    case "number":
      return parseNumberField(state, field)
    case "bigint":
      return parseBigIntField(state, field)
    case "boolean":
      return Boolean(state.value)
    case "blob":
      return parseBlobField(state, field)
    case "null":
      return null
    case "option": {
      if (!state.enabled) {
        return undefined
      }
      const innerField = field.children?.[0]
      if (!innerField || !state.inner) {
        return undefined
      }
      return fieldStateToValue(state.inner, innerField)
    }
    case "array": {
      const templateField = field.children?.[0]
      if (!templateField) {
        return []
      }
      return (state.items ?? []).map((item) =>
        fieldStateToValue(item, templateField)
      )
    }
    case "tuple":
      return (field.children ?? []).map((child) => {
        const childState = state.children?.[child.name]
        if (!childState) {
          throw new FormStateError(child.path, "missing tuple item state")
        }
        return fieldStateToValue(childState, child)
      })
    case "record": {
      const result: Record<string, unknown> = {}
      for (const child of field.children ?? []) {
        const childState = state.children?.[child.name]
        if (!childState) {
          throw new FormStateError(child.path, "missing record field state")
        }
        result[child.name] = fieldStateToValue(childState, child)
      }
      return result
    }
    case "variant": {
      const caseName = state.selectedCase
      if (!caseName) {
        throw new FormStateError(field.path, "select a variant case")
      }
      const option = field.options?.find(
        (candidate) => candidate.name === caseName
      )
      if (!option) {
        throw new FormStateError(
          field.path,
          `unknown variant case ${JSON.stringify(caseName)}`
        )
      }
      if (!option.field) {
        return { [caseName]: null }
      }
      const caseState = state.cases?.[caseName]
      if (!caseState) {
        throw new FormStateError(
          option.field.path,
          "missing variant case state"
        )
      }
      return { [caseName]: fieldStateToValue(caseState, option.field) }
    }
    case "unsupported":
      throw new FormStateError(
        field.path,
        `unsupported Candid type ${field.candidType}`
      )
  }
}

export function validateFormState(
  state: readonly FieldState[],
  fields: readonly FormField[]
): FormStateIssue[] {
  const issues: FormStateIssue[] = []
  for (const [index, field] of fields.entries()) {
    const fieldState = state[index]
    if (!fieldState) {
      pushIssue(
        issues,
        new FormStateError(field.path, "missing form field state")
      )
      continue
    }
    validateFieldState(fieldState, field, issues)
  }
  return issues
}

function validateFieldState(
  state: FieldState,
  field: FormField,
  issues: FormStateIssue[]
): void {
  try {
    switch (field.kind) {
      case "text": {
        validateRules(String(state.value ?? ""), field, issues)
        return
      }
      case "principal":
        String(state.value ?? "")
        return
      case "number": {
        const value = parseNumberField(state, field)
        validateRules(value, field, issues)
        return
      }
      case "bigint": {
        const value = parseBigIntField(state, field)
        validateRules(value, field, issues)
        return
      }
      case "boolean":
        Boolean(state.value)
        return
      case "blob":
        parseBlobField(state, field)
        return
      case "null":
        return
      case "option": {
        if (!state.enabled) {
          return
        }
        const innerField = field.children?.[0]
        if (!innerField || !state.inner) {
          return
        }
        validateFieldState(state.inner, innerField, issues)
        return
      }
      case "array": {
        const templateField = field.children?.[0]
        if (!templateField) {
          return
        }
        for (const [index, item] of (state.items ?? []).entries()) {
          validateFieldState(
            item,
            rebaseFieldPath(templateField, `${field.path}[${index}]`),
            issues
          )
        }
        return
      }
      case "tuple": {
        for (const child of field.children ?? []) {
          const childState = state.children?.[child.name]
          if (!childState) {
            pushIssue(
              issues,
              new FormStateError(child.path, "missing tuple item state")
            )
            continue
          }
          validateFieldState(childState, child, issues)
        }
        return
      }
      case "record": {
        for (const child of field.children ?? []) {
          const childState = state.children?.[child.name]
          if (!childState) {
            pushIssue(
              issues,
              new FormStateError(child.path, "missing record field state")
            )
            continue
          }
          validateFieldState(childState, child, issues)
        }
        return
      }
      case "variant": {
        const caseName = state.selectedCase
        if (!caseName) {
          pushIssue(
            issues,
            new FormStateError(field.path, "select a variant case")
          )
          return
        }
        const option = field.options?.find(
          (candidate) => candidate.name === caseName
        )
        if (!option) {
          pushIssue(
            issues,
            new FormStateError(
              field.path,
              `unknown variant case ${JSON.stringify(caseName)}`
            )
          )
          return
        }
        if (!option.field) {
          return
        }
        const caseState = state.cases?.[caseName]
        if (!caseState) {
          pushIssue(
            issues,
            new FormStateError(option.field.path, "missing variant case state")
          )
          return
        }
        validateFieldState(caseState, option.field, issues)
        return
      }
      case "unsupported":
        pushIssue(
          issues,
          new FormStateError(
            field.path,
            `unsupported Candid type ${field.candidType}`
          )
        )
        return
    }
  } catch (error) {
    if (error instanceof FormStateError) {
      pushIssue(issues, error)
    } else {
      issues.push({
        path: field.path,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

function validateRules(
  value: string | number | bigint,
  field: FormField,
  issues: FormStateIssue[]
): void {
  for (const rule of field.validation ?? []) {
    switch (rule.kind) {
      case "minLength":
        if (typeof value === "string" && value.length < rule.value) {
          pushValidationIssue(
            issues,
            field,
            rule,
            `must contain at least ${rule.value} characters`
          )
        }
        break
      case "maxLength":
        if (typeof value === "string" && value.length > rule.value) {
          pushValidationIssue(
            issues,
            field,
            rule,
            `must contain at most ${rule.value} characters`
          )
        }
        break
      case "minimum":
        if (violatesMinimum(value, rule)) {
          pushValidationIssue(
            issues,
            field,
            rule,
            `must be greater than or equal to ${rule.rawValue}`
          )
        }
        break
      case "maximum":
        if (violatesMaximum(value, rule)) {
          pushValidationIssue(
            issues,
            field,
            rule,
            `must be less than or equal to ${rule.rawValue}`
          )
        }
        break
      case "format":
        if (typeof value === "string" && !isValidFormat(value, rule)) {
          pushValidationIssue(
            issues,
            field,
            rule,
            rule.errorMessage ?? `must be a valid ${rule.value}`
          )
        }
        break
      case "pattern":
        if (typeof value === "string" && !matchesPattern(value, rule.value)) {
          pushValidationIssue(
            issues,
            field,
            rule,
            `must match pattern /${rule.value}/`
          )
        }
        break
    }
  }
}

function pushValidationIssue(
  issues: FormStateIssue[],
  field: FormField,
  rule: FormValidationRule,
  fallback: string
): void {
  const message = "message" in rule && rule.message ? rule.message : fallback
  issues.push({ path: field.path, message })
}

function pushIssue(issues: FormStateIssue[], error: FormStateError): void {
  issues.push({ path: error.path, message: error.message })
}

function violatesMinimum(
  value: string | number | bigint,
  rule: NumericValidationRule
): boolean {
  if (typeof value === "bigint") {
    const limit = bigintLimit(rule)
    return limit !== undefined && value < limit
  }
  return typeof value === "number" && value < rule.value
}

function violatesMaximum(
  value: string | number | bigint,
  rule: NumericValidationRule
): boolean {
  if (typeof value === "bigint") {
    const limit = bigintLimit(rule)
    return limit !== undefined && value > limit
  }
  return typeof value === "number" && value > rule.value
}

function bigintLimit(rule: NumericValidationRule): bigint | undefined {
  if (!/^[+-]?\d+$/.test(rule.rawValue)) {
    return undefined
  }
  try {
    return BigInt(rule.rawValue)
  } catch {
    return undefined
  }
}

function isValidFormat(value: string, rule: FormatValidationRule): boolean {
  if (rule.regex) {
    return matchesPattern(value, rule.regex)
  }

  switch (rule.value) {
    case "date-time":
      return isDateTime(value)
    case "date":
      return isDate(value)
    case "time":
      return isTime(value)
    case "duration":
      return isDuration(value)
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    case "ip":
      return isIpv4(value) || isIpv6(value)
    case "ipv4":
      return isIpv4(value)
    case "ipv6":
      return isIpv6(value)
    case "url":
      return isUrl(value)
    case "uuid":
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
    default:
      return true
  }
}

function matchesPattern(value: string, source: string): boolean {
  try {
    return new RegExp(source).test(value)
  } catch {
    return false
  }
}

function isDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value))
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`)
  return (
    !Number.isNaN(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  )
}

function isTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-]([01]\d|2[0-3]):[0-5]\d)?$/.test(
    value
  )
}

function isDuration(value: string): boolean {
  return /^P(?=\d|T\d)(?:\d+(?:[.,]\d+)?Y)?(?:\d+(?:[.,]\d+)?M)?(?:\d+(?:[.,]\d+)?W)?(?:\d+(?:[.,]\d+)?D)?(?:T(?:\d+(?:[.,]\d+)?H)?(?:\d+(?:[.,]\d+)?M)?(?:\d+(?:[.,]\d+)?S)?)?$/.test(
    value
  )
}

function isIpv4(value: string): boolean {
  const parts = value.split(".")
  return (
    parts.length === 4 &&
    parts.every((part) => {
      if (!/^\d+$/.test(part)) {
        return false
      }
      const byte = Number(part)
      return byte >= 0 && byte <= 255 && String(byte) === part
    })
  )
}

function isIpv6(value: string): boolean {
  if (!/^[0-9a-fA-F:]+$/.test(value)) {
    return false
  }
  const halves = value.split("::")
  if (halves.length > 2) {
    return false
  }
  const left = halves[0] ? halves[0].split(":") : []
  const right = halves[1] ? halves[1].split(":") : []
  const groups = [...left, ...right]
  if (!groups.every((group) => /^[0-9a-fA-F]{1,4}$/.test(group))) {
    return false
  }
  return halves.length === 2 ? groups.length < 8 : groups.length === 8
}

function isUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return Boolean(url.protocol)
  } catch {
    return false
  }
}

function rebaseFieldPath(field: FormField, path: string): FormField {
  return rebaseFieldPathDeep(field, field.path, path)
}

function rebaseFieldPathDeep(
  field: FormField,
  from: string,
  to: string
): FormField {
  const rebased: FormField = {
    ...field,
    path: replacePathPrefix(field.path, from, to),
  }
  if (field.children) {
    rebased.children = field.children.map((child) =>
      rebaseFieldPathDeep(child, from, to)
    )
  }
  if (field.options) {
    rebased.options = field.options.map((option) => {
      const rebasedOption = { ...option }
      if (option.field) {
        rebasedOption.field = rebaseFieldPathDeep(option.field, from, to)
      }
      return rebasedOption
    })
  }
  return rebased
}

function replacePathPrefix(path: string, from: string, to: string): string {
  return path === from ||
    path.startsWith(`${from}.`) ||
    path.startsWith(`${from}[`)
    ? `${to}${path.slice(from.length)}`
    : path
}

export function updateFieldValue(
  state: readonly FieldState[],
  index: number,
  path: readonly string[],
  value: FieldValue
): FormState {
  const newState = [...state]
  newState[index] = updateFieldStateDeep(
    newState[index]!,
    path,
    0,
    (fieldState) => ({
      ...fieldState,
      value,
    })
  )
  return newState
}

export function toggleOption(
  state: readonly FieldState[],
  index: number,
  path: readonly string[],
  enabled: boolean
): FormState {
  const newState = [...state]
  newState[index] = updateFieldStateDeep(
    newState[index]!,
    path,
    0,
    (fieldState) => ({
      ...fieldState,
      enabled,
    })
  )
  return newState
}

export function selectVariantCase(
  state: readonly FieldState[],
  index: number,
  path: readonly string[],
  caseName: string
): FormState {
  const newState = [...state]
  newState[index] = updateFieldStateDeep(
    newState[index]!,
    path,
    0,
    (fieldState) => ({
      ...fieldState,
      selectedCase: caseName,
    })
  )
  return newState
}

export function addArrayItem(
  state: readonly FieldState[],
  index: number,
  path: readonly string[],
  templateField: FormField
): FormState {
  const newState = [...state]
  newState[index] = updateFieldStateDeep(
    newState[index]!,
    path,
    0,
    (fieldState) => ({
      ...fieldState,
      items: [...(fieldState.items ?? []), createFieldState(templateField)],
    })
  )
  return newState
}

export function removeArrayItem(
  state: readonly FieldState[],
  index: number,
  path: readonly string[],
  itemIndex: number
): FormState {
  const newState = [...state]
  newState[index] = updateFieldStateDeep(
    newState[index]!,
    path,
    0,
    (fieldState) => ({
      ...fieldState,
      items: (fieldState.items ?? []).filter(
        (_, candidateIndex) => candidateIndex !== itemIndex
      ),
    })
  )
  return newState
}

export function safeJsonDisplay(value: unknown, indent = 2): string {
  return JSON.stringify(value, displayReplacer, indent)
}

function createFieldState(field: FormField): FieldState {
  switch (field.kind) {
    case "text":
    case "principal":
      return { value: "" }
    case "number":
    case "bigint":
      return { value: "0" }
    case "boolean":
      return { value: false }
    case "blob":
      return { value: "" }
    case "null":
      return { value: null }
    case "option": {
      const inner = field.children?.[0]
      return {
        value: null,
        enabled: false,
        inner: inner ? createFieldState(inner) : { value: null },
      }
    }
    case "array":
      return {
        value: null,
        items: [],
      }
    case "tuple": {
      const children: Record<string, FieldState> = {}
      for (const child of field.children ?? []) {
        children[child.name] = createFieldState(child)
      }
      return { value: null, children }
    }
    case "record": {
      const children: Record<string, FieldState> = {}
      for (const child of field.children ?? []) {
        children[child.name] = createFieldState(child)
      }
      return { value: null, children }
    }
    case "variant": {
      const firstOption = field.options?.[0]
      const cases: Record<string, FieldState> = {}
      for (const option of field.options ?? []) {
        cases[option.name] = option.field
          ? createFieldState(option.field)
          : { value: null }
      }
      return {
        value: null,
        selectedCase: firstOption?.name ?? "",
        cases,
      }
    }
    case "unsupported":
      return { value: null }
  }
}

function updateFieldStateDeep(
  current: FieldState,
  path: readonly string[],
  depth: number,
  updater: (fieldState: FieldState) => FieldState
): FieldState {
  if (depth >= path.length) {
    return updater(current)
  }

  const segment = path[depth]!

  if (current.children && segment in current.children) {
    return {
      ...current,
      children: {
        ...current.children,
        [segment]: updateFieldStateDeep(
          current.children[segment]!,
          path,
          depth + 1,
          updater
        ),
      },
    }
  }

  if (segment === "__inner" && current.inner) {
    return {
      ...current,
      inner: updateFieldStateDeep(current.inner, path, depth + 1, updater),
    }
  }

  if (segment.startsWith("__item_") && current.items) {
    const itemIndex = Number.parseInt(segment.slice(7), 10)
    if (
      Number.isInteger(itemIndex) &&
      itemIndex >= 0 &&
      itemIndex < current.items.length
    ) {
      const items = [...current.items]
      items[itemIndex] = updateFieldStateDeep(
        items[itemIndex]!,
        path,
        depth + 1,
        updater
      )
      return { ...current, items }
    }
  }

  if (segment.startsWith("__case_") && current.cases) {
    const caseName = segment.slice(7)
    if (caseName in current.cases) {
      return {
        ...current,
        cases: {
          ...current.cases,
          [caseName]: updateFieldStateDeep(
            current.cases[caseName]!,
            path,
            depth + 1,
            updater
          ),
        },
      }
    }
  }

  return current
}

function parseNumberField(state: FieldState, field: FormField): number {
  const text = String(state.value ?? "")
  const value = Number(text)
  if (!Number.isFinite(value)) {
    throw new FormStateError(
      field.path,
      `invalid number ${JSON.stringify(text)}`
    )
  }
  return value
}

function parseBigIntField(state: FieldState, field: FormField): bigint {
  const text = String(state.value ?? "")
  try {
    return BigInt(text)
  } catch {
    throw new FormStateError(
      field.path,
      `invalid bigint ${JSON.stringify(text)}`
    )
  }
}

function parseBlobField(state: FieldState, field: FormField): Uint8Array {
  const hex = String(state.value ?? "")
  if (!hex) {
    return new Uint8Array(0)
  }
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw new FormStateError(
      field.path,
      `invalid hex blob ${JSON.stringify(hex)}`
    )
  }
  const bytes = new Uint8Array(hex.length / 2)
  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16)
  }
  return bytes
}

function displayReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return `${value.toString()}n`
  }
  if (value instanceof Uint8Array) {
    const hex = Array.from(value, (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("")
    return `hex:${hex}`
  }
  return value
}
