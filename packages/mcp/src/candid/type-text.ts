// Compact Candid type text for tool descriptions and messages:
//   record { owner : principal; subaccount : opt blob }
//   (record { … }) -> (variant { Ok : nat; Err : variant { … } })
// Structural: declaration names are not in a schema, so a type is spelled out.
// A recursive occurrence is `…`; so is whatever does not fit `maxChars`.
import type { AnyFieldSchema, MethodMode, ServiceMethod } from "@meantjs/schema"
import { candidLabel, candidName } from "./candid-text.ts"
import {
  armsOf,
  elementsOf,
  fieldsOf,
  isTagOnly,
  methodsOf,
  resolve,
} from "./schema-walk.ts"

export interface TypeTextOptions {
  /** The longest text returned, in UTF-16 code units. */
  readonly maxChars?: number
}

/** `maxChars` when none is given: a type in a message or a description. */
export const DEFAULT_TYPE_CHARS = 200
/** `maxChars` when none is given: a method's whole signature. */
export const DEFAULT_SIGNATURE_CHARS = 1000

// The deepest brace nesting written before parts become `…`.
const MAX_NESTING = 32

/** A type as compact Candid text: `record { owner : principal; subaccount : opt blob }`. */
export function typeText(
  schema: AnyFieldSchema,
  options?: TypeTextOptions
): string {
  const max = charLimit(options?.maxChars, DEFAULT_TYPE_CHARS)
  return fit((writer) => writer.type(schema, 0), max)
}

/** A method's signature: `(record { … }) -> (nat) query`. */
export function signatureText(
  method: Pick<ServiceMethod, "args" | "results" | "mode">,
  options?: TypeTextOptions
): string {
  const max = charLimit(options?.maxChars, DEFAULT_SIGNATURE_CHARS)
  return fit(
    (writer) => writer.signature(method.args, method.results, method.mode, 0),
    max
  )
}

function charLimit(given: number | undefined, fallback: number): number {
  if (given === undefined) return fallback
  if (!Number.isSafeInteger(given) || given < 1) {
    throw new TypeError(`maxChars must be a positive integer, got ${given}`)
  }
  return given
}

/**
 * The whole text when it fits; else the deepest nesting that fits, every
 * group below it written `{ … }`. When not even the top level's items fit,
 * as many of them as fit, then `…`; else the outline, cut at `max`. Each try
 * stops writing once past its limit, so a try costs about `max` characters.
 */
function fit(write: (writer: TypeWriter) => void, max: number): string {
  for (let nesting = MAX_NESTING; nesting >= 1; nesting--) {
    const writer = new TypeWriter(nesting, max, false, 0)
    write(writer)
    if (!writer.over) return writer.text()
  }
  // A signature's arguments are cut before its results are written: leave
  // them headroom, more on each try, until the results fit too. A writer that
  // went past its limit skipped parts, so only one that did not is taken.
  let headroom = 0
  for (let attempt = 0; attempt < 6; attempt++) {
    const writer = new TypeWriter(1, max, true, headroom)
    write(writer)
    if (!writer.over && writer.shortBy === 0) return writer.text()
    const short = writer.over ? writer.text().length - max : writer.shortBy
    if (headroom >= max) break
    headroom = Math.max(headroom * 2, headroom + short)
  }
  const outline = new TypeWriter(0, max, false, 0)
  write(outline)
  const text = outline.text()
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

class TypeWriter {
  private parts: string[] = []
  private length = 0
  /**
   * How many characters a group lacked for even its first item, which a cut
   * then lost: the outline says more than such a text.
   */
  shortBy = 0
  // Characters the open groups still need: their closing brackets.
  private reserved = 0
  // Characters to leave free while a signature's arguments are written.
  private room = 0
  // Nodes being written: meeting one again is recursion.
  private readonly active = new Set<object>()

  /**
   * `nesting`: the brace depth below which a group is `{ … }`. `cut`: end a
   * group with `…` at the first item that would pass `limit`, instead of
   * writing on past it. `headroom`: what a signature's arguments leave free
   * for its results.
   */
  constructor(
    private readonly nesting: number,
    private readonly limit: number,
    private readonly cut: boolean,
    private readonly headroom: number
  ) {}

  get over(): boolean {
    return this.length > this.limit
  }

  text(): string {
    return this.parts.join("")
  }

  private put(text: string): void {
    this.parts.push(text)
    this.length += text.length
  }

  type(schema: AnyFieldSchema, depth: number): void {
    if (this.over) return
    const node = resolve(schema)
    switch (node.kind) {
      case "primitive":
        return this.put(node.primitive)
      case "blob":
        return this.put("blob")
      case "unit":
        return this.put("record {}")
    }
    if (this.active.has(node)) return this.put("…")
    this.active.add(node)
    try {
      switch (node.kind) {
        case "opt":
          this.put("opt ")
          return this.type(node.inner, depth)
        case "vec":
          this.put("vec ")
          return this.type(node.inner, depth)
        case "record":
          return this.group("record", fieldsOf(node), depth, ([key, field]) => {
            this.put(`${candidLabel(key)} : `)
            this.type(field, depth + 1)
          })
        case "tuple":
          return this.group("record", elementsOf(node), depth, (element) =>
            this.type(element, depth + 1)
          )
        case "variant":
          return this.group("variant", armsOf(node), depth, ([tag, arm]) => {
            this.put(candidLabel(tag))
            if (isTagOnly(arm)) return
            this.put(" : ")
            this.type(arm, depth + 1)
          })
        case "func":
          if (depth >= this.nesting) return this.put("func …")
          this.put("func ")
          return this.signature(node.args, node.results, node.mode, depth + 1)
        case "service":
          return this.group("service", methodsOf(node), depth, ([name, fn]) => {
            this.put(`${candidName(name)} : `)
            if (fn.kind === "func") {
              this.signature(fn.args, fn.results, fn.mode, depth + 1)
            } else {
              this.type(fn, depth + 1)
            }
          })
      }
    } finally {
      this.active.delete(node)
    }
  }

  signature(
    args: readonly AnyFieldSchema[],
    results: readonly AnyFieldSchema[],
    mode: MethodMode,
    depth: number
  ): void {
    if (depth === 0) this.room = this.headroom
    this.items("(", args, ", ", ")", (arg) => this.type(arg, depth))
    this.room = 0
    this.put(" -> ")
    this.items("(", results, ", ", ")", (result) => this.type(result, depth))
    if (mode !== "update") this.put(` ${mode}`)
  }

  private group<T>(
    keyword: string,
    items: readonly T[],
    depth: number,
    item: (entry: T) => void
  ): void {
    if (items.length === 0) return this.put(`${keyword} {}`)
    if (depth >= this.nesting) return this.put(`${keyword} { … }`)
    this.items(`${keyword} { `, items, "; ", " }", item)
  }

  private items<T>(
    open: string,
    items: readonly T[],
    separator: string,
    close: string,
    item: (entry: T) => void
  ): void {
    this.put(open)
    this.reserved += close.length
    for (let i = 0; i < items.length && !this.over; i++) {
      const parts = this.parts.length
      const length = this.length
      if (i > 0) this.put(separator)
      item(items[i] as T)
      // Keep room for this group's `; …` and every open group's bracket.
      const short = this.length + this.reserved + 3 + this.room - this.limit
      if (this.cut && short > 0) {
        if (i === 0) this.shortBy = Math.max(this.shortBy, short)
        this.parts = this.parts.slice(0, parts)
        this.length = length
        this.put(i > 0 ? `${separator}…` : "…")
        break
      }
    }
    this.reserved -= close.length
    this.put(close)
  }
}
