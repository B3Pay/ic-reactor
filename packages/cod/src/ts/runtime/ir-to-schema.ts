import {
  Schema,
  blob,
  bool,
  float32,
  float64,
  int,
  int8,
  int16,
  int32,
  int64,
  lazy,
  method as updateMethod,
  nat,
  nat8,
  nat16,
  nat32,
  nat64,
  null_,
  opt,
  principal,
  query,
  record,
  service,
  text,
  variant,
  vec,
  type AnyMethodSchema,
  type AnySchema,
  type ServiceSchema,
} from "../schema.js"
import type { CandidFieldIR, CandidProgramIR, CandidTypeIR } from "./types.js"

export type RuntimeSchemaSet = {
  typeSchemas: Map<string, AnySchema>
  methodSchemas: Map<string, AnyMethodSchema>
  service: ServiceSchema<any>
}

export function irToSchema(ir: CandidProgramIR): RuntimeSchemaSet {
  const context = new SchemaContext(ir)
  return context.build()
}

class SchemaContext {
  readonly #types = new Map<string, CandidTypeIR>()
  readonly #typeDocs = new Map<string, string[]>()
  readonly #schemas = new Map<string, AnySchema>()

  constructor(readonly ir: CandidProgramIR) {
    for (const declaration of ir.types) {
      this.#types.set(declaration.name, declaration.type)
      if (declaration.docs?.length) {
        this.#typeDocs.set(declaration.name, declaration.docs)
      }
    }
  }

  build(): RuntimeSchemaSet {
    for (const declaration of this.ir.types) {
      this.namedSchema(declaration.name)
    }

    const methodSchemas = new Map<string, AnyMethodSchema>()
    const methods: Record<string, AnyMethodSchema> = {}

    for (const method of this.ir.service.methods) {
      const args = method.args.map((arg) => this.typeSchema(arg.type, arg.docs))
      const returns = method.returns.map((arg) =>
        this.typeSchema(arg.type, arg.docs)
      )
      const schema =
        method.mode === "query" || method.mode === "composite_query"
          ? query(args, returns)
          : updateMethod(args, returns)
      methodSchemas.set(method.name, schema)
      methods[method.name] = schema
    }

    return {
      typeSchemas: this.#schemas,
      methodSchemas,
      service: service(methods),
    }
  }

  namedSchema(name: string): AnySchema {
    const existing = this.#schemas.get(name)
    if (existing) {
      return existing
    }

    const type = this.#types.get(name)
    if (!type) {
      throw new Error(`Candid type ${JSON.stringify(name)} not found`)
    }

    const schema = this.typeSchema(type, this.#typeDocs.get(name)).meta({
      name,
      candidType: candidTypeText(type, this, new Set([name])),
    })
    this.#schemas.set(name, schema)
    return schema
  }

  typeSchema(type: CandidTypeIR, docs?: readonly string[]): AnySchema {
    const schema = this.typeSchemaInner(type)
    const description = docText(docs)
    return schema.meta({
      ...(description ? { docs: description } : {}),
      candidType: candidTypeText(type, this),
    })
  }

  typeByName(name: string): CandidTypeIR | undefined {
    return this.#types.get(name)
  }

  private typeSchemaInner(type: CandidTypeIR): AnySchema {
    switch (type.kind) {
      case "null":
        return null_()
      case "bool":
        return bool()
      case "text":
        return text()
      case "nat":
        return nat()
      case "int":
        return int()
      case "nat8":
        return nat8()
      case "nat16":
        return nat16()
      case "nat32":
        return nat32()
      case "nat64":
        return nat64()
      case "int8":
        return int8()
      case "int16":
        return int16()
      case "int32":
        return int32()
      case "int64":
        return int64()
      case "float32":
        return float32()
      case "float64":
        return float64()
      case "principal":
        return principal()
      case "blob":
        return blob()
      case "opt":
        return opt(this.typeSchema(type.inner)).optional()
      case "vec":
        return vec(this.typeSchema(type.inner))
      case "record":
        return record(fieldsToSchemaMap(type.fields, this))
      case "variant":
        return variant(fieldsToSchemaMap(type.fields, this))
      case "ref":
        return lazy(() => this.namedSchema(type.name), type.name).meta({
          name: type.name,
          candidType: type.name,
        })
      case "reserved":
      case "empty":
      case "func":
      case "service":
        return unsupportedSchema(type, this)
    }
  }
}

function docText(docs: readonly string[] | undefined): string | undefined {
  return docs && docs.length > 0 ? docs.join("\n") : undefined
}

function fieldsToSchemaMap(
  fields: readonly CandidFieldIR[],
  context: SchemaContext
): Record<string, AnySchema> {
  const out: Record<string, AnySchema> = {}
  for (const field of fields) {
    out[field.tsKey] = context.typeSchema(field.type, field.docs)
  }
  return out
}

function unsupportedSchema(
  type: CandidTypeIR,
  context: SchemaContext
): AnySchema {
  const candidType = candidTypeText(type, context)
  const reason = `Candid ${type.kind} values are not supported by the runtime schema codec yet`
  return new Schema<unknown, unknown>({
    did: () => candidType,
    toWire: () => {
      throw new Error(reason)
    },
    fromWire: () => {
      throw new Error(reason)
    },
    wireToText: () => {
      throw new Error(reason)
    },
    textToWire: () => {
      throw new Error(reason)
    },
    codecs: [],
  }).meta({ candidType, unsupported: true })
}

export function candidTypeText(
  type: CandidTypeIR,
  context?: { typeByName(name: string): CandidTypeIR | undefined },
  refs: Set<string> = new Set()
): string {
  switch (type.kind) {
    case "null":
    case "bool":
    case "text":
    case "nat":
    case "int":
    case "nat8":
    case "nat16":
    case "nat32":
    case "nat64":
    case "int8":
    case "int16":
    case "int32":
    case "int64":
    case "float32":
    case "float64":
    case "principal":
    case "blob":
    case "reserved":
    case "empty":
      return type.kind
    case "opt":
      return `opt ${candidTypeText(type.inner, context, refs)}`
    case "vec":
      return `vec ${candidTypeText(type.inner, context, refs)}`
    case "record":
      return `record { ${type.fields.map((field) => fieldTypeText(field, context, refs)).join("; ")} }`
    case "variant":
      return `variant { ${type.fields.map((field) => fieldTypeText(field, context, refs)).join("; ")} }`
    case "ref": {
      if (!context || refs.has(type.name)) {
        return type.name
      }
      const target = context.typeByName(type.name)
      if (!target) {
        return type.name
      }
      return candidTypeText(target, context, new Set([...refs, type.name]))
    }
    case "func": {
      const args = type.args
        .map((arg) => candidTypeText(arg.type, context, refs))
        .join(", ")
      const returns = type.returns
        .map((arg) => candidTypeText(arg.type, context, refs))
        .join(", ")
      const mode = type.mode && type.mode !== "update" ? ` ${type.mode}` : ""
      return `func (${args}) -> (${returns})${mode}`
    }
    case "service":
      return `service { ${type.methods
        .map((method) => {
          const args = method.args
            .map((arg) => candidTypeText(arg.type, context, refs))
            .join(", ")
          const returns = method.returns
            .map((arg) => candidTypeText(arg.type, context, refs))
            .join(", ")
          const mode = method.mode !== "update" ? ` ${method.mode}` : ""
          return `${candidLabel(method.name)} : (${args}) -> (${returns})${mode}`
        })
        .join("; ")} }`
  }
}

function fieldTypeText(
  field: CandidFieldIR,
  context: { typeByName(name: string): CandidTypeIR | undefined } | undefined,
  refs: Set<string>
): string {
  const type = candidTypeText(field.type, context, refs)
  if (!field.name && /^_\d+_$/.test(field.tsKey)) {
    return `${field.candidId} : ${type}`
  }
  if (field.type.kind === "null") {
    return candidLabel(field.name ?? field.tsKey)
  }
  return `${candidLabel(field.name ?? field.tsKey)} : ${type}`
}

function candidLabel(value: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) ? value : JSON.stringify(value)
}
