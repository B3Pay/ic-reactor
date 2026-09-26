import { IDL } from "@icp-sdk/core/candid"
import { hasLabel } from "./label.js"

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
 * - In a DisplayReactor, a `vec record { text; T }` given as an object or a
 *   `Map`. The codec sends its entries in the object's order, but
 *   `generateKey` sorts an object's keys, so two orders of one map, which
 *   send different vectors, shared a key, and the JSON of a Map is `{}`. The
 *   key lists the entries in order, as the pairs they are sent as.
 * - In a DisplayReactor, a record or a variant given as an object that is not
 *   plain, such as a class instance. The codecs read its declared labels
 *   wherever it holds them, a getter over a private field included, but JSON
 *   writes only its own enumerable properties, in their own order. The key
 *   reads the labels as the codecs do, into the plain object they send.
 * - A record field defined as not enumerable, and in a DisplayReactor also a
 *   variant's `_type` or payload. IDL.encode and the codecs send it, but JSON
 *   leaves it out. The key copies it into a plain object that writes it.
 * - In a DisplayReactor, a float or an integer of 32 bits or fewer given as
 *   numeric text, and a `Principal` given as the object. The key writes the
 *   number the text spells and the principal's text, the forms the codecs
 *   return. And in both reactors, any value of `reserved`, which sends
 *   nothing: the key writes `null`, the value `reserved` decodes to.
 *
 * The JSON of a value the reactor refuses can also be the JSON of one it
 * takes, so the refused call was answered from the other's cache entry
 * instead of failing. `undefined` where Candid `null` is required is written
 * as `null` in an array; a bigint is written as its decimal text (#515), the
 * key of that text for a `text` or for a DisplayReactor's number; text given
 * to a Reactor's integer is the key of the bigint it spells; a plain
 * `{ __principal__ }` object, which is what JSON.parse returns for a
 * Principal, is the key of the Principal; and a Reactor's variant with an
 * `undefined` beside its arm is the key of the arm alone. The key checks each
 * value of a primitive type, each record, and each variant a Reactor sends, as
 * the codec or IDL.encode does, and writes one they refuse as a
 * {@link RefusedKey}, behind a tag no value they take can produce.
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

/** An argument value the reactor refuses, as the query key records it. */
export class RefusedKey {
  constructor(readonly value: unknown) {}
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
  /**
   * The pairs the codec of a `vec record { text; T }` sends for an object
   * given for it, in the order it sends them.
   */
  textMapEntries(value: object): unknown[]
  /**
   * The number the codec of a float, or of an integer of 32 bits or fewer,
   * sends for `text`. Throws for text the codec refuses.
   */
  numberOfText(
    type: IDL.FixedNatClass | IDL.FixedIntClass | IDL.FloatClass,
    text: string
  ): number
  /** Is `value` a Principal the principal codec takes as it is? */
  isPrincipal(value: unknown): value is { toText(): string }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key)

/** Does JSON write `key` of `value`: is it an own enumerable property? */
const isEnumerable = (value: object, key: string): boolean =>
  Object.prototype.propertyIsEnumerable.call(value, key)

const isByte = (type: IDL.Type): boolean =>
  type instanceof IDL.FixedNatClass && type._bits === 8

const isBlob = (type: IDL.Type): boolean =>
  type instanceof IDL.VecClass && isByte(type._type)

/** Is `type` an `opt`, behind any recursive alias? As the variant codec asks. */
const isOpt = (type: IDL.Type | undefined): boolean =>
  type instanceof IDL.OptClass ||
  (type instanceof IDL.RecClass && isOpt(type.getType()))

/** Is `type` `reserved`, behind any recursive alias? */
const isReserved = (type: IDL.Type | undefined): boolean =>
  type instanceof IDL.ReservedClass ||
  (type instanceof IDL.RecClass && isReserved(type.getType()))

/** An integer type a DisplayReactor takes as a number or as text. */
const isSmallInteger = (
  type: IDL.Type
): type is IDL.FixedNatClass | IDL.FixedIntClass =>
  (type instanceof IDL.FixedNatClass || type instanceof IDL.FixedIntClass) &&
  type._bits <= 32

/** Does IDL.encode take `value` as a principal? It asks nothing more. */
const isPrincipalLike = (value: unknown): boolean =>
  Boolean(value && (value as { _isPrincipal?: unknown })._isPrincipal)

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

/** Sets `label` on `record`, a field named `__proto__` included. */
function setField(
  record: Record<string, unknown>,
  label: string,
  value: unknown
): void {
  if (label !== "__proto__") {
    record[label] = value
    return
  }
  // Defined, not assigned, so that a field named `__proto__` stays a field.
  Object.defineProperty(record, label, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  })
}

/**
 * The labels of `fields` that `value` holds, read as the display codecs read
 * them (see `hasLabel`), into a plain object that has no other key.
 */
function readLabels(
  value: object,
  fields: ReadonlyArray<[string, IDL.Type]>
): Record<string, unknown> {
  const record: Record<string, unknown> = {}
  for (const [label] of fields) {
    if (hasLabel(value, label)) {
      setField(record, label, (value as Record<string, unknown>)[label])
    }
  }
  return record
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
 * more than one form in one form: a blob as a {@link BlobKey}, a record
 * without its undeclared fields, `reserved` as `null`, and in a DisplayReactor
 * also an opt, a variant, a vector given as an object, numeric text and a
 * Principal. A value the reactor refuses it writes as a {@link RefusedKey}. It
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

  /**
   * Does the key check a value of `type` itself, or write it in a form of its
   * own? A float is checked only in a DisplayReactor: a Reactor takes it only
   * as a number, and no value it refuses there has a number's JSON.
   */
  private isRewritten(type: IDL.Type): boolean {
    if (
      isBlob(type) ||
      type instanceof IDL.NullClass ||
      type instanceof IDL.BoolClass ||
      type instanceof IDL.TextClass ||
      type instanceof IDL.NatClass ||
      type instanceof IDL.IntClass ||
      type instanceof IDL.FixedNatClass ||
      type instanceof IDL.FixedIntClass ||
      type instanceof IDL.PrincipalClass ||
      type instanceof IDL.ReservedClass ||
      type instanceof IDL.VariantClass ||
      // For the fields it does not declare. A tuple is a RecordClass too, but
      // it is an array.
      (type instanceof IDL.RecordClass && !(type instanceof IDL.TupleClass))
    ) {
      return true
    }
    return (
      !!this.display &&
      (type instanceof IDL.FloatClass ||
        type instanceof IDL.OptClass ||
        (type instanceof IDL.VecClass &&
          this.display.isTextKeyedPair(type._type)))
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

  /**
   * `value` with each of `fields` it has rewritten. With `onlyDeclared`, the
   * fields a record does not declare are left out as well: neither IDL.encode
   * nor the record codec sends them. A field that is not enumerable, which
   * both send but JSON does not write, is copied into a plain object that
   * writes it.
   */
  private mapFields(
    value: Record<string, unknown>,
    fields: ReadonlyArray<[string, IDL.Type]>,
    onlyDeclared = false
  ): Record<string, unknown> {
    let copy: Record<string, unknown> | undefined
    let declared = 0
    // IDL.encode asks `hasOwnProperty` and the record codec `hasLabel`, so
    // both send a field defined as not enumerable. JSON leaves it out, so two
    // records that differed only there, and sent different bytes, shared a
    // key.
    let hidden = false
    for (const [label, type] of fields) {
      let field: unknown
      if (hasOwn(value, label)) {
        declared++
        if (!isEnumerable(value, label)) hidden = true
        if (!this.rewrites(type)) continue
        field = type.accept(this, value[label])
        if (Object.is(field, value[label])) continue
      } else if (this.display && isReserved(type)) {
        // The record codec reads an absent field as undefined, which
        // `reserved` takes. IDL.encode refuses the absent field itself.
        field = null
      } else {
        continue
      }
      copy ??= { ...value }
      setField(copy, label, field)
    }
    if (hidden || (onlyDeclared && Object.keys(value).length > declared)) {
      const record: Record<string, unknown> = {}
      for (const [label] of fields) {
        // The copy is a spread, which holds only enumerable fields, so a
        // hidden one it did not rewrite is still read from the value.
        if (copy && hasOwn(copy, label)) setField(record, label, copy[label])
        else if (hasOwn(value, label)) setField(record, label, value[label])
      }
      return record
    }
    return copy ?? value
  }

  visitType<T>(_t: IDL.Type<T>, value: unknown): unknown {
    return value
  }

  // Each primitive is checked by its JavaScript type, as the codec or
  // IDL.encode checks it first. A value of another type is refused whatever
  // else is true of it. A value of the right type that is still refused, such
  // as -1 for a `nat` or "abc" for a DisplayReactor's `nat`, keeps its key: no
  // value taken there has the same JSON.

  visitNull(_t: IDL.NullClass, value: unknown): unknown {
    return value === null ? value : new RefusedKey(value)
  }

  visitBool(_t: IDL.BoolClass, value: unknown): unknown {
    return typeof value === "boolean" ? value : new RefusedKey(value)
  }

  visitText(_t: IDL.TextClass, value: unknown): unknown {
    return typeof value === "string" ? value : new RefusedKey(value)
  }

  visitNat(t: IDL.NatClass, value: unknown): unknown {
    return this.keyInteger(t, value)
  }

  visitInt(t: IDL.IntClass, value: unknown): unknown {
    return this.keyInteger(t, value)
  }

  visitFixedNat(t: IDL.FixedNatClass, value: unknown): unknown {
    return this.keyInteger(t, value)
  }

  visitFixedInt(t: IDL.FixedIntClass, value: unknown): unknown {
    return this.keyInteger(t, value)
  }

  visitFloat(t: IDL.FloatClass, value: unknown): unknown {
    return this.display ? this.keyDisplayNumber(t, value) : value
  }

  visitPrincipal(_t: IDL.PrincipalClass, value: unknown): unknown {
    if (!this.display) {
      return isPrincipalLike(value) ? value : new RefusedKey(value)
    }
    // The principal codec takes text, which it returns, and a Principal.
    if (typeof value === "string") return value
    return this.display.isPrincipal(value)
      ? value.toText()
      : new RefusedKey(value)
  }

  visitReserved(_t: IDL.ReservedClass, _value: unknown): unknown {
    // `reserved` takes any value and sends none.
    return null
  }

  private keyInteger(
    t: IDL.NatClass | IDL.IntClass | IDL.FixedNatClass | IDL.FixedIntClass,
    value: unknown
  ): unknown {
    if (!this.display) {
      // IDL.encode takes a bigint or a number.
      return typeof value === "bigint" || typeof value === "number"
        ? value
        : new RefusedKey(value)
    }
    if (isSmallInteger(t)) return this.keyDisplayNumber(t, value)
    // The codec of `nat`, `int` and the 64-bit integers takes only text.
    return typeof value === "string" ? value : new RefusedKey(value)
  }

  /**
   * A float or an integer of 32 bits or fewer in a DisplayReactor, whose
   * codec takes a number or text and returns a number. Text is keyed as the
   * number it sends, and an integer's -0 as the 0 it sends.
   */
  private keyDisplayNumber(
    t: IDL.FixedNatClass | IDL.FixedIntClass | IDL.FloatClass,
    value: unknown
  ): unknown {
    let number: number
    if (typeof value === "number") {
      number = value
    } else if (typeof value !== "string") {
      return new RefusedKey(value)
    } else {
      try {
        number = this.display!.numberOfText(t, value)
      } catch {
        // Refused text keeps its key, which no number has.
        return value
      }
    }
    return number === 0 && !(t instanceof IDL.FloatClass) ? 0 : number
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
    // by the text, or as a Map, and sends its entries: the pairs in the
    // object's order, or the Map's. The key lists the same pairs in the same
    // order, so it matches the vector sent, and the array of pairs, which
    // sends the same one. The codec takes every object that is not an array
    // so, a boxed `true` included, whose JSON is that of the `true` it
    // refuses.
    if (
      this.display?.isTextKeyedPair(elemType) &&
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      const pairs = this.display.textMapEntries(value)
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
    // IDL.encode takes only an object, and `null` only for a record without
    // fields, where it takes any object: a boxed `true` or a Date, whose JSON
    // is that of the `true` or the text it refuses. The record codec passes
    // any other value to it as it is.
    if (typeof value !== "object") return new RefusedKey(value)
    if (value === null) return fields.length > 0 ? new RefusedKey(value) : value
    if (!isPlainObject(value)) {
      if (!this.display) return value
      // The record codec reads each field of any object as `hasLabel` finds
      // it, a getter a class declares over a private field included, and
      // sends the plain record it builds. JSON writes only own enumerable
      // properties, so two instances holding their fields so were keyed `{}`
      // whatever they sent. The key reads the fields the same way.
      return this.mapFields(readLabels(value, fields), fields)
    }
    // IDL.encode calls the record's own `hasOwnProperty` for each field, which
    // an object without Object.prototype does not have. The record codec
    // reads its fields another way.
    if (
      !this.display &&
      fields.length > 0 &&
      Object.getPrototypeOf(value) === null
    ) {
      return new RefusedKey(value)
    }
    return this.mapFields(value, fields, true)
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
    if (!this.display) {
      if (!isPlainObject(value)) return value
      // IDL.encode takes one own key, `undefined` or not, which names an arm,
      // and calls the value's own `hasOwnProperty`. JSON leaves out a key whose
      // value is undefined, so `{ A: 1, B: undefined }`, which it refuses, had
      // the key of `{ A: 1 }`.
      const tags = Object.keys(value)
      const arm =
        tags.length === 1 && Object.getPrototypeOf(value) !== null
          ? fields.find(([label]) => label === tags[0])
          : undefined
      return arm ? this.mapFields(value, [arm]) : new RefusedKey(value)
    }
    // The variant codec reads any object but an array or a Principal, a class
    // instance included, whose `_type` and payload can be getters that JSON
    // does not write.
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      this.display.isPrincipal(value)
    ) {
      return value
    }
    const variant = value as Record<string, unknown>
    // The variant codec names the arm in `_type`, or else by the one key the
    // value has.
    let tag: unknown = variant._type
    if (!("_type" in variant)) {
      const tags = Object.keys(variant)
      if (tags.length !== 1) return value
      tag = tags[0]
    }
    const arm =
      typeof tag === "string" && tag !== "_type"
        ? fields.find(([label]) => label === tag)
        : undefined
    if (!arm) return value
    const [label, type] = arm
    const payload = hasLabel(variant, label) ? variant[label] : undefined
    // What the codec sends: nothing for a null or a reserved arm, whatever the
    // payload, and nothing for a missing payload unless the arm is an opt,
    // whose none that is.
    const sent =
      !(type instanceof IDL.NullClass) &&
      !isReserved(type) &&
      ((payload !== null && payload !== undefined) || isOpt(type))
    const key = !sent
      ? undefined
      : this.rewrites(type)
        ? type.accept(this, payload)
        : payload
    // `{ _type, [label]: payload }`, as the codec returns a variant, and as
    // JSON writes it: a `_type` or a payload that is not enumerable is left
    // out of the JSON, though the codec reads it.
    if (
      isPlainObject(variant) &&
      variant._type === label &&
      Object.is(payload, key) &&
      isEnumerable(variant, "_type") &&
      (key === undefined || isEnumerable(variant, label)) &&
      Object.keys(variant).every((name) => name === "_type" || name === label)
    ) {
      return value
    }
    // A computed key defines the field, also for an arm named `__proto__`.
    return key === undefined ? { _type: label } : { _type: label, [label]: key }
  }
}

/** The args of a Reactor's query key, read as IDL.encode takes them. */
export const candidArgsKey = new ArgsKeyVisitor()
