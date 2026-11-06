// Canister id checks. Every id is checked here before anything is read for
// it, so text that is not a canister id never reaches a request path, a
// file lookup or a cache key.
import { isPrincipal, principal } from "@meantjs/schema"
import { principalBytesFromText } from "@meantjs/schema/codec"

export type CanisterIdCheck =
  | { readonly ok: true; readonly id: string }
  | {
      readonly ok: false
      readonly code: "invalid_canister_id" | "management_canister"
      readonly message: string
    }

/** The management canister: no interface of its own, and no calls from here. */
export const MANAGEMENT_CANISTER_ID = "aaaaa-aa"

// The longest canonical principal text (29 bytes) is 63 characters. Anything
// longer is refused before it is parsed at all.
const MAX_PRINCIPAL_TEXT = 63

// Canister ids are opaque principals: 10 bytes, the last one 0x01, on every
// network. Users' self-authenticating principals end in 0x02, and the
// anonymous principal is the single byte 0x04.
const CANISTER_ID_BYTES = 10
const OPAQUE_ID_SUFFIX = 0x01

/**
 * Checks that `text` is a canister id the server may read and call:
 * canonical principal text whose bytes are an opaque 10-byte id, and not the
 * management canister. The text is taken as it is: trim input first, but
 * never repair it (upper case, a missing dash), as `principal()` refuses to.
 */
export function checkCanisterId(text: string): CanisterIdCheck {
  // Callers pass what a client sent: refuse, rather than throw on, a non-string.
  if (typeof text !== "string") {
    return {
      ok: false,
      code: "invalid_canister_id",
      message: "A canister id is text.",
    }
  }
  if (text === MANAGEMENT_CANISTER_ID) {
    return {
      ok: false,
      code: "management_canister",
      message:
        "aaaaa-aa is the management canister: it publishes no interface, and this server does not call it.",
    }
  }
  if (text.length > MAX_PRINCIPAL_TEXT || !isPrincipal(text)) {
    return {
      ok: false,
      code: "invalid_canister_id",
      message: principalProblem(text) ?? "Not canonical principal text.",
    }
  }
  const bytes = principalBytesFromText(text)
  if (
    bytes === undefined ||
    bytes.length !== CANISTER_ID_BYTES ||
    bytes[CANISTER_ID_BYTES - 1] !== OPAQUE_ID_SUFFIX
  ) {
    return {
      ok: false,
      code: "invalid_canister_id",
      message:
        "This principal is not a canister id: a canister id is 10 bytes ending in 0x01, and this looks like a user's principal or the anonymous one.",
    }
  }
  return { ok: true, id: text }
}

// Why `text` is not canonical principal text (the message `principal()`
// throws), or `undefined` when it is.
function principalProblem(text: string): string | undefined {
  if (text.length > MAX_PRINCIPAL_TEXT) {
    return `Principal text is at most ${MAX_PRINCIPAL_TEXT} characters.`
  }
  try {
    principal(text)
    return undefined
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return message.replace(/^principal\(\): /, "")
  }
}
