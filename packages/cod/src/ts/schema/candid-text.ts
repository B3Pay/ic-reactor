import { isHexDigit, isIdentifierChar, isWhitespace } from "./utils.js"

/**
 * Small Candid text parser used by schema-level text conversions.
 */
export class CandidTextParser {
  /** Source text being parsed. */
  readonly input: string

  #position = 0

  /**
   * Creates a parser for Candid text.
   *
   * @param input - Text to parse.
   */
  constructor(input: string) {
    this.input = input
  }

  /**
   * Consumes a reserved word when it appears at the current token boundary.
   *
   * @param word - Word to consume.
   * @returns `true` when the word was consumed.
   */
  consumeWord(word: string): boolean {
    this.skipWhitespace()
    if (!this.input.startsWith(word, this.#position)) {
      return false
    }
    const before = this.input[this.#position - 1]
    const after = this.input[this.#position + word.length]
    if (isIdentifierChar(before) || isIdentifierChar(after)) {
      return false
    }
    this.#position += word.length
    return true
  }

  /**
   * Consumes a reserved word or throws a parser error.
   *
   * @param word - Word expected at the current position.
   * @throws If the word is not present at a token boundary.
   */
  expectWord(word: string): void {
    if (!this.consumeWord(word)) {
      throw this.error(`expected ${word}`)
    }
  }

  /**
   * Consumes a single punctuation character after whitespace.
   *
   * @param char - Character to consume.
   * @returns `true` when the character was consumed.
   */
  consumeChar(char: string): boolean {
    this.skipWhitespace()
    if (this.input[this.#position] !== char) {
      return false
    }
    this.#position += 1
    return true
  }

  /**
   * Consumes a single punctuation character or throws a parser error.
   *
   * @param char - Character expected at the current position.
   * @throws If the character is not present.
   */
  expectChar(char: string): void {
    if (!this.consumeChar(char)) {
      throw this.error(`expected ${JSON.stringify(char)}`)
    }
  }

  /**
   * Verifies that the parser has consumed all non-whitespace input.
   *
   * @throws If additional non-whitespace text remains.
   */
  expectEnd(): void {
    this.skipWhitespace()
    if (this.#position !== this.input.length) {
      throw this.error("expected end of Candid text")
    }
  }

  /**
   * Parses a Candid field or variant label.
   *
   * @returns Parsed label text.
   * @throws If the current token is neither an identifier nor a quoted string.
   */
  parseLabel(): string {
    this.skipWhitespace()
    if (this.input[this.#position] === '"') {
      return this.parseQuotedText()
    }
    const numeric = /^[0-9][0-9_]*/.exec(this.input.slice(this.#position))
    if (numeric) {
      this.#position += numeric[0].length
      return numeric[0].replaceAll("_", "")
    }
    return this.parseIdentifier()
  }

  /**
   * Parses an unquoted Candid identifier.
   *
   * @returns Identifier text.
   * @throws If the current token is not an identifier.
   */
  parseIdentifier(): string {
    this.skipWhitespace()
    const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(
      this.input.slice(this.#position)
    )
    if (!match) {
      throw this.error("expected identifier")
    }
    this.#position += match[0].length
    return match[0]
  }

  /**
   * Parses a decimal integer literal with optional underscore separators.
   *
   * @returns Parsed bigint value.
   * @throws If the current token is not an integer literal.
   */
  parseBigInt(): bigint {
    this.skipWhitespace()
    const match = /^-?[0-9][0-9_]*/.exec(this.input.slice(this.#position))
    if (!match) {
      throw this.error("expected integer")
    }
    this.#position += match[0].length
    return BigInt(match[0].replaceAll("_", ""))
  }

  /**
   * Parses a decimal number literal with optional exponent.
   *
   * @returns Parsed number value.
   * @throws If the current token is not a number literal.
   */
  parseNumber(): number {
    this.skipWhitespace()
    const source = this.input.slice(this.#position)
    const special = /^-?(?:inf|nan)\b/i.exec(source)
    if (special) {
      this.#position += special[0].length
      const lowered = special[0].toLowerCase()
      if (lowered === "nan" || lowered === "-nan") {
        return Number.NaN
      }
      return lowered.startsWith("-")
        ? Number.NEGATIVE_INFINITY
        : Number.POSITIVE_INFINITY
    }

    const match =
      /^-?(?:[0-9][0-9_]*(?:\.[0-9_]*)?|\.[0-9_]+)(?:[eE][+-]?[0-9_]+)?/.exec(
        source
      )
    if (!match) {
      throw this.error("expected number")
    }
    this.#position += match[0].length
    return Number(match[0].replaceAll("_", ""))
  }

  /**
   * Parses a quoted Candid text literal.
   *
   * @returns Decoded JavaScript string.
   * @throws If the string is unterminated or contains an invalid escape.
   */
  parseQuotedText(): string {
    this.skipWhitespace()
    this.expectRawChar('"')
    let out = ""
    while (this.#position < this.input.length) {
      const char = this.input[this.#position++]!
      if (char === '"') {
        return out
      }
      if (char !== "\\") {
        out += char
        continue
      }

      if (
        isHexDigit(this.input[this.#position]) &&
        isHexDigit(this.input[this.#position + 1])
      ) {
        const bytes: number[] = []
        do {
          bytes.push(
            Number.parseInt(
              this.input.slice(this.#position, this.#position + 2),
              16
            )
          )
          this.#position += 2
          if (this.input[this.#position] !== "\\") {
            break
          }
          this.#position += 1
        } while (
          isHexDigit(this.input[this.#position]) &&
          isHexDigit(this.input[this.#position + 1])
        )
        out += new TextDecoder().decode(new Uint8Array(bytes))
        continue
      }

      out += this.parseTextEscape()
    }
    throw this.error("unterminated string")
  }

  /**
   * Parses a Candid blob literal body.
   *
   * @returns Parsed blob bytes.
   * @throws If the blob is unterminated or contains a non-hex byte escape.
   */
  parseBlobLiteral(): Uint8Array {
    this.skipWhitespace()
    this.expectRawChar('"')
    const bytes: number[] = []
    while (this.#position < this.input.length) {
      const char = this.input[this.#position++]!
      if (char === '"') {
        return new Uint8Array(bytes)
      }
      if (char !== "\\") {
        bytes.push(char.charCodeAt(0) & 0xff)
        continue
      }
      if (
        !isHexDigit(this.input[this.#position]) ||
        !isHexDigit(this.input[this.#position + 1])
      ) {
        throw this.error("blob literal expects hexadecimal byte escapes")
      }
      bytes.push(
        Number.parseInt(
          this.input.slice(this.#position, this.#position + 2),
          16
        )
      )
      this.#position += 2
    }
    throw this.error("unterminated blob literal")
  }

  /**
   * Skips a simple Candid type annotation following a value.
   */
  skipTypeAnnotation(): void {
    this.skipWhitespace()
    if (!this.consumeChar(":")) {
      return
    }
    while (this.#position < this.input.length) {
      const char = this.input[this.#position]
      if (char === "," || char === ";" || char === ")" || char === "}") {
        return
      }
      this.#position += 1
    }
  }

  /**
   * Creates a parser error with offset and nearby input context.
   *
   * @param message - Error message prefix.
   * @returns Error object describing the parse location.
   */
  error(message: string): Error {
    const start = Math.max(0, this.#position - 20)
    const end = Math.min(this.input.length, this.#position + 40)
    const context = this.input.slice(start, end).replace(/\s+/g, " ")
    return new Error(
      `${message} at offset ${this.#position} near ${JSON.stringify(context)}`
    )
  }

  /**
   * Advances past whitespace from the current position.
   */
  private skipWhitespace(): void {
    while (isWhitespace(this.input[this.#position])) {
      this.#position += 1
    }
  }

  /**
   * Consumes one exact character without skipping whitespace.
   *
   * @param char - Character expected at the current raw position.
   * @throws If the raw character does not match.
   */
  private expectRawChar(char: string): void {
    if (this.input[this.#position] !== char) {
      throw this.error(`expected ${JSON.stringify(char)}`)
    }
    this.#position += 1
  }

  /**
   * Parses a single non-hex text escape sequence.
   *
   * @returns Decoded escape text.
   * @throws If the escape sequence is unterminated.
   */
  private parseTextEscape(): string {
    const escaped = this.input[this.#position++]
    switch (escaped) {
      case "n":
        return "\n"
      case "r":
        return "\r"
      case "t":
        return "\t"
      case "b":
        return "\b"
      case "f":
        return "\f"
      case "\\":
        return "\\"
      case '"':
        return '"'
      case "'":
        return "'"
      case "u":
        return this.parseUnicodeEscape()
      default:
        if (escaped === undefined) {
          throw this.error("unterminated escape sequence")
        }
        return escaped
    }
  }

  /**
   * Parses a Candid unicode escape of the form `\u{...}`.
   *
   * @returns Decoded unicode character.
   * @throws If the unicode escape is unterminated.
   */
  private parseUnicodeEscape(): string {
    this.expectRawChar("{")
    const start = this.#position
    while (
      this.#position < this.input.length &&
      this.input[this.#position] !== "}"
    ) {
      this.#position += 1
    }
    if (this.input[this.#position] !== "}") {
      throw this.error("unterminated unicode escape")
    }
    const codePoint = Number.parseInt(
      this.input.slice(start, this.#position),
      16
    )
    this.#position += 1
    return String.fromCodePoint(codePoint)
  }
}
