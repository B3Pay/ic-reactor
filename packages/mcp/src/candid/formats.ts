// How each Candid leaf is written in JSON, shared by the reader's messages and
// the JSON Schemas, so the two describe one format; and the bounds on what one
// tool input may hold.

/** The bounds of one tool input, checked while it is read. */
export const INPUT_LIMITS = {
  /** Levels of JSON nesting below the input object (an argument is at 1). */
  maxDepth: 64,
  /** JSON values read in the whole input. */
  maxValues: 100_000,
  /** Elements of one vec. */
  maxVecLength: 10_000,
  /** Characters of one decimal integer string. */
  maxDigits: 10_000,
  /** Issues reported for one input before reading stops. */
  maxIssues: 20,
} as const

export const EXAMPLE_PRINCIPAL = "ryjl3-tyaaa-aaaaa-aaaba-cai"

export const FIXED_RANGES: Readonly<Record<string, readonly [number, number]>> =
  {
    nat8: [0, 255],
    nat16: [0, 65_535],
    nat32: [0, 4_294_967_295],
    int8: [-128, 127],
    int16: [-32_768, 32_767],
    int32: [-2_147_483_648, 2_147_483_647],
  }

export interface BigRange {
  readonly min?: bigint
  readonly max?: bigint
  /** The range for people: "0 to 18446744073709551615". */
  readonly text: string
}

export const BIG_RANGES: Readonly<Record<string, BigRange>> = {
  nat: { min: 0n, text: "0 or more" },
  int: { text: "any integer" },
  nat64: { min: 0n, max: 2n ** 64n - 1n, text: "0 to 18446744073709551615" },
  int64: {
    min: -(2n ** 63n),
    max: 2n ** 63n - 1n,
    text: "-9223372036854775808 to 9223372036854775807",
  },
}

/** The strings a float is written as when JSON has no number for it. */
export const FLOAT_WORDS = ["NaN", "Infinity", "-Infinity", "-0"] as const

/** A JSON Schema for a primitive Candid type, with its format in `description`. */
export function leafSchema(primitive: string): { [key: string]: unknown } {
  const fixed = FIXED_RANGES[primitive]
  if (fixed !== undefined) {
    return {
      type: "integer",
      description: `${primitive}, an integer from ${fixed[0]} to ${fixed[1]}`,
    }
  }
  const big = BIG_RANGES[primitive]
  if (big !== undefined) {
    return {
      type: "string",
      pattern: big.min === 0n ? "^[0-9]+$" : "^-?[0-9]+$",
      description: `${primitive}, as a decimal string (${big.text})`,
    }
  }
  switch (primitive) {
    case "bool":
      return { type: "boolean", description: "bool" }
    case "null":
      return { type: "null", description: "null" }
    case "text":
      return { type: "string", description: "text" }
    case "principal":
      return {
        type: "string",
        description: `principal, as text such as ${EXAMPLE_PRINCIPAL}`,
      }
    case "float32":
    case "float64":
      return {
        anyOf: [{ type: "number" }, { type: "string", enum: [...FLOAT_WORDS] }],
        description:
          primitive === "float32"
            ? 'float32, a JSON number that 32 bits hold exactly, such as 0.5 (or "NaN", "Infinity", "-Infinity", "-0")'
            : 'float64, a JSON number (or "NaN", "Infinity", "-Infinity", "-0")',
      }
    case "reserved":
      return { description: "reserved: any value; it is sent as null" }
    case "empty":
      return {
        description: "empty: this type has no values, so nothing can be sent",
      }
    default:
      return { description: primitive }
  }
}

/** A string for a message: quoted, escaped, and cut when long. */
export function quote(text: string, max = 60): string {
  return JSON.stringify(text.length > max ? `${text.slice(0, max)}…` : text)
}

/** What a JSON value is, for a message: "the string \"abc\"", "an array of 3". */
export function got(json: unknown): string {
  if (json === undefined) return "nothing"
  if (json === null) return "null"
  if (typeof json === "boolean") return String(json)
  if (typeof json === "number") return `the number ${String(json)}`
  if (typeof json === "string") return `the string ${quote(json)}`
  if (Array.isArray(json)) return `an array of ${json.length}`
  if (typeof json === "object") return "an object"
  return typeof json
}

/** Names for a message, quoted, the list cut after `max`. */
export function nameList(names: readonly string[], max = 20): string {
  const shown = names.slice(0, max).map((name) => quote(name, 40))
  const rest = names.length - shown.length
  return rest > 0 ? `${shown.join(", ")} and ${rest} more` : shown.join(", ")
}

/**
 * A name close to `wrong` among `names`: the same letters and digits, case,
 * `_` and `-` aside (`Amount`, `fromSubaccount` for `from_subaccount`).
 */
export function closeName(
  wrong: string,
  names: readonly string[]
): string | undefined {
  const plain = (text: string): string =>
    text.toLowerCase().replace(/[^a-z0-9]/g, "")
  const target = plain(wrong)
  if (target === "") return undefined
  return names.find((name) => name !== wrong && plain(name) === target)
}

/** The index of the first lone surrogate in `text`, or -1 when it has none. */
export function loneSurrogateAt(text: string): number {
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        i++
        continue
      }
      return i
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) return i
  }
  return -1
}
