import { isPrincipal, principal, type Principal } from "@meantjs/schema"
import { principalBytesFromText } from "@meantjs/schema/codec"

/**
 * Why a text is not a canister id the studio can open. The codes are the
 * id-related members of the interface loader's error codes, so the server
 * function returns them as they are.
 */
export type CanisterIdProblem =
  "invalid_canister_id" | "not_a_canister" | "management_canister"

export type CanisterIdCheck =
  | { readonly ok: true; readonly id: Principal }
  | {
      readonly ok: false
      readonly code: CanisterIdProblem
      readonly message: string
    }

/** The management canister: no interface of its own, and no calls from here. */
export const MANAGEMENT_CANISTER_ID = "aaaaa-aa"

// The longest canonical principal text (29 bytes) is 63 characters. Anything
// longer is refused before it is parsed at all.
const MAX_PRINCIPAL_TEXT = 63

// Canister ids are opaque principals: 10 bytes, the last one 0x01. Users'
// self-authenticating principals end in 0x02, and the anonymous principal is
// the single byte 0x04.
const CANISTER_ID_BYTES = 10
const OPAQUE_ID_SUFFIX = 0x01

/**
 * Checks that `text` is a canister id the studio may read and call: canonical
 * principal text whose bytes are an opaque 10-byte id, and not the management
 * canister. The text is taken as it is: trim user input first, but never
 * repair it (upper case, a missing dash), as `principal()` refuses to.
 *
 * Shared by the browser (the jump box, route params) and the server function
 * that reads an interface, so both refuse the same ids with the same codes.
 */
export function checkCanisterId(text: string): CanisterIdCheck {
  if (text === MANAGEMENT_CANISTER_ID) {
    return {
      ok: false,
      code: "management_canister",
      message:
        "aaaaa-aa is the management canister: it publishes no interface, and the studio does not call it.",
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
      code: "not_a_canister",
      message:
        "This principal is not a canister id: a canister id is 10 bytes ending in 0x01, and this looks like a user or the anonymous principal.",
    }
  }
  return { ok: true, id: text }
}

/** Whether `text` is a canister id `checkCanisterId` accepts. */
export function isCanisterId(text: string): boolean {
  return checkCanisterId(text).ok
}

/**
 * Why `text` is not canonical principal text (the message `principal()`
 * throws), or `undefined` when it is.
 */
export function principalProblem(text: string): string | undefined {
  if (text.length > MAX_PRINCIPAL_TEXT) {
    return `Principal text is at most ${MAX_PRINCIPAL_TEXT} characters.`
  }
  try {
    principal(text)
    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}
