// Scenario 6 (with src/app/account/page.tsx): validating typed principal
// text on the server.
//
// Rule: make a principal from user input with `principal(text)`, never a cast;
// test the text with `isPrincipal(text)` first, and refuse what it rejects. A
// search parameter is user input: anyone can type any URL. Refusing it here
// shows a message in the page; nothing is sent to a canister, and nothing
// throws during the render.
import { isPrincipal, principal, type Principal } from "@candid-core/schema"

/** What the `owner` search parameter holds. */
export type OwnerInput =
  | { readonly kind: "empty" }
  | { readonly kind: "invalid"; readonly text: string; readonly reason: string }
  | { readonly kind: "valid"; readonly text: string; readonly owner: Principal }

/**
 * Reads a search parameter as an owner principal. `?owner=a&owner=b` uses the
 * first; surrounding spaces are dropped.
 */
export function parseOwner(value: string | string[] | undefined): OwnerInput {
  const text = (Array.isArray(value) ? value[0] : value)?.trim() ?? ""
  if (text === "") return { kind: "empty" }
  if (!isPrincipal(text)) {
    return {
      kind: "invalid",
      text,
      reason:
        `"${text}" is not a principal. Principal text is lowercase groups of five ` +
        "characters joined by dashes, with a checksum in front: rkp4c-7iaaa-aaaaa-aaaca-cai is one.",
    }
  }
  return { kind: "valid", text, owner: principal(text) }
}
