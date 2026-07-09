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
  compositeQuery,
  oneway,
  record,
  service,
  text,
  tuple,
  variant,
  vec,
  type AnyMethodSchema,
  type AnySchema,
  type ServiceSchema,
} from "../schema.js"
import {
  candidFieldLabel,
  candidTypeTextId,
  candidTypeTextRef,
} from "./candid-format.js"
import { fieldObjectKey, ProgramIrGraph } from "./program-ir.js"
import { ProgramSemanticsGraph } from "./semantics.js"
import type {
  CandidMethodMode,
  ProgramFieldIR,
  ProgramIR,
  ProgramTypeRefIR,
  TypeId,
} from "./types.js"

export type RuntimeSchemaSet = {
  typeSchemas: Map<string, AnySchema>
  methodSchemas: Map<string, AnyMethodSchema>
  service: ServiceSchema<any> | null
}

export function irToSchema(ir: ProgramIR): RuntimeSchemaSet {
  const context = new SchemaContext(ir)
  return context.build()
}

class SchemaContext {
  readonly graph: ProgramIrGraph
  readonly semantics: ProgramSemanticsGraph
  readonly #schemas = new Map<string, AnySchema>()

  constructor(readonly ir: ProgramIR) {
    this.graph = new ProgramIrGraph(ir)
    this.semantics = new ProgramSemanticsGraph(this.graph)
  }

  build(): RuntimeSchemaSet {
    for (const declaration of this.graph.declarations()) {
      this.namedSchema(declaration.name)
    }

    const methodSchemas = new Map<string, AnyMethodSchema>()
    const methods: Record<string, AnyMethodSchema> = {}

    for (const methodId of this.graph.actorMethodIds()) {
      const method = this.graph.method(methodId)
      const args = method.args.map((arg) =>
        this.typeRefSchema(arg.type, arg.metadata?.docs)
      )
      const returns = method.returns.map((arg) =>
        this.typeRefSchema(arg.type, arg.metadata?.docs)
      )
      const schema = methodSchema(method.mode, args, returns)
      methodSchemas.set(method.name, schema)
      methods[method.name] = schema
    }

    return {
      typeSchemas: this.#schemas,
      methodSchemas,
      service: this.graph.actor() ? service(methods) : null,
    }
  }

  namedSchema(name: string): AnySchema {
    const existing = this.#schemas.get(name)
    if (existing) {
      return existing
    }

    const id = this.graph.declarationIdByName(name)
    if (id === undefined) {
      throw new Error(`Candid type ${JSON.stringify(name)} not found`)
    }

    const declaration = this.graph.declaration(id)
    const schema = this.typeIdSchema(
      declaration.type,
      declaration.metadata?.docs
    ).meta({
      name,
      candidType: candidTypeTextId(
        this.graph,
        this.semantics,
        declaration.type,
        new Set([id])
      ),
    })
    this.#schemas.set(name, schema)
    return schema
  }

  typeRefSchema(
    reference: ProgramTypeRefIR,
    docs?: readonly string[]
  ): AnySchema {
    const schema =
      reference.kind === "decl"
        ? lazy(
            () => this.namedSchema(this.graph.declaration(reference.id).name),
            this.graph.declaration(reference.id).name
          )
        : this.typeIdSchema(reference.id)

    const description = docText(docs)
    return schema.meta({
      ...(description ? { docs: description } : {}),
      candidType: candidTypeTextRef(this.graph, this.semantics, reference),
    })
  }

  typeIdSchema(id: TypeId, docs?: readonly string[]): AnySchema {
    const schema = this.typeSchemaInner(id)
    const description = docText(docs)
    return schema.meta({
      ...(description ? { docs: description } : {}),
      candidType: candidTypeTextId(this.graph, this.semantics, id),
    })
  }

  private typeSchemaInner(id: TypeId): AnySchema {
    if (this.semantics.isBlobType(id)) {
      return blob()
    }

    const type = this.graph.typeKind(id)
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
      case "opt":
        return opt(this.typeRefSchema(type.inner)).optional()
      case "vec":
        return vec(this.typeRefSchema(type.inner))
      case "record":
        if (this.semantics.isTupleType(id)) {
          return tuple(
            type.fields.map((field) =>
              this.typeRefSchema(field.type, field.metadata?.docs)
            )
          )
        }
        return record(
          fieldsToSchemaMap(type.fields, this),
          fieldsToCandidLabelMap(type.fields)
        )
      case "variant":
        return variant(
          fieldsToSchemaMap(type.fields, this),
          fieldsToCandidLabelMap(type.fields)
        )
      case "reserved":
      case "empty":
      case "func":
      case "service":
        return unsupportedSchema(
          type.kind,
          candidTypeTextId(this.graph, this.semantics, id)
        )
    }
  }
}

function methodSchema(
  mode: CandidMethodMode,
  args: readonly AnySchema[],
  returns: readonly AnySchema[]
): AnyMethodSchema {
  switch (mode) {
    case "query":
      return query(args, returns)
    case "composite_query":
      return compositeQuery(args, returns)
    case "update":
      return updateMethod(args, returns)
    case "oneway":
      if (returns.length > 0) {
        throw new Error("Candid oneway methods cannot return values")
      }
      return oneway(args)
  }
}

function docText(docs: readonly string[] | undefined): string | undefined {
  return docs && docs.length > 0 ? docs.join("\n") : undefined
}

function fieldsToSchemaMap(
  fields: readonly ProgramFieldIR[],
  context: SchemaContext
): Record<string, AnySchema> {
  const out: Record<string, AnySchema> = {}
  for (const field of fields) {
    out[fieldObjectKey(field)] = context.typeRefSchema(
      field.type,
      field.metadata?.docs
    )
  }
  return out
}

function fieldsToCandidLabelMap(
  fields: readonly ProgramFieldIR[]
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const field of fields) {
    out[fieldObjectKey(field)] = candidFieldLabel(field)
  }
  return out
}

function unsupportedSchema(kind: string, candidType: string): AnySchema {
  const reason = `Candid ${kind} values are not supported by the runtime schema codec yet`
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
