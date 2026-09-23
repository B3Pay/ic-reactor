import { IDL } from "@icp-sdk/core/candid"

/**
 * The query key has to name the Candid value a call sends, and a blob is where
 * the JavaScript value and the Candid value part most. IDL.encode takes a blob
 * as a `Uint8Array` or as a plain array of bytes, and a DisplayReactor also
 * takes hex text, with or without `0x`, in either case. All of them send the
 * same bytes, but their JSON differs (`{"0":1,"1":2}`, `[1,2]`, `"0102"`), so
 * each form got a cache entry of its own. The key writes every blob the
 * reactor would send as a {@link BlobKey} instead, which `generateKey` writes
 * as its lowercase hex behind a tag no argument can produce.
 *
 * Only a position the method's Candid type says is a blob is rewritten: a
 * `number[]` is a blob as a `vec nat8`, and the same array passed as a
 * `vec nat16` keeps the key it had. So does a value the reactor would refuse
 * as a blob, such as hex text given to a Reactor, and every argument that
 * holds no blob.
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

const blobTypes = new WeakMap<IDL.Type, boolean>()

/** Can a value of `type` hold a blob anywhere? */
function holdsBlob(type: IDL.Type): boolean {
  let holds = blobTypes.get(type)
  if (holds === undefined) {
    holds = reachesBlob(type, new Set())
    blobTypes.set(type, holds)
  }
  return holds
}

function reachesBlob(type: IDL.Type, seen: Set<IDL.Type>): boolean {
  if (seen.has(type)) return false
  seen.add(type)
  if (type instanceof IDL.RecClass) {
    const inner = type.getType()
    return inner !== undefined && reachesBlob(inner, seen)
  }
  if (type instanceof IDL.VecClass) {
    return isByte(type._type) || reachesBlob(type._type, seen)
  }
  if (type instanceof IDL.OptClass) return reachesBlob(type._type, seen)
  // A tuple is a RecordClass too.
  if (type instanceof IDL.RecordClass || type instanceof IDL.VariantClass) {
    return type._fields.some(([, field]) => reachesBlob(field, seen))
  }
  // A func or service reference, a principal and the primitives hold no blob.
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
 * Walks an argument alongside its Candid type and replaces each blob in it
 * with a {@link BlobKey}. It reads the value the way the reactor encodes it:
 * as IDL.encode does, or, given the display shapes, as a DisplayReactor's
 * codecs do. Everything that holds no blob it returns as the same object, so it
 * serialises exactly as before.
 */
export class ArgsKeyVisitor extends IDL.Visitor<unknown, unknown> {
  constructor(private readonly display?: DisplayArgShapes) {
    super()
  }

  /** `args` with each blob that `argTypes` declare replaced by its key. */
  public keyArgs(argTypes: readonly IDL.Type[], args: unknown[]): unknown[] {
    if (!Array.isArray(args) || !argTypes.some(holdsBlob)) return args
    try {
      return mapItems(args, (arg, i) =>
        i < argTypes.length ? argTypes[i].accept(this, arg) : arg
      )
    } catch {
      // Too deep to walk: the key stays what it always was.
      return args
    }
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
      if (!hasOwn(value, label) || !holdsBlob(type)) continue
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
    if (!holdsBlob(elemType)) return value
    if (Array.isArray(value)) {
      return mapItems(value, (item) => elemType.accept(this, item))
    }
    // A DisplayReactor also takes a `vec record { text; T }` as an object
    // keyed by the text.
    if (this.display?.isTextKeyedPair(elemType) && isPlainObject(value)) {
      const valueType = elemType._fields[1][1]
      return this.mapFields(
        value,
        Object.keys(value).map((key): [string, IDL.Type] => [key, valueType])
      )
    }
    return value
  }

  visitOpt<T>(
    _t: IDL.OptClass<T>,
    elemType: IDL.Type<T>,
    value: unknown
  ): unknown {
    if (!holdsBlob(elemType)) return value
    // IDL.encode takes `[]` for none and `[value]` for some.
    if (
      Array.isArray(value) &&
      value.length === 1 &&
      (!this.display || this.display.isOptionalWrapper(elemType, value[0]))
    ) {
      return mapItems(value, (item) => elemType.accept(this, item))
    }
    // A DisplayReactor also takes the value itself, and null or undefined for
    // none.
    if (
      !this.display ||
      value === undefined ||
      value === null ||
      (Array.isArray(value) && value.length === 0)
    ) {
      return value
    }
    return elemType.accept(this, value)
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
      i < components.length && holdsBlob(components[i])
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
    // A DisplayReactor's variant names its arm in `_type`, beside the payload.
    if (this.display && "_type" in value) {
      return typeof value._type === "string"
        ? this.mapArm(value, fields, value._type)
        : value
    }
    const tags = Object.keys(value)
    return tags.length === 1 ? this.mapArm(value, fields, tags[0]) : value
  }
}

/** The args of a Reactor's query key, read as IDL.encode takes them. */
export const candidArgsKey = new ArgsKeyVisitor()
