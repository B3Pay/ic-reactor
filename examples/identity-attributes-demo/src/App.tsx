import { useMemo, useState } from "react"
import {
  IDENTITY_ATTRIBUTES_BETA_PROVIDER,
  identityAttributeKeys,
  type IdentityAttributeOpenIdProvider,
} from "@ic-reactor/core"
import { useAuth, useIdentityAttributes, useUserPrincipal } from "./reactor"

type ProviderPreset = "google" | "apple" | "microsoft" | "custom"

const providerOptions: Array<{ value: ProviderPreset; label: string }> = [
  { value: "google", label: "Google" },
  { value: "apple", label: "Apple" },
  { value: "microsoft", label: "Microsoft" },
  { value: "custom", label: "Custom issuer" },
]

const defaultCustomIssuer = "https://issuer.example.com"

function createNonce(): Uint8Array {
  const nonce = new Uint8Array(32)
  crypto.getRandomValues(nonce)
  return nonce
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

function compactBytes(bytes?: Uint8Array): string {
  if (!bytes) return "Waiting for signed payload"
  const hex = bytesToHex(bytes)
  return `${hex.slice(0, 32)}...${hex.slice(-16)} (${bytes.length} bytes)`
}

function App() {
  const { login, logout, isAuthenticated, isAuthenticating, error } = useAuth()
  const principal = useUserPrincipal()
  const {
    requestOpenIdAttributes,
    attributes,
    isRequestingAttributes,
    attributeError,
    clearAttributes,
  } = useIdentityAttributes()

  const [providerPreset, setProviderPreset] = useState<ProviderPreset>("google")
  const [customIssuer, setCustomIssuer] = useState(defaultCustomIssuer)
  const [requestedKeys, setRequestedKeys] = useState("email,name")
  const [nonceHex, setNonceHex] = useState("")

  const keys = useMemo(
    () =>
      requestedKeys
        .split(",")
        .map((key) => key.trim())
        .filter(Boolean),
    [requestedKeys]
  )

  const openIdProvider: IdentityAttributeOpenIdProvider =
    providerPreset === "custom" ? customIssuer : providerPreset

  const scopedKeys = useMemo(
    () => identityAttributeKeys({ openIdProvider, keys }),
    [openIdProvider, keys]
  )

  async function requestAttributes() {
    const nonce = createNonce()
    setNonceHex(bytesToHex(nonce))

    await requestOpenIdAttributes({
      nonce,
      openIdProvider,
      keys,
      identityProvider: IDENTITY_ATTRIBUTES_BETA_PROVIDER,
      windowOpenerFeatures:
        "toolbar=0,location=0,menubar=0,width=525,height=705",
    })
  }

  return (
    <main className="shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">IC Reactor v3.4</p>
          <h1>Internet Identity attributes</h1>
          <p className="lede">
            Request signed OpenID profile values through the new
            `useIdentityAttributes()` flow, then pass the signed payload to a
            backend or canister for verification.
          </p>
        </div>

        <div className="auth-strip">
          <div>
            <span className="label">Principal</span>
            <strong>{principal?.toText() ?? "Anonymous"}</strong>
          </div>
          <button
            className="button secondary"
            type="button"
            onClick={() => (isAuthenticated ? logout() : login())}
            disabled={isAuthenticating}
          >
            {isAuthenticated
              ? "Logout"
              : isAuthenticating
                ? "Opening"
                : "Login"}
          </button>
        </div>
      </section>

      <section className="workspace">
        <form
          className="request-panel"
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="panel-heading">
            <span className="label">Request builder</span>
            <button
              className="button ghost"
              type="button"
              onClick={clearAttributes}
              disabled={!attributes && !attributeError}
            >
              Clear
            </button>
          </div>

          <label className="field">
            <span>OpenID provider</span>
            <select
              value={providerPreset}
              onChange={(event) =>
                setProviderPreset(event.target.value as ProviderPreset)
              }
            >
              {providerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {providerPreset === "custom" && (
            <label className="field">
              <span>Issuer URL</span>
              <input
                value={customIssuer}
                onChange={(event) => setCustomIssuer(event.target.value)}
                placeholder="https://issuer.example.com"
              />
            </label>
          )}

          <label className="field">
            <span>Attribute keys</span>
            <input
              value={requestedKeys}
              onChange={(event) => setRequestedKeys(event.target.value)}
              placeholder="email,name"
            />
          </label>

          <div className="scoped-keys" aria-live="polite">
            {scopedKeys.map((key) => (
              <code key={key}>{key}</code>
            ))}
          </div>

          <button
            className="button primary"
            type="button"
            onClick={requestAttributes}
            disabled={isRequestingAttributes || keys.length === 0}
          >
            {isRequestingAttributes
              ? "Requesting attributes"
              : "Request signed attributes"}
          </button>

          {(error || attributeError) && (
            <p className="error">{attributeError?.message ?? error?.message}</p>
          )}
        </form>

        <section className="result-panel">
          <div className="panel-heading">
            <span className="label">Signed result</span>
            <span className="status">
              {attributes ? "Ready for backend verification" : "No payload yet"}
            </span>
          </div>

          <div className="result-grid">
            <article>
              <span className="label">Decoded display values</span>
              <pre>
                {JSON.stringify(attributes?.decodedAttributes ?? {}, null, 2)}
              </pre>
            </article>
            <article>
              <span className="label">Backend verification payload</span>
              <dl>
                <div>
                  <dt>Data</dt>
                  <dd>{compactBytes(attributes?.signedAttributes.data)}</dd>
                </div>
                <div>
                  <dt>Signature</dt>
                  <dd>
                    {compactBytes(attributes?.signedAttributes.signature)}
                  </dd>
                </div>
                <div>
                  <dt>Nonce</dt>
                  <dd>{nonceHex || "Generated per request"}</dd>
                </div>
              </dl>
            </article>
          </div>

          <div className="verification-note">
            <strong>Verification boundary</strong>
            <p>
              Treat decoded values as UI-only. Trust the email or profile fields
              only after your backend or canister verifies the signature, nonce,
              origin, timestamp, principal, and requested keys.
            </p>
          </div>
        </section>
      </section>
    </main>
  )
}

export default App
