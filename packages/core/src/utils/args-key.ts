import { IDL } from "@icp-sdk/core/candid"

/**
 * The query key has to name the Candid value a call sends: one key for
 * arguments that send the same bytes, and different keys for arguments that
 * send different bytes. The JSON of the JavaScript value does neither where a
 * reactor takes one Candid value in several forms:
 *
 * - A blob. IDL.encode takes one as a `Uint8Array` or as a plain array of
 *   bytes, and a DisplayReactor also takes hex text, with or without `0x`, in
 *   either case. All of them send the same bytes, but their JSON differs
 *   (`{"0":1,"1":2}`, `[1,2]`, `"0102"`), so each form got a cache entry of its
 *   own. The key writes every blob the reactor would send as a
 *   {@link BlobKey} instead, which `generateKey` writes as its lowercase hex
 *   behind a tag no argument can produce.
 * - In a DisplayReactor, an `opt` given bare, as `[value]`, or as `null`,
 *   `undefined` or `[]` for none, and a variant with or without its `_type`.
 *   The key writes each in the form the display codecs return it: none left
 *   out, as an absent record field is, the value bare, and the variant with its
 *   `_type`. An opt whose own values can be null, such as an opt of an opt,
 *   keeps the wrapper around its value, so that the value stays apart from
 *   none.
 * - In a DisplayReactor, a `vec record { text; T }` given as an object. The
 *   codec sends its entries in the object's order, but `generateKey` sorts an
 *   object's keys, so two orders of one map, which send different vectors,
 *   shared a key. The key lists the entries in order, as the pairs they are
 *   sent as.
 *
 * Only a position the method's Candid type names is rewritten: a `number[]` is
 * a blob as a `vec nat8`, and the same array passed as a `vec nat16` keeps the
 * key it had. So does a value the reactor would refuse as a blob, such as hex
 * text given to a Reactor, and every argument that holds none of these.
 *
 * Internal: deliberately not re-exported from `utils/index`.
 */

/** The bytes of a blob argument, as the query key records them. */
export class BlobKey {
  constructor(readonly hex: string) {}
}

/**
 * The shapes a DisplayReactor's codecs take that IDL.encode does not. Passed
 * in by the DisplayReactor rather than imported here, so a Reactor does not
 * load the display codecs.
 */
export interface DisplayArgShapes {
  /** Is `[inner]` the wrapper around one value of an `opt` of `elemType`? */
  isOptionalWrapper(elemType: IDL.Type, inner: unknown): boolean
  /** Is `type` a `record { text; T }`, whose vector is also taken as an object? */
  isTextKeyedPair(type: IDL.Type): type is IDL.TupleClass<unknown[]>
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key)

const isByte = (type: IDL.Type): boolean =>
  type instanceof IDL.FixedNatClass && type._bits === 8

const isBlob = (type: IDL.Type): boolean =>
  type instanceof IDL.VecClass && isByte(type._type)

/** Is `type` an `opt`, behind any recursive alias? As the variant codec asks. */
const isOpt = (type: IDL.Type | undefined): boolean =>
  type instanceof IDL.OptClass ||
  (type instanceof IDL.RecClass && isOpt(type.getType()))

/**
 * Can a value of `type` itself be null: an `opt`'s none, `null`, or
 * `reserved`, which takes any value? Behind any recursive alias.
 */
const holdsNull = (type: IDL.Type | undefined): boolean =>
  type instanceof IDL.OptClass ||
  type instanceof IDL.NullClass ||
  type instanceof IDL.ReservedClass ||
  (type instanceof IDL.RecClass && holdsNull(type.getType()))

/** Two lowercase hex digits for each byte value. */
const HEX_BYTES = Array.from({ length: 256 }, (_, byte) =>
  byte.toString(16).padStart(2, "0")
)

/**
 * Lowercase hex of 8-bit elements. `& 0xff` reads an `Int8Array`'s -1 as the
 * byte 0xff that IDL.encode sends for it.
 */
function toHex(bytes: ArrayLike<number>): string {
  let hex = ""
  for (let i = 0; i < bytes.length; i++) hex += HEX_BYTES[bytes[i] & 0xff]
  return hex
}

/** The hex of an array of bytes, or `undefined` if an element is not a byte. */
function byteArrayHex(items: unknown[]): string | undefined {
  for (let i = 0; i < items.length; i++) {
    const byte = items[i]
    if (
      typeof byte !== "number" ||
      !Number.isInteger(byte) ||
      byte < 0 ||
      byte > 255
    ) {
      return undefined
    }
  }
  return toHex(items as number[])
}

/** Hex text as `hexToUint8Array` reads it: an optional `0x`, then the digits. */
const HEX_TEXT = /^(?:0x)?([0-9a-f]*)$/i

/** Can a value of `type` hold a value of a type `isTarget` picks, anywhere? */
function reaches(
  type: IDL.Type,
  isTarget: (type: IDL.Type) => boolean,
  seen: Set<IDL.Type>
): boolean {
  if (seen.has(type)) return false
  seen.add(type)
  if (isTarget(type)) return true
  if (type instanceof IDL.RecClass) {
    const inner = type.getType()
    return inner !== undefined && reaches(inner, isTarget, seen)
  }
  if (type instanceof IDL.VecClass || type instanceof IDL.OptClass) {
    return reaches(type._type, isTarget, seen)
  }
  // A tuple is a RecordClass too.
  if (type instanceof IDL.RecordClass || type instanceof IDL.VariantClass) {
    return type._fields.some(([, field]) => reaches(field, isTarget, seen))
  }
  // A func or service reference, a principal and the primitives hold nothing.
  return false
}

/** `items` with `map` applied, or `items` itself when nothing changed. */
function mapItems(
  items: unknown[],
  map: (item: unknown, index: number) => unknown
): unknown[] {
  let copy: unknown[] | undefined
  for (let i = 0; i < items.length; i++) {
    const item = map(items[i], i)
    if (!Object.is(item, items[i])) (copy ??= items.slice())[i] = item
  }
  return copy ?? items
}

/**
 * Walks an argument alongside its Candid type and writes each value that has
 * more than one form in one form: a blob as a {@link BlobKey}, and in a
 * DisplayReactor also an opt, a variant and a vector given as an object. It
 * reads the value the way the reactor encodes it: as IDL.encode does, or,
 * given the display shapes, as a DisplayReactor's codecs do. Everything that
 * holds none of these, and every value already in that form, it returns as the
 * same object, so it serialises exactly as before.
 */
export class ArgsKeyVisitor extends IDL.Visitor<unknown, unknown> {
  /** Per type, whether a value of it can hold something the key rewrites. */
  private readonly rewritten = new WeakMap<IDL.Type, boolean>()

  constructor(private readonly display?: DisplayArgShapes) {
    super()
  }

  /** `args` with each value that `argTypes` give more than one form rewritten. */
  public keyArgs(argTypes: readonly IDL.Type[], args: unknown[]): unknown[] {
    if (!Array.isArray(args) || !argTypes.some((type) => this.rewrites(type))) {
      return args
    }
    try {
      return mapItems(args, (arg, i) =>
        i < argTypes.length ? argTypes[i].accept(this, arg) : arg
      )
    } catch {
      // Too deep to walk: the key stays what it always was.
      return args
    }
  }

  /** Can a value of `type` hold anything the key rewrites? */
  private rewrites(type: IDL.Type): boolean {
    let rewrites = this.rewritten.get(type)
    if (rewrites === undefined) {
      rewrites = reaches(type, (t) => this.isRewritten(t), new Set())
      this.rewritten.set(type, rewrites)
    }
    return rewrites
  }

  /** Does the key write a value of `type` itself in a form of its own? */
  private isRewritten(type: IDL.Type): boolean {
    if (isBlob(type)) return true
    if (!this.display) return false
    return (
      type instanceof IDL.OptClass ||
      type instanceof IDL.VariantClass ||
      (type instanceof IDL.VecClass && this.display.isTextKeyedPair(type._type))
    )
  }

  /** The hex of a blob the reactor sends, or `undefined` for another value. */
  private blobHex(value: unknown): string | undefined {
    if (Array.isArray(value)) return byteArrayHex(value)
    if (this.display) {
      if (typeof value === "string") {
        const digits = HEX_TEXT.exec(value)?.[1]
        return digits !== undefined && digits.length % 2 === 0
          ? digits.toLowerCase()
          : undefined
      }
      // The blob codec takes a Uint8Array, not any 8-bit typed array.
      return value instanceof Uint8Array ? toHex(value) : undefined
    }
    // IDL.encode takes any typed array of 8-bit elements.
    return ArrayBuffer.isView(value) &&
      (value as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT === 1
      ? toHex(value as unknown as ArrayLike<number>)
      : undefined
  }

  private mapFields(
    value: Record<string, unknown>,
    fields: ReadonlyArray<[string, IDL.Type]>
  ): Record<string, unknown> {
    let copy: Record<string, unknown> | undefined
    for (const [label, type] of fields) {
      if (!hasOwn(value, label) || !this.rewrites(type)) continue
      const field = type.accept(this, value[label])
      if (Object.is(field, value[label])) continue
      copy ??= { ...value }
      // Defined, not assigned, so that a field named `__proto__` stays a field.
      Object.defineProperty(copy, label, {
        value: field,
        enumerable: true,
        writable: true,
        configurable: true,
      })
    }
    return copy ?? value
  }

  private mapArm(
    value: Record<string, unknown>,
    fields: Array<[string, IDL.Type]>,
    tag: string
  ): Record<string, unknown> {
    const arm = fields.find(([label]) => label === tag)
    return arm ? this.mapFields(value, [arm]) : value
  }

  visitType<T>(_t: IDL.Type<T>, value: unknown): unknown {
    return value
  }

  visitRec<T>(
    _t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    value: unknown
  ): unknown {
    return ty.accept(this, value)
  }

  visitVec<T>(
    _t: IDL.VecClass<T>,
    elemType: IDL.Type<T>,
    value: unknown
  ): unknown {
    if (isByte(elemType)) {
      const hex = this.blobHex(value)
      return hex === undefined ? value : new BlobKey(hex)
    }
    // A DisplayReactor also takes a `vec record { text; T }` as an object keyed
    // by the text, and sends `Object.entries` of it: the pairs in the object's
    // order. The key lists the same pairs in the same order, so it matches the
    // vector sent, and the array of pairs, which sends the same one.
    if (this.display?.isTextKeyedPair(elemType) && isPlainObject(value)) {
      const pairs: unknown[] = Object.entries(value)
      return this.rewrites(elemType)
        ? pairs.map((pair) => elemType.accept(this, pair))
        : pairs
    }
    if (!this.rewrites(elemType) || !Array.isArray(value)) return value
    return mapItems(value, (item) => elemType.accept(this, item))
  }

  visitOpt<T>(
    _t: IDL.OptClass<T>,
    elemType: IDL.Type<T>,
    value: unknown
  ): unknown {
    // IDL.encode takes `[]` for none and `[value]` for some.
    if (!this.display) {
      return this.rewrites(elemType) &&
        Array.isArray(value) &&
        value.length === 1
        ? mapItems(value, (item) => elemType.accept(this, item))
        : value
    }
    // The optional codec takes null, undefined and `[]` for none. The key
    // leaves none out, as it leaves out an absent record field, which the
    // codec reads as none too.
    if (
      value === null ||
      value === undefined ||
      (Array.isArray(value) && value.length === 0)
    ) {
      return undefined
    }
    // `[inner]` is the wrapper around the value where the codec reads it so,
    // and otherwise the value itself.
    const wrapped =
      Array.isArray(value) &&
      value.length === 1 &&
      this.display.isOptionalWrapper(elemType, value[0])
    const inner: unknown = wrapped ? (value as unknown[])[0] : value
    const key = this.rewrites(elemType) ? elemType.accept(this, inner) : inner
    // The value bare, as the codec returns it. Where that could read as none,
    // the key keeps the wrapper: for every value of a type whose own values
    // can be null (an opt, `null`, `reserved`), and for a null the codec
    // refuses, such as `[null]` for an `opt nat`.
    if (key !== null && key !== undefined && !holdsNull(elemType)) return key
    return wrapped && Object.is(key, inner) ? value : [key]
  }

  visitRecord(
    _t: IDL.RecordClass,
    fields: Array<[string, IDL.Type]>,
    value: unknown
  ): unknown {
    return isPlainObject(value) ? this.mapFields(value, fields) : value
  }

  visitTuple<T extends any[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type[],
    value: unknown
  ): unknown {
    if (!Array.isArray(value)) return value
    return mapItems(value, (item, i) =>
      i < components.length && this.rewrites(components[i])
        ? components[i].accept(this, item)
        : item
    )
  }

  visitVariant(
    _t: IDL.VariantClass,
    fields: Array<[string, IDL.Type]>,
    value: unknown
  ): unknown {
    if (!isPlainObject(value)) return value
    if (!this.display) {
      const tags = Object.keys(value)
      return tags.length === 1 ? this.mapArm(value, fields, tags[0]) : value
    }
    // The variant codec names the arm in `_type`, or else by the one key the
    // value has.
    let tag: unknown = value._type
    if (!("_type" in value)) {
      const tags = Object.keys(value)
      if (tags.length !== 1) return value
      tag = tags[0]
    }
    const arm =
      typeof tag === "string" && tag !== "_type"
        ? fields.find(([label]) => label === tag)
        : undefined
    if (!arm) return value
    const [label, type] = arm
    const payload = hasOwn(value, label) ? value[label] : undefined
    // What the codec sends: nothing for a null arm, whatever the payload, and
    // nothing for a missing payload unless the arm is an opt, whose none that
    // is.
    const sent =
      !(type instanceof IDL.NullClass) &&
      ((payload !== null && payload !== undefined) || isOpt(type))
    const key = !sent
      ? undefined
      : this.rewrites(type)
        ? type.accept(this, payload)
        : payload
    // `{ _type, [label]: payload }`, as the codec returns a variant.
    if (
      value._type === label &&
      Object.is(payload, key) &&
      Object.keys(value).every((name) => name === "_type" || name === label)
    ) {
      return value
    }
    // A computed key defines the field, also for an arm named `__proto__`.
    return key === undefined ? { _type: label } : { _type: label, [label]: key }
  }
}

/** The args of a Reactor's query key, read as IDL.encode takes them. */
export const candidArgsKey = new ArgsKeyVisitor()
