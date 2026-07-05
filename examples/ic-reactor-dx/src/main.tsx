import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import {
  contactsCanisterId,
  lookupContact,
  queryClient,
  ready,
  saveContact,
  type Contact,
} from "./contacts-reactor"
import "./styles.css"

const sampleContact: Contact = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  aliases: ["ada", "lovelace"],
}

function App() {
  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">IC Reactor DX</p>
          <h1>Contacts canister, live in the browser.</h1>
        </div>
        <div className="status">
          <span className="mark">NET</span>
          <span>
            {contactsCanisterId || "missing VITE_CONTACTS_CANISTER_ID"}
          </span>
        </div>
      </section>

      {!contactsCanisterId ? (
        <section className="notice">
          Run <code>pnpm local:run</code> first. It installs the Rust canister
          and writes <code>.env.local</code> for Vite.
        </section>
      ) : (
        <ContactsConsole />
      )}
    </main>
  )
}

function ContactsConsole() {
  const savedContact = saveContact.useMutation({
    onSuccess: async () => {
      await queryClient.invalidateQueries()
    },
  })
  const contactQuery = lookupContact(["contact:ada@example.com"]).useQuery({
    enabled: false,
  })

  const save = async () => {
    await ready
    savedContact.mutate([sampleContact])
  }

  const lookup = async () => {
    await ready
    await contactQuery.refetch()
  }

  const contact = contactQuery.data?.[0]
  const busy = savedContact.isPending || contactQuery.isFetching

  return (
    <section className="workspace">
      <div className="panel primary">
        <div className="panelHeader">
          <span className="mark">SET</span>
          <span>Write Contact</span>
        </div>

        <dl className="contactPreview">
          <div>
            <dt>Name</dt>
            <dd>{sampleContact.name}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{sampleContact.email}</dd>
          </div>
          <div>
            <dt>Aliases</dt>
            <dd>{sampleContact.aliases.join(", ")}</dd>
          </div>
        </dl>

        <button className="action" type="button" onClick={save} disabled={busy}>
          <span>
            {savedContact.isPending ? "Saving..." : "Save to canister"}
          </span>
        </button>

        {savedContact.data ? (
          <p className="result">Saved as {savedContact.data}</p>
        ) : null}
        {savedContact.error ? (
          <p className="error">{String(savedContact.error)}</p>
        ) : null}
      </div>

      <div className="panel">
        <div className="panelHeader">
          <span className="mark">GET</span>
          <span>Read Contact</span>
        </div>

        <button
          className="action secondary"
          type="button"
          onClick={lookup}
          disabled={busy}
        >
          <span>
            {contactQuery.isFetching ? "Looking up..." : "Lookup Ada"}
          </span>
        </button>

        <div className="readout">
          {contact ? (
            <>
              <strong>{contact.name}</strong>
              <span>{contact.email}</span>
              <small>{contact.aliases.join(" / ")}</small>
            </>
          ) : (
            <span className="empty">No contact loaded yet.</span>
          )}
        </div>

        {contactQuery.error ? (
          <p className="error">{String(contactQuery.error)}</p>
        ) : null}
      </div>
    </section>
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
