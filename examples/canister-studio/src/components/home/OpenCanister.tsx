import { Link, useNavigate } from "@tanstack/react-router"
import { useId, useRef, type FormEvent, type ReactElement } from "react"
import { CURATED } from "../../lib/registry.ts"
import { useCanisterIdInput } from "../canister-id-input.ts"

/**
 * "Open any canister": an id box that explains what is wrong with the text
 * as it is typed (principal text first, then a canister id), and the curated
 * list of mainnet canisters worth opening.
 */
export function OpenCanister(): ReactElement {
  const navigate = useNavigate()
  const field = useCanisterIdInput()
  const input = useRef<HTMLInputElement>(null)
  const ids = useId()

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const id = field.attempt()
    if (id === undefined) {
      input.current?.focus()
      return
    }
    void navigate({ to: "/canister/$canisterId", params: { canisterId: id } })
  }

  const verdict = field.verdict
  return (
    <section className="card home-open" aria-labelledby={`${ids}-title`}>
      <div className="card-body">
        <div className="stack-xs">
          <h2 id={`${ids}-title`} className="section-title">
            Open any canister
          </h2>
          <p className="text-sm muted">
            The studio reads its certified{" "}
            <code className="code-inline">candid:service</code> metadata,
            compiles it on the server and builds a form for every method.
          </p>
        </div>
        <form className="stack-sm" onSubmit={submit} noValidate>
          <label htmlFor={`${ids}-input`} className="field-label">
            Canister id
          </label>
          <div className="input-group">
            <input
              ref={input}
              id={`${ids}-input`}
              className="input mono"
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="rrkah-fqaaa-aaaaa-aaaaq-cai"
              value={field.text}
              onChange={(event) => field.setText(event.target.value)}
              aria-invalid={field.showProblem}
              aria-describedby={`${ids}-hint`}
            />
            <button type="submit" className="btn btn-primary">
              Open
            </button>
          </div>
          <p
            id={`${ids}-hint`}
            className={field.showProblem ? "field-error" : "field-hint"}
            aria-live="polite"
          >
            {field.showProblem && verdict.state === "invalid"
              ? verdict.message
              : verdict.state === "ok"
                ? "A canister id: press Enter to open it."
                : "Principal text of a canister: 27 characters, five groups."}
          </p>
        </form>
        <div className="stack-sm">
          <h3 className="text-sm muted home-curated-title">
            Interesting mainnet canisters
          </h3>
          <ul className="list-plain home-curated">
            {CURATED.map((canister) => (
              <li key={canister.id}>
                <Link
                  to="/canister/$canisterId"
                  params={{ canisterId: canister.id }}
                  className="home-curated-item"
                >
                  <span className="home-curated-name">{canister.name}</span>
                  <span className="text-xs muted">{canister.note}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
