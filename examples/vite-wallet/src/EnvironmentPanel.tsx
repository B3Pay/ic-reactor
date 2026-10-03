// Scenario 1: which network the page talks to, and how it found the canisters.
//
// - `createClient({ network: "env" })` routes through the page's own origin;
//   `client.network`, the network segment of every query key, is that origin.
// - @ic-reactor/vite-plugin sets the ic_env cookie on every page load under
//   `vite dev` and `vite preview` (the root key and a PUBLIC_CANISTER_ID per
//   canister it asked `icp` about) and proxies /api to the local gateway.
// - `{ name: "backend" }` is resolved from that cookie when a key or a call is
//   built, and only on a page where it is trusted (both the page and the
//   replica local). `client.queryKey(backend)` shows what it resolved to: the
//   canister id, or `$unresolved:backend`, in which case every call is refused
//   before sending (`invalid_args`, code `canister_id_unresolved`).
//
// This panel reads the cookie itself only to show it; the client reads it on
// its own.
import { useAuth, useClient } from "@ic-reactor/react"
import { safeGetCanisterEnv } from "@icp-sdk/core/agent/canister-env"
import { useQuery } from "@tanstack/react-query"
import { ErrorNote } from "./ErrorNote.tsx"
import { useCanisters } from "./use-canisters.ts"

/** The cookie's entries, as `safeGetCanisterEnv` parses them. */
type CookieEntries = Readonly<Record<string, string | Uint8Array | undefined>>

export function EnvironmentPanel() {
  const client = useClient()
  const { backend, ledger } = useCanisters()
  const { principal: caller } = useAuth()
  const cookie = safeGetCanisterEnv<CookieEntries>()
  // The fourth segment of a canister's key is the id the client resolved.
  const resolved = (key: readonly unknown[]) => String(key[3])
  const backendId = resolved(client.queryKey(backend))
  const ledgerId = resolved(client.queryKey(ledger))
  // A read that proves the id leads to a canister that answers: the
  // caller's contacts (none for the anonymous principal).
  const probe = useQuery(client.queryOptions(backend, "contacts"))

  const names = Object.keys(cookie ?? {}).filter((name) =>
    name.startsWith("PUBLIC_CANISTER_ID:")
  )

  return (
    <section aria-labelledby="environment">
      <p className="scenario">Scenario 1</p>
      <h2 id="environment">Network and canisters</h2>
      <dl>
        <div className="kv">
          <dt>
            <code>client.network</code> (calls go to its <code>/api</code>)
          </dt>
          <dd data-testid="network">{client.network}</dd>
        </div>
        <div className="kv">
          <dt>
            <code>{'{ name: "backend" }'}</code> resolved to
          </dt>
          <dd data-testid="backend-id">{backendId}</dd>
        </div>
        <div className="kv">
          <dt>
            <code>{"{ id }"}</code> of the ICP ledger
          </dt>
          <dd data-testid="ledger-id">{ledgerId}</dd>
        </div>
        <div className="kv">
          <dt>The backend answers</dt>
          <dd data-testid="backend-probe">
            {probe.isSuccess
              ? `yes: contacts() as ${caller === "2vxsx-fae" ? "anonymous" : "you"} gave ${probe.data.length}`
              : probe.isError
                ? "no"
                : "…"}
          </dd>
        </div>
      </dl>
      {probe.isError && <ErrorNote error={probe.error} />}
      <h3>The ic_env cookie this page was served with</h3>
      {cookie === undefined ? (
        <p className="muted" data-testid="cookie">
          None. Under <code>pnpm dev</code> the Vite plugin sets it once the
          local network runs (<code>pnpm icp:start</code>).
        </p>
      ) : (
        <ul className="plain" data-testid="cookie">
          <li>
            <code>IC_ROOT_KEY</code>: {cookie.IC_ROOT_KEY?.length ?? 0} bytes
          </li>
          {names.map((name) => (
            <li key={name}>
              <code>{name}</code>: {String(cookie[name])}
            </li>
          ))}
          {typeof cookie.INTERNET_IDENTITY_PROVIDER === "string" && (
            <li>
              <code>INTERNET_IDENTITY_PROVIDER</code>:{" "}
              {cookie.INTERNET_IDENTITY_PROVIDER}
            </li>
          )}
        </ul>
      )}
    </section>
  )
}
