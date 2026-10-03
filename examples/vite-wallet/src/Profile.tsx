// Scenario 6: the backend's profile, read and written as the signed-in caller.
//
// - `get_profile` is read with `skipToken` while signed out.
// - `set_name` is a write: `useMutation(client.mutationOptions(backend,
//   "set_name"))`. Signed out, the form still works on purpose: the client
//   refuses the write with kind `unauthenticated` before sending anything,
//   and the page says so. (The backend refuses the anonymous principal too,
//   with its own `Err`, but the call never reaches it.)
// - The backend's own refusals (a name that is empty, too long or has a
//   control character) arrive as `canister_err` with a typed `Refusal`.
// - After the write settles, the client invalidates the backend's reads (its
//   default for a write), so the saved name shows without code here.
import { useAuth, useClient } from "@ic-reactor/react"
import { skipToken, useMutation, useQuery } from "@tanstack/react-query"
import { useState, type FormEvent } from "react"
import { ErrorNote } from "./ErrorNote.tsx"
import { describeRefusal } from "./refusal.ts"
import { useCanisters } from "./use-canisters.ts"

export function Profile() {
  const client = useClient()
  const { backend } = useCanisters()
  const { status } = useAuth()
  const signedIn = status === "signed-in"
  const profile = useQuery(
    client.queryOptions(
      backend,
      "get_profile",
      signedIn ? undefined : skipToken
    )
  )
  const rename = useMutation(client.mutationOptions(backend, "set_name"))
  const [name, setName] = useState("")

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    rename.mutate(name)
  }

  return (
    <section aria-labelledby="profile">
      <p className="scenario">Scenario 6</p>
      <h2 id="profile">Profile</h2>
      <p data-testid="profile-name">
        {!signedIn
          ? "Signed out: no profile is read."
          : profile.isError
            ? "The profile could not be read."
            : profile.data === undefined
              ? "…"
              : profile.data === null
                ? "No name yet."
                : `Name: ${profile.data.name}`}
      </p>
      <form onSubmit={onSubmit}>
        <label htmlFor="profile-input">Name</label>
        <input
          id="profile-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
        />
        <div className="row">
          <button type="submit" disabled={rename.isPending}>
            Save
          </button>
          {!signedIn && (
            <span className="muted">
              Try it signed out: the client refuses it before sending.
            </span>
          )}
        </div>
      </form>
      {profile.isError && <ErrorNote error={profile.error} />}
      {rename.isSuccess && (
        <p className="ok" data-testid="profile-saved">
          Saved as {rename.data.name}.
        </p>
      )}
      {rename.error && (
        <ErrorNote
          error={rename.error}
          refusal={
            rename.error.kind === "canister_err"
              ? describeRefusal(rename.error.err)
              : undefined
          }
        />
      )}
    </section>
  )
}
