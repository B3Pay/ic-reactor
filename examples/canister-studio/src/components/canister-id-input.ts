import { isPrincipal } from "@candid-core/schema"
import { useState } from "react"
import { checkCanisterId, principalProblem } from "../lib/ids.ts"

/** What the studio can say about typed canister id text, as the user types. */
export type CanisterIdVerdict =
  | { readonly state: "empty" }
  | { readonly state: "ok"; readonly id: string }
  | { readonly state: "invalid"; readonly message: string }

/**
 * Judges input text: trimmed, then a principal (`isPrincipal`), then a
 * canister id that is not the management canister (`checkCanisterId`).
 * Never repairs the text: a wrong letter case or a missing dash is refused,
 * as `principal()` refuses it.
 */
export function judgeCanisterId(text: string): CanisterIdVerdict {
  const trimmed = text.trim()
  if (trimmed === "") return { state: "empty" }
  if (!isPrincipal(trimmed)) {
    return {
      state: "invalid",
      message: principalProblem(trimmed) ?? "Not principal text.",
    }
  }
  const check = checkCanisterId(trimmed)
  return check.ok
    ? { state: "ok", id: check.id }
    : { state: "invalid", message: check.message }
}

/**
 * State for a canister id field: the raw text, its verdict, and whether to
 * show a problem yet (after a submit attempt, or once the text is long
 * enough that it is no longer being typed).
 */
export function useCanisterIdInput(initial = ""): {
  text: string
  setText(text: string): void
  verdict: CanisterIdVerdict
  showProblem: boolean
  /** Marks a submit attempt; returns the id when the text is valid. */
  attempt(): string | undefined
  reset(): void
} {
  const [text, setText] = useState(initial)
  const [attempted, setAttempted] = useState(false)
  const verdict = judgeCanisterId(text)
  // The shortest canister id text is 27 characters.
  const showProblem =
    verdict.state === "invalid" && (attempted || text.trim().length >= 27)
  return {
    text,
    setText: (next) => {
      setText(next)
      setAttempted(false)
    },
    verdict,
    showProblem,
    attempt: () => {
      setAttempted(true)
      return verdict.state === "ok" ? verdict.id : undefined
    },
    reset: () => {
      setText("")
      setAttempted(false)
    },
  }
}
