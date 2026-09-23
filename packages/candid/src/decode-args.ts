import { IDL, idlLabelToId } from "@icp-sdk/core/candid"
import type { PipeArrayBuffer } from "@icp-sdk/core/candid"

const PROTO = "__proto__"

/**
 * `__proto__` named by its id. A record field called `_<id>_` is the field
 * with that id, so under this name it is the same field on the wire.
 */
const PROTO_BY_ID = `_${idlLabelToId(PROTO)}_`

/**
 * A record type with a field named `__proto__`, built with the field under
 * {@link PROTO_BY_ID}. It decodes the field as an own property of that name,
 * then gives it its own name back.
 */
class ProtoFieldRecordClass extends IDL.RecordClass {
  public override decodeValue(
    b: PipeArrayBuffer,
    t: IDL.Type
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(super.decodeValue(b, t)).map(([key, value]) => [
        key === PROTO_BY_ID ? PROTO : key,
        value,
      ])
    )
  }
}

/** Whether a record in `type`, at any depth, has a field named `__proto__`. */
function hasProtoField(type: IDL.Type, seen: Set<IDL.Type>): boolean {
  if (seen.has(type)) return false
  seen.add(type)
  if (type instanceof IDL.RecClass) {
    const inner = type.getType()
    return inner !== undefined && hasProtoField(inner, seen)
  }
  if (type instanceof IDL.RecordClass) {
    return type._fields.some(
      ([key, field]) => key === PROTO || hasProtoField(field, seen)
    )
  }
  if (type instanceof IDL.VariantClass) {
    return type._fields.some(([, field]) => hasProtoField(field, seen))
  }
  if (type instanceof IDL.OptClass || type instanceof IDL.VecClass) {
    return hasProtoField(type._type, seen)
  }
  return false
}

/**
 * A copy of `type` in which each record with a field named `__proto__` is a
 * {@link ProtoFieldRecordClass}. `recs` maps each recursive type to its copy.
 */
function keepProtoFields(
  type: IDL.Type,
  recs: Map<IDL.RecClass, IDL.RecClass>
): IDL.Type {
  if (type instanceof IDL.RecClass) {
    let rec = recs.get(type)
    if (!rec) {
      rec = IDL.Rec()
      recs.set(type, rec)
      const inner = type.getType()
      if (inner) rec.fill(keepProtoFields(inner, recs) as IDL.ConstructType)
    }
    return rec
  }
  // A tuple is a record too, with fields named by position.
  if (type instanceof IDL.TupleClass) {
    return IDL.Tuple(
      ...type._fields.map(([, field]) => keepProtoFields(field, recs))
    )
  }
  if (type instanceof IDL.RecordClass) {
    const fields = Object.fromEntries(
      type._fields.map(([key, field]) => [
        key === PROTO ? PROTO_BY_ID : key,
        keepProtoFields(field, recs),
      ])
    )
    return type._fields.some(([key]) => key === PROTO)
      ? new ProtoFieldRecordClass(fields)
      : IDL.Record(fields)
  }
  // IDL.decode keeps a variant tag named `__proto__`: it builds the value with
  // a computed key. Only the payloads can hold such a record.
  if (type instanceof IDL.VariantClass) {
    return IDL.Variant(
      Object.fromEntries(
        type._fields.map(([key, field]) => [key, keepProtoFields(field, recs)])
      )
    )
  }
  if (type instanceof IDL.OptClass) {
    return IDL.Opt(keepProtoFields(type._type, recs))
  }
  if (type instanceof IDL.VecClass) {
    return IDL.Vec(keepProtoFields(type._type, recs))
  }
  return type
}

/**
 * `IDL.decode`, keeping a record field named `__proto__`.
 *
 * `@icp-sdk/core`'s record decoder (6.1.0) assigns each field to a plain
 * object, and assigning to `__proto__` sets the object's prototype. The value
 * of such a field was lost, or became the prototype when it was an object
 * (#634, U5). Types that have one are decoded with the field under its id and
 * renamed back, so it is an own property. Other types decode as before.
 *
 * Internal: deliberately not re-exported from the package.
 */
export function decodeArgs(types: IDL.Type[], bytes: Uint8Array): unknown[] {
  const seen = new Set<IDL.Type>()
  if (!types.some((type) => hasProtoField(type, seen))) {
    return IDL.decode(types, bytes)
  }
  const recs = new Map<IDL.RecClass, IDL.RecClass>()
  return IDL.decode(
    types.map((type) => keepProtoFields(type, recs)),
    bytes
  )
}
