/**
 * Ask a locally deployed Internet Identity canister what it actually serves.
 *
 * `localInternetIdentityProvider` builds `http://<id>.localhost:<port>/authorize`,
 * the id.ai-era path. Whether that works depends on which Internet Identity
 * build is installed, and the window is narrow:
 *
 * - up to `release-2025-03-07`, the SPA lived at `/` and used a `#authorize`
 *   fragment; `/authorize` is not an asset
 * - `release-2026-01-05` through `release-2026-03-16` serve `/authorize`
 * - from `release-2026-03-23` the frontend left the canister entirely (the id.ai
 *   split), so `/authorize` 404s even on `.raw`
 *
 * Outside that window the login popup renders the gateway's
 * "Response Verification Error" page and the app simply waits until the user
 * closes it. Nothing points at the cause.
 *
 * Asking the canister over the agent avoids the gateway, so the answer is about
 * the canister's assets rather than about how the gateway felt about them.
 */

import { Actor, type HttpAgent } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"

/** The `http_request` query every asset-serving canister exposes. */
const httpInterface: IDL.InterfaceFactory = ({ IDL }) => {
  const HeaderField = IDL.Tuple(IDL.Text, IDL.Text)
  return IDL.Service({
    http_request: IDL.Func(
      [
        IDL.Record({
          method: IDL.Text,
          url: IDL.Text,
          headers: IDL.Vec(HeaderField),
          body: IDL.Vec(IDL.Nat8),
        }),
      ],
      [
        IDL.Record({
          status_code: IDL.Nat16,
          headers: IDL.Vec(HeaderField),
          body: IDL.Vec(IDL.Nat8),
        }),
      ],
      ["query"]
    ),
  })
}

interface HttpCapableActor {
  http_request: (request: {
    method: string
    url: string
    headers: [string, string][]
    body: Uint8Array
  }) => Promise<{ status_code: number }>
}

/** Where a given Internet Identity build expects the sign-in flow to start. */
export type AuthorizePath = "/authorize" | "/#authorize"

export interface LocalIiProbe {
  /** The path that works, or `null` when the canister serves no sign-in UI. */
  path: AuthorizePath | null
  /**
   * The probe could not reach a conclusion — the canister was unreachable, or
   * it does not expose `http_request` at all. Callers keep their existing
   * behaviour rather than blocking a login that might well work.
   */
  inconclusive: boolean
}

async function statusOf(
  actor: HttpCapableActor,
  url: string
): Promise<number | undefined> {
  try {
    const response = await actor.http_request({
      method: "GET",
      url,
      headers: [],
      body: new Uint8Array(),
    })
    return response.status_code
  } catch {
    return undefined
  }
}

/**
 * Determine which authorize path a locally deployed Internet Identity serves.
 *
 * Never throws. A probe that cannot answer returns `inconclusive`, because a
 * diagnostic that blocks a working setup is worse than the failure it explains.
 */
export async function probeLocalInternetIdentity(
  agent: HttpAgent,
  canisterId: string
): Promise<LocalIiProbe> {
  let actor: HttpCapableActor
  try {
    actor = Actor.createActor<HttpCapableActor>(httpInterface, {
      agent,
      canisterId,
    })
  } catch {
    return { path: "/authorize", inconclusive: true }
  }

  const authorize = await statusOf(actor, "/authorize")

  // The canister does not answer http_request at all — not an asset canister,
  // not deployed, or the replica is down. Not our call to make.
  if (authorize === undefined) {
    return { path: "/authorize", inconclusive: true }
  }

  if (authorize >= 200 && authorize < 300) {
    return { path: "/authorize", inconclusive: false }
  }

  // Pre-2026 builds serve the SPA at the root and drive the flow from a
  // `#authorize` fragment, which is a path the gateway never sees.
  const root = await statusOf(actor, "/")
  if (root !== undefined && root >= 200 && root < 300) {
    return { path: "/#authorize", inconclusive: false }
  }

  return { path: null, inconclusive: false }
}

/**
 * The error a login gets when the installed build serves no sign-in UI, in
 * place of a 503 page inside a popup the app cannot see.
 */
export function localInternetIdentityUnavailableError(
  canisterId: string
): Error {
  return new Error(
    `[ic-reactor] The Internet Identity canister ${canisterId} does not serve a sign-in UI: ` +
      `neither /authorize nor / returned a page. Internet Identity builds from ` +
      `release-2026-03-23 onward moved their frontend out of the canister (the id.ai split) ` +
      `and cannot be used locally. Install internet_identity_dev.wasm from release-2026-03-16, ` +
      `the newest build that still self-serves /authorize, or point \`identityProvider\` at a ` +
      `provider you host yourself.`
  )
}
