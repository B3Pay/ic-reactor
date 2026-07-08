import { fieldObjectKey, isBlobTypeId, ProgramIrGraph } from "./program-ir.js"
import type {
  ProgramArgIR,
  ProgramFieldIR,
  ProgramMethodIR,
  ProgramTypeRefIR,
  TypeId,
} from "./types.js"

/**
 * Error thrown when an app-level value does not match a DID-derived schema.
 */
export class CandidValidationError extends Error {
  readonly path: string
  readonly expected: string
  readonly actual: string

  constructor(path: string, expected: string, value: unknown) {
    const actual = actualType(value)
    super(
      `Candid validation failed at ${path}: expected ${expected}, received ${actual}`
    )
    this.name = "CandidValidationError"
    this.path = path
    this.expected = expected
    this.actual = actual
  }
}

export function validateMethodArgs(
  method: ProgramMethodIR,
  args: readonly unknown[],
  graph: ProgramIrGraph
): void {
  if (!Array.isArray(args)) {
    throw new CandidValidationError(
      "args",
      `tuple with ${method.args.length} value(s)`,
      args
    )
  }
  if (args.length !== method.args.length) {
    throw new CandidValidationError(
      "args",
      `tuple with ${method.args.length} value(s)`,
      args
    )
  }

  method.args.forEach((arg, index) => {
    validateArg(arg, args[index], graph, `args[${index}]`)
  })
}

export function validateMethodReturn(
  method: ProgramMethodIR,
  value: unknown,
  graph: ProgramIrGraph
): void {
  if (method.returns.length === 0) {
    if (value !== undefined) {
      throw new CandidValidationError("returns", "undefined", value)
    }
    return
  }

  if (method.returns.length === 1) {
    validateArg(method.returns[0]!, value, graph, "returns[0]")
    return
  }

  if (!Array.isArray(value) || value.length !== method.returns.length) {
    throw new CandidValidationError(
      "returns",
      `tuple with ${method.returns.length} value(s)`,
      value
    )
  }

  method.returns.forEach((arg, index) => {
    validateArg(arg, value[index], graph, `returns[${index}]`)
  })
}

function validateArg(
  arg: ProgramArgIR,
  value: unknown,
  graph: ProgramIrGraph,
  path: string
): void {
  validateTypeRef(arg.type, value, graph, path, new WeakSet<object>())
}

function validateTypeRef(
  reference: ProgramTypeRefIR,
  value: unknown,
  graph: ProgramIrGraph,
  path: string,
  seen: WeakSet<object>
): void {
  validateTypeId(graph.resolveRef(reference), value, graph, path, seen)
}

function validateTypeId(
  id: TypeId,
  value: unknown,
  graph: ProgramIrGraph,
  path: string,
  seen: WeakSet<object>
): void {
  if (isBlobTypeId(graph, id)) {
    if (!isBlobLike(value)) fail(path, "blob", value)
    return
  }

  if (value && typeof value === "object") {
    if (seen.has(value)) {
      return
    }
    seen.add(value)
  }

  const type = graph.typeKind(id)
  switch (type.kind) {
    case "null":
      if (value !== null) fail(path, "null", value)
      return
    case "bool":
      if (typeof value !== "boolean") fail(path, "boolean", value)
      return
    case "text":
      if (typeof value !== "string") fail(path, "string", value)
      return
    case "nat":
      if (typeof value !== "bigint" || value < 0n)
        fail(path, "non-negative bigint", value)
      return
    case "int":
      if (typeof value !== "bigint") fail(path, "bigint", value)
      return
    case "nat8":
      validateBoundedNumber(path, value, "nat8", 0, 255)
      return
    case "nat16":
      validateBoundedNumber(path, value, "nat16", 0, 65_535)
      return
    case "nat32":
      validateBoundedNumber(path, value, "nat32", 0, 4_294_967_295)
      return
    case "nat64":
      validateBoundedBigInt(
        path,
        value,
        "nat64",
        0n,
        18_446_744_073_709_551_615n
      )
      return
    case "int8":
      validateBoundedNumber(path, value, "int8", -128, 127)
      return
    case "int16":
      validateBoundedNumber(path, value, "int16", -32_768, 32_767)
      return
    case "int32":
      validateBoundedNumber(path, value, "int32", -2_147_483_648, 2_147_483_647)
      return
    case "int64":
      validateBoundedBigInt(
        path,
        value,
        "int64",
        -9_223_372_036_854_775_808n,
        9_223_372_036_854_775_807n
      )
      return
    case "float32":
    case "float64":
      if (typeof value !== "number") fail(path, "number", value)
      return
    case "principal":
      if (!isPrincipalLike(value)) fail(path, "principal", value)
      return
    case "opt":
      if (value === null || value === undefined) return
      validateTypeRef(type.inner, value, graph, path, seen)
      return
    case "vec":
      if (!Array.isArray(value)) fail(path, "array", value)
      value.forEach((item, index) => {
        validateTypeRef(type.inner, item, graph, `${path}[${index}]`, seen)
      })
      return
    case "record":
      validateRecord(type.fields, value, graph, path, seen)
      return
    case "variant":
      validateVariant(type.fields, value, graph, path, seen)
      return
    case "reserved":
      return
    case "empty":
      fail(path, "empty", value)
      return
    case "func":
    case "service":
      fail(path, `supported ${type.kind} value`, value)
      return
  }
}

function validateRecord(
  fields: readonly ProgramFieldIR[],
  value: unknown,
  graph: ProgramIrGraph,
  path: string,
  seen: WeakSet<object>
): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(path, "record object", value)
  }

  const record = value as Record<string, unknown>
  for (const field of fields) {
    const key = fieldObjectKey(field)
    const childPath = `${path}${pathSegment(key)}`
    const hasField = Object.prototype.hasOwnProperty.call(record, key)
    const fieldValue = hasField ? record[key] : undefined

    if (!hasField && !isOptionalRef(field.type, graph)) {
      fail(childPath, fieldExpected(field, graph), fieldValue)
    }

    validateTypeRef(field.type, fieldValue, graph, childPath, seen)
  }
}

function validateVariant(
  fields: readonly ProgramFieldIR[],
  value: unknown,
  graph: ProgramIrGraph,
  path: string,
  seen: WeakSet<object>
): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(path, variantExpected(fields), value)
  }

  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length !== 1) {
    fail(path, variantExpected(fields), value)
  }

  const [caseName, caseValue] = entries[0]!
  const field = fields.find(
    (candidate) => fieldObjectKey(candidate) === caseName
  )
  if (!field) {
    fail(`${path}${pathSegment(caseName)}`, variantExpected(fields), caseValue)
  }

  validateTypeRef(
    field.type,
    caseValue,
    graph,
    `${path}${pathSegment(caseName)}`,
    seen
  )
}

function validateBoundedNumber(
  path: string,
  value: unknown,
  expected: string,
  min: number,
  max: number
): void {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    fail(path, expected, value)
  }
}

function validateBoundedBigInt(
  path: string,
  value: unknown,
  expected: string,
  min: bigint,
  max: bigint
): void {
  if (typeof value !== "bigint" || value < min || value > max) {
    fail(path, expected, value)
  }
}

function isPrincipalLike(value: unknown): boolean {
  return (
    typeof value === "string" ||
    (!!value &&
      typeof value === "object" &&
      typeof (value as { toText?: unknown }).toText === "function")
  )
}

function isBlobLike(value: unknown): boolean {
  return (
    value instanceof Uint8Array ||
    (Array.isArray(value) &&
      value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255))
  )
}

function isOptionalRef(
  reference: ProgramTypeRefIR,
  graph: ProgramIrGraph
): boolean {
  return graph.typeKind(graph.resolveRef(reference)).kind === "opt"
}

function fieldExpected(field: ProgramFieldIR, graph: ProgramIrGraph): string {
  if (field.type.kind === "decl") {
    return graph.declaration(field.type.id).name
  }
  if (isBlobTypeId(graph, field.type.id)) {
    return "blob"
  }
  return graph.typeKind(field.type.id).kind
}

function variantExpected(fields: readonly ProgramFieldIR[]): string {
  return `variant case ${fields.map((field) => JSON.stringify(fieldObjectKey(field))).join(" | ")}`
}

function pathSegment(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? `.${key}`
    : `[${JSON.stringify(key)}]`
}

function fail(path: string, expected: string, value: unknown): never {
  throw new CandidValidationError(path, expected, value)
}

function actualType(value: unknown): string {
  if (value === null) return "null"
  if (value instanceof Uint8Array) return "Uint8Array"
  if (Array.isArray(value)) return "array"
  return typeof value
}
