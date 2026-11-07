// What a tool call answers: text for the model, cut to a size it can read,
// and errors that say whether a write may have run.
import { isReactorError } from "@ic-reactor/core"
import type { AnyFieldSchema } from "@meantjs/schema"
import type { CallToolResult } from "@modelcontextprotocol/server"
import { valueToJson, type Json } from "../candid/json.ts"

/** The most characters of text one tool result carries. */
export const MAX_RESULT_CHARS = 60_000

export function textResult(
  text: string,
  options: { readonly isError?: boolean; readonly maxChars?: number } = {}
): CallToolResult {
  return {
    content: [
      { type: "text", text: cut(text, options.maxChars ?? MAX_RESULT_CHARS) },
    ],
    ...(options.isError === true ? { isError: true } : {}),
  }
}

export const errorResult = (text: string): CallToolResult =>
  textResult(text, { isError: true })

/** `text`, or its first `max` characters and a line that says how much was cut. */
export function cut(text: string, max: number): string {
  if (text.length <= max) return text
  // Never end on half of a surrogate pair.
  const end = isHighSurrogate(text.charCodeAt(max - 1)) ? max - 1 : max
  return `${text.slice(0, end)}\n… cut here: the whole text is ${text.length} characters. Ask for less, such as a smaller page.`
}

const isHighSurrogate = (code: number): boolean =>
  code >= 0xd800 && code <= 0xdbff

export const jsonText = (json: Json): string => JSON.stringify(json, null, 2)

/**
 * A reply as JSON. The client resolves a method whose one result is an
 * Ok/Err variant with the Ok payload, so `okSchema` is that payload's schema
 * then; otherwise the reply is `undefined` (no results), the value (one), or
 * an array of values (several).
 */
export function replyJson(
  results: readonly AnyFieldSchema[],
  okSchema: AnyFieldSchema | undefined,
  reply: unknown
): Json {
  if (okSchema !== undefined) return valueToJson(okSchema, reply)
  if (results.length === 0) return null
  if (results.length === 1) return valueToJson(results[0], reply)
  const values = Array.isArray(reply) ? reply : []
  return results.map((schema, i) => valueToJson(schema, values[i]))
}

/**
 * Why a call failed, for the model: the canister's Err as JSON, or the
 * client's reason, and for a write whether it may have run.
 */
export function failureText(
  error: unknown,
  write: boolean,
  errSchema: AnyFieldSchema | undefined
): string {
  if (!isReactorError(error)) {
    const reason = error instanceof Error ? error.message : String(error)
    return write
      ? `The call failed: ${reason}. It may have run: check the canister's state before you send it again.`
      : `The call failed: ${reason}`
  }
  const reason = error.message.replace(/^\[ic-reactor\] /, "")
  if (error.kind === "canister_err") {
    const err =
      errSchema === undefined
        ? String(error.err)
        : jsonText(valueToJson(errSchema, error.err))
    return `The canister ran the call and answered Err:\n${err}`
  }
  const lines = [`${KIND_TEXT[error.kind]}: ${reason}`]
  if (error.rejectCode !== undefined) {
    lines.push(`Reject code: ${error.rejectCode}`)
  }
  if (write) {
    lines.push(
      error.mayHaveExecuted
        ? "It may have run: check the canister's state before you send it again."
        : "It did not run."
    )
  }
  return lines.join("\n")
}

const KIND_TEXT: Record<string, string> = {
  invalid_args: "Not sent: the arguments do not fit the method",
  unauthenticated: "Not sent: this server has no identity to sign with",
  not_delivered: "Not delivered",
  outcome_unknown: "No answer",
  rejected: "The canister rejected the call",
  invalid_reply: "The reply could not be read",
  cancelled: "Cancelled",
}
