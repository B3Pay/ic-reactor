import { useMemo, useState } from "react"
import {
  IDENTITY_ATTRIBUTES_BETA_PROVIDER,
  identityAttributeKeys,
  type IdentityAttributeOpenIdProvider,
} from "@ic-reactor/core"
import { useAuth, useIdentityAttributes, useUserPrincipal } from "./reactor"

type ProviderPreset = "google" | "apple" | "microsoft" | "custom"
type OpenIdProviderAlias = Exclude<ProviderPreset, "custom">

const providerOptions: Array<{ value: ProviderPreset; label: string }> = [
  { value: "google", label: "Google" },
  { value: "apple", label: "Apple" },
  { value: "microsoft", label: "Microsoft" },
  { value: "custom", label: "Custom issuer" },
]

const defaultCustomIssuer = "https://issuer.example.com"

function isProviderAlias(
  provider: ProviderPreset
): provider is OpenIdProviderAlias {
  return provider !== "custom"
}

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

const productionSteps = [
  {
    title: "1. Backend creates nonce",
    body: "Start registration on your backend or canister and return a fresh 32-byte nonce. Store its hash, principal scope, action, expected keys, and short expiry.",
  },
  {
    title: "2. Frontend requests attributes",
    body: "Pass that backend-issued nonce to useIdentityAttributes(). Never create the production nonce in browser state.",
  },
  {
    title: "3. Backend verifies payload",
    body: "Submit signedAttributes.data and signature back to the backend. Verify signature, nonce, origin, timestamp, principal, and requested keys.",
  },
  {
    title: "4. Store minimal profile data",
    body: "After verification, store only the user fields you need, linked to the verified principal. Mark the nonce as consumed.",
  },
]

const productionSnippet = `async function registerWithAttributes() {
  const { nonce } = await api.registerBegin({
    expectedKeys: ["email", "name"],
  })

  const result = await requestOpenIdAttributes({
    nonce,
    openIdProvider: "google",
    keys: ["email", "name"],
    identityProvider: IDENTITY_ATTRIBUTES_BETA_PROVIDER,
  })

  await api.registerFinish({
    principal: result.principal,
    requestedKeys: result.requestedKeys,
    signedAttributes: result.signedAttributes,
  })
}`

function App() {
  const { login, logout, isAuthenticating, error } = useAuth()
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
  const authPrincipalText = principal?.toText()
  const attributesPrincipalText = attributes?.principal
  const principalsMatch =
    Boolean(authPrincipalText && attributesPrincipalText) &&
    authPrincipalText === attributesPrincipalText
  const simulatedProfileStatus = authPrincipalText
    ? `Look up profile by principal: ${authPrincipalText}`
    : "No principal yet. Returning users sign in first, then your backend loads their profile by principal."

  async function signInWithAttributes() {
    // Demo-only fallback. In production, fetch this from a backend/canister
    // before calling requestOpenIdAttributes, then verify and consume it there.
    const nonce = createNonce()
    setNonceHex(bytesToHex(nonce))

    await requestOpenIdAttributes({
      nonce,
      openIdProvider,
      keys,
      identityProvider: IDENTITY_ATTRIBUTES_BETA_PROVIDER,
    })
  }

  async function signInReturningUser() {
    await login({
      identityProvider: IDENTITY_ATTRIBUTES_BETA_PROVIDER,
      openIdProvider: isProviderAlias(providerPreset)
        ? providerPreset
        : undefined,
    })
  }

  async function logoutAll() {
    clearAttributes()
    setNonceHex("")
    await logout()
  }

  return (
    <main className="shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">IC Reactor v3.4</p>
          <h1>Internet Identity attributes</h1>
          <p className="lede">
            Sign in with an OpenID provider and request signed profile
            attributes in one flow, then pass the signed payload to a backend or
            canister for verification.
          </p>
        </div>
      </section>

      <section className="helper-panel">
        <div>
          <p className="eyebrow">Production helper</p>
          <h2>Nonce and storage flow</h2>
          <p className="helper-copy">
            This demo generates a browser nonce so the flow is easy to try. In a
            real app, the nonce must come from the same backend or canister that
            will verify and store user information.
          </p>
        </div>

        <div className="helper-grid">
          {productionSteps.map((step) => (
            <article className="helper-step" key={step.title}>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>

        <pre className="helper-code">{productionSnippet}</pre>
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
            onClick={signInWithAttributes}
            disabled={
              isRequestingAttributes || isAuthenticating || keys.length === 0
            }
          >
            {isRequestingAttributes
              ? "Signing in and requesting"
              : "Sign in and request attributes"}
          </button>

          <div className="returning-user">
            <button
              className="button secondary"
              type="button"
              onClick={signInReturningUser}
              disabled={isRequestingAttributes || isAuthenticating}
            >
              {isAuthenticating
                ? "Signing in"
                : "Sign in returning user with same provider"}
            </button>
            <p>{simulatedProfileStatus}</p>

            <button
              className="button ghost logout-all"
              type="button"
              onClick={logoutAll}
              disabled={isRequestingAttributes || isAuthenticating}
            >
              Logout all
            </button>
          </div>

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
              <span className="label">Principal binding</span>
              <dl className="principal-binding">
                <div>
                  <dt>Authenticated principal</dt>
                  <dd>{authPrincipalText ?? "Anonymous"}</dd>
                </div>
                <div>
                  <dt>Attributes principal</dt>
                  <dd>{attributesPrincipalText ?? "Waiting for request"}</dd>
                </div>
                <div>
                  <dt>Match</dt>
                  <dd>{principalsMatch ? "Yes" : "Pending"}</dd>
                </div>
              </dl>

              <span className="label payload-label">
                Backend verification payload
              </span>
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
