// Scenario 7: the address book, with optimistic adds and removes.
//
// The list is `useQuery(client.queryOptions(backend, "contacts"))`, skipped
// while signed out. Adding or removing a contact changes it at once
// (optimistic-contacts.ts); a refusal from the backend (a duplicate or an
// invalid name) or a failure puts it back as it was, and says why. Each row
// can be paid (scenario 8, SendToContact.tsx).
import { isPrincipal, principal } from "@candid-core/schema"
import { useAuth, useClient } from "@ic-reactor/react"
import { skipToken, useQuery } from "@tanstack/react-query"
import { useState, type FormEvent } from "react"
import { ErrorNote } from "./ErrorNote.tsx"
import { useAddContact, useRemoveContact } from "./optimistic-contacts.ts"
import { describeRefusal } from "./refusal.ts"
import { SendToContact } from "./SendToContact.tsx"
import { shortPrincipal } from "./token.ts"
import { useCanisters } from "./use-canisters.ts"

export function AddressBook() {
  const client = useClient()
  const { backend } = useCanisters()
  const { status } = useAuth()
  const signedIn = status === "signed-in"
  const contacts = useQuery(
    client.queryOptions(backend, "contacts", signedIn ? undefined : skipToken)
  )
  const add = useAddContact()
  const remove = useRemoveContact()
  const [name, setName] = useState("")
  const [owner, setOwner] = useState("")
  const [paying, setPaying] = useState<string>()
  // Typed text is checked in render with `isPrincipal`, and turned into a
  // `Principal` only by `principal()`, never cast.
  const ownerIsPrincipal = isPrincipal(owner.trim())

  const onAdd = (event: FormEvent) => {
    event.preventDefault()
    if (!ownerIsPrincipal) return
    add.mutate({ name, owner: principal(owner.trim()) })
  }

  // The error of the write sent last: an earlier refusal is not news.
  const failure =
    add.submittedAt >= remove.submittedAt ? add.error : remove.error
  const payee = contacts.data?.find((contact) => contact.name === paying)

  return (
    <section aria-labelledby="contacts">
      <p className="scenario">Scenarios 7 and 8</p>
      <h2 id="contacts">Address book</h2>
      {!signedIn ? (
        <p className="muted">Sign in to see your contacts.</p>
      ) : contacts.isError ? (
        <ErrorNote error={contacts.error} />
      ) : contacts.data === undefined ? (
        <p className="muted">…</p>
      ) : contacts.data.length === 0 ? (
        <p className="muted" data-testid="no-contacts">
          No contacts yet.
        </p>
      ) : (
        <ul className="contacts" aria-label="Contacts">
          {contacts.data.map((contact, index) => (
            // By position: an optimistic add of a name the backend will
            // refuse as a duplicate shows two rows of that name for a moment.
            <li key={`${index}:${contact.name}`}>
              <span>
                <strong>{contact.name}</strong>{" "}
                <code title={contact.owner}>
                  {shortPrincipal(contact.owner)}
                </code>
                {add.isPending && add.variables.name === contact.name && (
                  <span className="muted"> saving…</span>
                )}
              </span>
              <span className="row">
                <button
                  type="button"
                  aria-pressed={paying === contact.name}
                  onClick={() =>
                    setPaying(
                      paying === contact.name ? undefined : contact.name
                    )
                  }
                >
                  Pay {contact.name}
                </button>
                <button
                  type="button"
                  onClick={() => remove.mutate(contact.name)}
                >
                  Remove {contact.name}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {failure && (
        <ErrorNote
          error={failure}
          refusal={
            failure.kind === "canister_err"
              ? `${describeRefusal(failure.err)} The list is back as it was.`
              : undefined
          }
        />
      )}
      <form onSubmit={onAdd}>
        <div className="pair">
          <div>
            <label htmlFor="contact-name">Name</label>
            <input
              id="contact-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="contact-owner">Principal</label>
            <input
              id="contact-owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={owner !== "" && !ownerIsPrincipal}
            />
          </div>
        </div>
        <div className="row">
          <button type="submit" disabled={!signedIn || !ownerIsPrincipal}>
            Add contact
          </button>
        </div>
      </form>
      {payee && <SendToContact key={payee.name} contact={payee} />}
    </section>
  )
}
