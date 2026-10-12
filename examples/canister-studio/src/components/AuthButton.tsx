import { useAuth } from "@ic-reactor/react"
import { useId, useState, type ReactElement } from "react"
import { shortPrincipal } from "../lib/format.ts"
import { CopyButton } from "./CopyButton.tsx"

/**
 * Internet Identity sign-in through `useAuth()`. On the server and in the
 * hydrating render the state is "anonymous" (by design), so this renders
 * "Sign in" there and moves on to the session right after hydration.
 *
 * `signIn()` runs straight from the click, with nothing awaited first, so
 * the browser allows Internet Identity's window.
 */
export function AuthButton(): ReactElement {
  const auth = useAuth()
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const failureId = useId()

  const run = (action: () => Promise<void>): void => {
    setFailure(undefined)
    action().catch((error: unknown) => {
      setFailure(error instanceof Error ? error.message : String(error))
    })
  }

  if (auth.status === "signed-in") {
    return (
      <div className="auth" aria-label="Signed in">
        <span
          className="auth-principal mono"
          title={`Signed in as ${auth.principal}`}
        >
          <span className="dot auth-dot" aria-hidden="true" />
          <span className="sr-only">Signed in as </span>
          {shortPrincipal(auth.principal)}
        </span>
        <CopyButton
          text={auth.principal}
          label="Copy your principal"
          iconOnly
        />
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => run(() => auth.signOut())}
        >
          Sign out
        </button>
      </div>
    )
  }

  // "expired" and "signed-in-elsewhere" can write nothing until the user
  // signs in again in this tab.
  const label =
    auth.status === "expired"
      ? "Session expired: sign in"
      : auth.status === "signed-in-elsewhere"
        ? "Sign in here"
        : "Sign in"
  return (
    <div className="auth">
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => run(() => auth.signIn())}
        title="Sign in with Internet Identity to send writes"
        aria-describedby={failure === undefined ? undefined : failureId}
      >
        {label}
      </button>
      {failure !== undefined && (
        <p id={failureId} className="auth-failure" role="alert">
          Sign-in did not finish: {failure}
        </p>
      )}
    </div>
  )
}
