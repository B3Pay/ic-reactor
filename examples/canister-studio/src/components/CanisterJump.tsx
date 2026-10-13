import { useNavigate } from "@tanstack/react-router"
import {
  useEffect,
  useId,
  useRef,
  type FormEvent,
  type ReactElement,
} from "react"
import { useCanisterIdInput } from "./canister-id-input.ts"
import { KNOWN_CANISTERS } from "../lib/registry.ts"

/**
 * The header's "go to canister" box. Validates the id before navigating
 * (the route validates it again), suggests known canisters, and takes focus
 * on "/" from anywhere outside a text field.
 */
export function CanisterJump(): ReactElement {
  const navigate = useNavigate()
  const field = useCanisterIdInput()
  const input = useRef<HTMLInputElement>(null)
  const ids = useId()
  const listId = `${ids}-known`
  const problemId = `${ids}-problem`

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey)
        return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest("input, textarea, select") !== null)
      )
        return
      event.preventDefault()
      input.current?.focus()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const id = field.attempt()
    if (id === undefined) {
      input.current?.focus()
      return
    }
    field.reset()
    input.current?.blur()
    void navigate({ to: "/canister/$canisterId", params: { canisterId: id } })
  }

  return (
    <form
      className="canister-jump"
      role="search"
      aria-label="Open a canister"
      onSubmit={submit}
    >
      <label htmlFor={`${ids}-input`} className="sr-only">
        Canister id
      </label>
      <div className="canister-jump-field">
        <SearchIcon />
        <input
          ref={input}
          id={`${ids}-input`}
          className="input mono canister-jump-input"
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Canister id…"
          list={listId}
          value={field.text}
          onChange={(event) => field.setText(event.target.value)}
          aria-invalid={field.showProblem}
          aria-describedby={field.showProblem ? problemId : undefined}
        />
        <kbd className="kbd canister-jump-kbd" aria-hidden="true">
          /
        </kbd>
      </div>
      <datalist id={listId}>
        {KNOWN_CANISTERS.map((known) => (
          <option key={known.id} value={known.id}>
            {known.name}
          </option>
        ))}
      </datalist>
      {field.showProblem && field.verdict.state === "invalid" && (
        <p id={problemId} className="canister-jump-problem" role="alert">
          {field.verdict.message}
        </p>
      )}
    </form>
  )
}

function SearchIcon(): ReactElement {
  return (
    <svg
      className="canister-jump-icon"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="7"
        cy="7"
        r="4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="m10.5 10.5 3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
