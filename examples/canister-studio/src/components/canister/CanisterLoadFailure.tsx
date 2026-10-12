import { Link, useRouter } from "@tanstack/react-router"
import { useState, type ReactElement } from "react"
import type {
  InterfaceErrorCode,
  InterfacePayload,
} from "../../interface/types.ts"
import { Notice } from "../Notice.tsx"

type FailedPayload = Extract<InterfacePayload, { ok: false }>

const EXPLAIN: Readonly<
  Record<
    InterfaceErrorCode,
    { title: string; text: string; tone: "warn" | "danger"; retry: boolean }
  >
> = {
  invalid_canister_id: {
    title: "Not a canister id",
    text: "The id is not canonical principal text.",
    tone: "warn",
    retry: false,
  },
  not_a_canister: {
    title: "Not a canister id",
    text: "This principal is a user or the anonymous principal, not a canister.",
    tone: "warn",
    retry: false,
  },
  management_canister: {
    title: "The management canister",
    text: "aaaaa-aa publishes no interface, and the studio does not call it.",
    tone: "warn",
    retry: false,
  },
  no_interface: {
    title: "This canister publishes no interface",
    text: "It has no candid:service metadata and does not answer __get_candid_interface_tmp_hack. If you have its .did, paste it in the playground and call the canister from there.",
    tone: "warn",
    retry: false,
  },
  private_interface: {
    title: "The interface is private",
    text: "The canister's candid:service metadata is visible to its controllers only. Paste its .did in the playground to call it.",
    tone: "warn",
    retry: false,
  },
  canister_not_found: {
    title: "No canister at this id",
    text: "Mainnet knows no canister with this id.",
    tone: "warn",
    retry: false,
  },
  too_large: {
    title: "The interface is too large",
    text: "The studio compiles interfaces up to 256 KiB on its server; this one is larger.",
    tone: "warn",
    retry: false,
  },
  compile_failed: {
    title: "The interface did not compile",
    text: "The canister's Candid has errors the compiler refused (below).",
    tone: "danger",
    retry: false,
  },
  network: {
    title: "Mainnet did not answer",
    text: "The server could not reach the Internet Computer. Try again in a moment.",
    tone: "warn",
    retry: true,
  },
  timeout: {
    title: "Reading the interface took too long",
    text: "The server gave up waiting. Try again; a second read is usually cached.",
    tone: "warn",
    retry: true,
  },
  trust_error: {
    title: "The certificate did not verify",
    text: "The answer was signed wrongly. The studio never falls back to an uncertified read after that, so it shows nothing.",
    tone: "danger",
    retry: true,
  },
}

/**
 * Why a canister's interface could not be loaded, what to do about it, and
 * the compiler's diagnostics when there are some.
 */
export function CanisterLoadFailure({
  payload,
}: {
  payload: FailedPayload
}): ReactElement {
  const router = useRouter()
  const [retrying, setRetrying] = useState(false)
  const explain = EXPLAIN[payload.code]

  const retry = (): void => {
    setRetrying(true)
    router.invalidate().finally(() => setRetrying(false))
  }

  return (
    <div className="stack">
      <Notice tone={explain.tone} title={explain.title}>
        <p>{explain.text}</p>
        <p className="muted text-xs">
          <span className="mono">{payload.code}</span>: {payload.message}
        </p>
      </Notice>
      {payload.diagnostics !== undefined && payload.diagnostics.length > 0 && (
        <div className="table-wrap">
          <table className="table table-compact">
            <caption className="sr-only">Compiler diagnostics</caption>
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Message</th>
              </tr>
            </thead>
            <tbody>
              {payload.diagnostics.map((diagnostic, i) => (
                <tr key={`${diagnostic.code}-${i}`}>
                  <td className="mono nowrap">{diagnostic.code}</td>
                  <td className="break-all">{diagnostic.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="row">
        {explain.retry && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={retry}
            disabled={retrying}
          >
            {retrying ? "Trying again…" : "Try again"}
          </button>
        )}
        <Link
          to="/playground"
          search={{ target: payload.canisterId }}
          className="btn"
        >
          Paste its .did in the playground
        </Link>
        <Link to="/" className="btn btn-ghost">
          Pick another canister
        </Link>
      </div>
    </div>
  )
}
