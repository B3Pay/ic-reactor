// Scenarios 2 and 3: who is signed in, and how to change it.
//
// `useAuth()` follows the client: `status` and `principal` re-render this
// component once per change, and `signIn`/`signOut` go through the client to
// its one auth (wallet-auth.ts), which picks the source from the options:
//
// - Internet Identity (scenario 2): `signIn({ with: "internet-identity" })`
//   opens the local Internet Identity in a new window.
// - Dev account, local only (scenario 3): `signIn({ with: "dev-account",
//   account })`. Signed in as one dev account, picking another is a switch.
//
// `principal` is the anonymous principal (2vxsx-fae) unless `status` is
// "signed-in", so it can be shown as is.
import { useAuth } from "@ic-reactor/react"
import { useState } from "react"
import type { DevAccounts } from "./auth/dev-accounts.ts"
import type { SignInChoice } from "./auth/wallet-auth.ts"

export function SignIn({ devAccounts }: { devAccounts?: DevAccounts }) {
  const { status, principal, signIn, signOut } = useAuth()
  const [failure, setFailure] = useState<string>()
  const signedIn = status === "signed-in"
  const devNumber = signedIn ? devAccounts?.numberOf(principal) : undefined
  const accounts = devAccounts?.list() ?? []

  const run = (action: () => Promise<void>) => {
    setFailure(undefined)
    action().catch((error: unknown) =>
      setFailure(error instanceof Error ? error.message : String(error))
    )
  }
  const signInWith = (choice: SignInChoice) => run(() => signIn(choice))

  return (
    <section aria-labelledby="sign-in">
      <p className="scenario">Scenarios 2 and 3</p>
      <h2 id="sign-in">Who is signed in</h2>
      <p>
        <span className="pill" data-status={status}>
          {status}
        </span>{" "}
        <span data-testid="who">
          {!signedIn
            ? "nobody"
            : devNumber !== undefined
              ? `Dev account ${devNumber}`
              : "Internet Identity"}
        </span>
      </p>
      <p>
        <code data-testid="principal">{principal}</code>
      </p>
      {status === "expired" && (
        <p className="warn">The session expired: sign in again.</p>
      )}
      <div className="row">
        <button
          type="button"
          onClick={() => signInWith({ with: "internet-identity" })}
        >
          Sign in with Internet Identity
        </button>
        <button
          type="button"
          disabled={!signedIn}
          onClick={() => run(() => signOut())}
        >
          Sign out
        </button>
      </div>
      {devAccounts && (
        <>
          <h3>Dev account (local only)</h3>
          <p className="muted">
            An Ed25519 key this tab keeps in sessionStorage: no passkey, for
            local demos. Fund one with{" "}
            <code>pnpm faucet &lt;principal&gt;</code>.
          </p>
          <div className="row">
            {accounts.map(({ number }) => (
              <button
                key={number}
                type="button"
                aria-pressed={devNumber === number}
                onClick={() =>
                  signInWith({ with: "dev-account", account: number })
                }
              >
                Dev account {number}
              </button>
            ))}
            <button
              type="button"
              onClick={() =>
                signInWith({
                  with: "dev-account",
                  account: accounts.length + 1,
                })
              }
            >
              {accounts.length === 0
                ? "Sign in with a dev account"
                : "New dev account"}
            </button>
          </div>
        </>
      )}
      {failure && (
        <p className="error" role="alert">
          Sign-in failed: {failure}
        </p>
      )}
      <p className="muted">
        Every read is cached under its caller&apos;s principal, so a switch
        starts the next account from an empty cache: one account&apos;s balance,
        profile or contacts are never shown to another.
      </p>
    </section>
  )
}
