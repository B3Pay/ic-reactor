/**
 * A fake Internet Identity provider that speaks the real ICRC-29 (postMessage
 * transport), ICRC-34 (delegation) and `ii-icrc3-attributes` wire protocols,
 * plus the session protocol `@icp-sdk/auth` v10 signs in with.
 *
 * These tests drive the *real* `AuthClient` from `@icp-sdk/auth/client` — no
 * `vi.mock` of the auth package — so regressions in the actual integration
 * (option pass-through, nonce contract, popup gesture chain, session restore)
 * surface here instead of in production.
 *
 * The two majors sign in differently:
 *
 * - v8 asks the popup for `icrc34_delegation` and receives a delegation chain
 *   to its session key, rooted at the user's key.
 * - v10 asks the popup for `ii_session_delegation` and receives a session
 *   chain that may call only the Internet Identity canister. It then mints the
 *   delegation it acts with from that canister (`app_prepare_delegation`,
 *   `app_get_delegation`), and `signOut()` revokes the session there
 *   (`app_revoke_session`). {@link FakeIdentityProvider.canister} is that
 *   canister, for a fake replica to route to.
 */
import { vi } from "vitest"
import {
  DelegationChain,
  Ed25519KeyIdentity,
  type SignedDelegation,
} from "@icp-sdk/core/identity"
import { Principal } from "@icp-sdk/core/principal"
import { IDL } from "@icp-sdk/core/candid"
import { LOCAL_INTERNET_IDENTITY_CANISTER_ID } from "../../src/auth/constants.js"
import type { FakeCanister } from "./fake-replica.js"

interface JsonRpcRequest {
  jsonrpc: "2.0"
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcError {
  code: number
  message: string
}

export interface DelegationRequestRecord {
  publicKey: string
  targets?: string[]
  maxTimeToLive?: string
  icrc95DerivationOrigin?: string
}

export interface SessionRequestRecord {
  sessionPublicKey: string
  maxTimeToLive?: string
  maxTimeToIdle?: string
  icrc95DerivationOrigin?: string
}

export interface AttributesRequestRecord {
  keys: string[]
  nonce: string
  icrc95DerivationOrigin?: string
}

export interface FakeIdentityProviderOptions {
  /** Identity used as the delegation root (the "user" in Internet Identity). */
  rootIdentity?: Ed25519KeyIdentity
  /** Payload returned for `ii-icrc3-attributes`. Defaults to a Candid map. */
  attributesResponse?: { data: Uint8Array; signature: Uint8Array }
  /** Force `ii-icrc3-attributes` to answer with a JSON-RPC error. */
  attributesError?: JsonRpcError
  /** Delegation lifetime in ms, relative to now. */
  delegationLifetimeMs?: number
  /** The canister a v10 session chain is restricted to and mints from. */
  canisterId?: string
}

export interface FakeIdentityProvider {
  readonly rootIdentity: Ed25519KeyIdentity
  /** The Internet Identity canister v10 mints from; see the module comment. */
  readonly canister: FakeCanister
  readonly canisterId: string
  /** URL each `window.open` call was made against. */
  readonly openedUrls: string[]
  /** Every window that was opened; `closed` reflects real `close()` calls. */
  readonly windows: FakeSignerWindow[]
  /** v8 sign-ins: `icrc34_delegation` requests. */
  readonly delegationRequests: DelegationRequestRecord[]
  /** v10 sign-ins: `ii_session_delegation` requests. */
  readonly sessionRequests: SessionRequestRecord[]
  /** Sign-in requests of either protocol. */
  readonly signInRequestCount: number
  readonly attributesRequests: AttributesRequestRecord[]
  /** Principals of the v10 sessions `app_revoke_session` ended. */
  readonly revokedSessions: string[]
  /** Number of `window.open` calls, i.e. distinct II popups shown to the user. */
  readonly openCount: number
  setAttributesResponse(payload: {
    data: Uint8Array
    signature: Uint8Array
  }): void
  setAttributesError(error: JsonRpcError | null): void
  /** Make sign-in requests of either protocol answer with this error. */
  setSignInError(error: JsonRpcError | null): void
  /**
   * Make `app_revoke_session` answer `Err InternalCanisterError` with this
   * text and keep the session, as the canister does when it fails to write.
   */
  setRevokeError(message: string | null): void
  restore(): void
}

export interface FakeSignerWindow {
  /** The origin the window was opened at, which its messages come from. */
  readonly origin: string
  closed: boolean
  close(): void
  focus(): void
  postMessage(message: unknown, targetOrigin?: string): void
}

/** How long a minted app delegation lasts, capped by its session. */
const APP_DELEGATION_LIFETIME_MS = 30 * 60 * 1000

// The slice of the Internet Identity interface v10 calls, as `@icp-sdk/auth`
// declares it in `session-minter.ts`, plus the `http_request` a local
// `AuthenticationManager` probes the sign-in page with.
const SessionKey = IDL.Vec(IDL.Nat8)
const AppSessionError = IDL.Variant({
  NoSuchSession: IDL.Null,
  NoSuchDelegation: IDL.Null,
  InternalCanisterError: IDL.Text,
})
const PrepareRequest = IDL.Record({ session_key: SessionKey })
const PrepareResult = IDL.Variant({
  Ok: IDL.Record({ user_key: SessionKey, expiration: IDL.Nat64 }),
  Err: AppSessionError,
})
const GetRequest = IDL.Record({
  session_key: SessionKey,
  expiration: IDL.Nat64,
})
const GetResult = IDL.Variant({
  Ok: IDL.Record({
    delegation: IDL.Record({
      pubkey: SessionKey,
      expiration: IDL.Nat64,
      targets: IDL.Opt(IDL.Vec(IDL.Principal)),
      permissions: IDL.Opt(IDL.Text),
    }),
    signature: SessionKey,
  }),
  Err: AppSessionError,
})
const RevokeResult = IDL.Variant({ Ok: IDL.Null, Err: AppSessionError })
const HeaderField = IDL.Tuple(IDL.Text, IDL.Text)
const HttpResponse = IDL.Record({
  status_code: IDL.Nat16,
  headers: IDL.Vec(HeaderField),
  body: IDL.Vec(IDL.Nat8),
})

const encodeOne = (type: IDL.Type, value: unknown) =>
  new Uint8Array(IDL.encode([type], [value]))

/**
 * Installs a fake II provider over `window.open` for the duration of a test.
 */
export function installFakeIdentityProvider(
  options: FakeIdentityProviderOptions = {}
): FakeIdentityProvider {
  const rootIdentity = options.rootIdentity ?? Ed25519KeyIdentity.generate()
  const delegationLifetimeMs =
    options.delegationLifetimeMs ?? 8 * 60 * 60 * 1000
  const canisterId = options.canisterId ?? LOCAL_INTERNET_IDENTITY_CANISTER_ID

  let attributesResponse =
    options.attributesResponse ?? defaultAttributesResponse()
  let attributesError = options.attributesError ?? null
  let signInError: JsonRpcError | null = null
  let revokeError: string | null = null

  const openedUrls: string[] = []
  const windows: FakeSignerWindow[] = []
  const delegationRequests: DelegationRequestRecord[] = []
  const sessionRequests: SessionRequestRecord[] = []
  const attributesRequests: AttributesRequestRecord[] = []
  const revokedSessions: string[] = []

  /** Live v10 sessions, by the principal their chain is rooted at. */
  const sessions = new Map<string, { expiresAtMs: number }>()
  /** `app_prepare_delegation` results not yet collected, as `key:expiration`. */
  const prepared = new Set<string>()

  const originalOpen = window.open

  const openSpy = vi.fn(
    (url?: string | URL, _target?: string, _features?: string) => {
      openedUrls.push(String(url ?? ""))
      const signerWindow = createSignerWindow(new URL(String(url)).origin)
      windows.push(signerWindow)
      return signerWindow as unknown as Window
    }
  )

  // jsdom types `window.open` more narrowly than the spy signature.
  window.open = openSpy as unknown as typeof window.open

  function createSignerWindow(origin: string): FakeSignerWindow {
    const signerWindow: FakeSignerWindow = {
      origin,
      closed: false,
      close() {
        signerWindow.closed = true
      },
      focus() {},
      postMessage(message: unknown) {
        if (signerWindow.closed) return
        void handleRequest(signerWindow, message as JsonRpcRequest)
      },
    }
    return signerWindow
  }

  function respond(source: FakeSignerWindow, data: unknown) {
    // The channel filters on `event.source` and `event.origin`, so both have to
    // match the window the transport opened.
    const event = new MessageEvent("message", {
      data,
      origin: source.origin,
    })
    Object.defineProperty(event, "source", { value: source })
    window.dispatchEvent(event)
  }

  /**
   * How long a delegation lasts: the provider's lifetime, shortened to the
   * requested `maxTimeToLive`. A real identity provider never issues a
   * delegation that outlives `maxTimeToLive`, and from @icp-sdk/auth v8 the
   * signer validates exactly that — a fixture that always returned its own
   * fixed lifetime made every maxTimeToLive test fail with "Returned
   * delegation expires later than the requested maxTimeToLive". The parameter
   * is nanoseconds, per ICRC-34.
   */
  function expirationFor(maxTimeToLive: string | undefined): Date {
    const requestedLifetimeMs = maxTimeToLive
      ? Number(BigInt(maxTimeToLive) / 1_000_000n)
      : undefined
    return new Date(
      Date.now() +
        Math.min(
          delegationLifetimeMs,
          requestedLifetimeMs ?? delegationLifetimeMs
        )
    )
  }

  /** The chain as both sign-in protocols put it on the wire. */
  function toWire(chain: DelegationChain) {
    return {
      publicKey: toBase64(new Uint8Array(chain.publicKey)),
      signerDelegation: chain.delegations.map((signed: SignedDelegation) => ({
        delegation: {
          pubkey: toBase64(new Uint8Array(signed.delegation.pubkey)),
          expiration: signed.delegation.expiration.toString(),
          ...(signed.delegation.targets
            ? {
                targets: signed.delegation.targets.map((t) => t.toText()),
              }
            : {}),
        },
        signature: toBase64(new Uint8Array(signed.signature)),
      })),
    }
  }

  async function handleRequest(
    source: FakeSignerWindow,
    request: JsonRpcRequest
  ) {
    if (!request || request.jsonrpc !== "2.0") return

    switch (request.method) {
      case "icrc29_status": {
        respond(source, { jsonrpc: "2.0", id: request.id, result: "ready" })
        return
      }
      case "icrc34_delegation": {
        const params = (request.params ?? {}) as unknown as {
          publicKey: string
          targets?: string[]
          maxTimeToLive?: string
          icrc95DerivationOrigin?: string
        }
        delegationRequests.push({
          publicKey: params.publicKey,
          targets: params.targets,
          maxTimeToLive: params.maxTimeToLive,
          icrc95DerivationOrigin: params.icrc95DerivationOrigin,
        })

        if (signInError) {
          respond(source, {
            jsonrpc: "2.0",
            id: request.id,
            error: signInError,
          })
          return
        }

        const sessionKeyDer = fromBase64(params.publicKey)
        const targets = params.targets?.map((text) => Principal.fromText(text))

        const chain = await DelegationChain.create(
          rootIdentity,
          { toDer: () => sessionKeyDer } as never,
          expirationFor(params.maxTimeToLive),
          targets ? { targets } : undefined
        )

        respond(source, {
          jsonrpc: "2.0",
          id: request.id,
          result: toWire(chain),
        })
        return
      }
      case "ii_session_delegation": {
        const params = (request.params ?? {}) as unknown as {
          sessionPublicKey: string
          maxTimeToLive?: string
          maxTimeToIdle?: string
          icrc95DerivationOrigin?: string
        }
        sessionRequests.push({
          sessionPublicKey: params.sessionPublicKey,
          maxTimeToLive: params.maxTimeToLive,
          maxTimeToIdle: params.maxTimeToIdle,
          icrc95DerivationOrigin: params.icrc95DerivationOrigin,
        })

        if (signInError) {
          respond(source, {
            jsonrpc: "2.0",
            id: request.id,
            error: signInError,
          })
          return
        }

        // Stands in for the key Internet Identity signs a session with. The
        // chain it roots may call only the Internet Identity canister, which
        // `@icp-sdk/auth` v10 refuses to mint from otherwise.
        const sessionRoot = Ed25519KeyIdentity.generate()
        const expiration = expirationFor(params.maxTimeToLive)
        const chain = await DelegationChain.create(
          sessionRoot,
          { toDer: () => fromBase64(params.sessionPublicKey) } as never,
          expiration,
          { targets: [Principal.fromText(canisterId)] }
        )
        sessions.set(sessionRoot.getPrincipal().toText(), {
          expiresAtMs: expiration.getTime(),
        })

        respond(source, {
          jsonrpc: "2.0",
          id: request.id,
          result: toWire(chain),
        })
        return
      }
      case "ii-icrc3-attributes": {
        const params = (request.params ?? {}) as unknown as {
          keys: string[]
          nonce: string
          icrc95DerivationOrigin?: string
        }
        attributesRequests.push({
          keys: params.keys,
          nonce: params.nonce,
          icrc95DerivationOrigin: params.icrc95DerivationOrigin,
        })

        if (attributesError) {
          respond(source, {
            jsonrpc: "2.0",
            id: request.id,
            error: attributesError,
          })
          return
        }

        respond(source, {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            data: toBase64(attributesResponse.data),
            signature: toBase64(attributesResponse.signature),
          },
        })
        return
      }
      default: {
        respond(source, {
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: 2000,
            message: `Unsupported method ${request.method}`,
          },
        })
      }
    }
  }

  const canister: FakeCanister = {
    update(method, arg, { caller }) {
      const session = sessions.get(caller.toText())

      switch (method) {
        case "app_prepare_delegation": {
          const [{ session_key }] = IDL.decode(
            [PrepareRequest],
            arg
          ) as unknown as [{ session_key: Uint8Array }]
          if (!session) {
            return encodeOne(PrepareResult, { Err: { NoSuchSession: null } })
          }
          // Whole milliseconds, so the delegation `app_get_delegation` signs
          // through `DelegationChain.create` carries this exact expiration.
          const expiresAtMs = Math.min(
            Date.now() + APP_DELEGATION_LIFETIME_MS,
            session.expiresAtMs
          )
          const expiration = BigInt(expiresAtMs) * 1_000_000n
          prepared.add(`${toBase64(session_key)}:${expiration}`)
          return encodeOne(PrepareResult, {
            Ok: {
              user_key: new Uint8Array(rootIdentity.getPublicKey().toDer()),
              expiration,
            },
          })
        }
        case "app_revoke_session": {
          if (revokeError !== null) {
            return encodeOne(RevokeResult, {
              Err: { InternalCanisterError: revokeError },
            })
          }
          // Idempotent, as the canister is: a session already gone is `Ok`.
          sessions.delete(caller.toText())
          revokedSessions.push(caller.toText())
          return encodeOne(RevokeResult, { Ok: null })
        }
        default:
          throw new Error(`Internet Identity has no update ${method}`)
      }
    },

    async query(method, arg, { caller }) {
      switch (method) {
        case "app_get_delegation": {
          const [{ session_key, expiration }] = IDL.decode(
            [GetRequest],
            arg
          ) as unknown as [{ session_key: Uint8Array; expiration: bigint }]
          if (!sessions.has(caller.toText())) {
            return encodeOne(GetResult, { Err: { NoSuchSession: null } })
          }
          if (!prepared.has(`${toBase64(session_key)}:${expiration}`)) {
            return encodeOne(GetResult, { Err: { NoSuchDelegation: null } })
          }
          // Signed by the user's key, so the minted identity's principal is
          // the account's, as it is for a canister signature in production.
          const chain = await DelegationChain.create(
            rootIdentity,
            { toDer: () => session_key } as never,
            new Date(Number(expiration / 1_000_000n))
          )
          const [signed] = chain.delegations
          return encodeOne(GetResult, {
            Ok: {
              delegation: {
                pubkey: session_key,
                expiration: signed.delegation.expiration,
                targets: [],
                permissions: [],
              },
              signature: new Uint8Array(signed.signature),
            },
          })
        }
        case "http_request": {
          // The sign-in page a local AuthenticationManager probes for.
          return encodeOne(HttpResponse, {
            status_code: 200,
            headers: [],
            body: new Uint8Array(),
          })
        }
        default:
          throw new Error(`Internet Identity has no query ${method}`)
      }
    },
  }

  return {
    rootIdentity,
    canister,
    canisterId,
    openedUrls,
    windows,
    delegationRequests,
    sessionRequests,
    get signInRequestCount() {
      return delegationRequests.length + sessionRequests.length
    },
    attributesRequests,
    revokedSessions,
    get openCount() {
      return openSpy.mock.calls.length
    },
    setAttributesResponse(payload) {
      attributesResponse = payload
    },
    setAttributesError(error) {
      attributesError = error
    },
    setSignInError(error) {
      signInError = error
    },
    setRevokeError(message) {
      revokeError = message
    },
    restore() {
      window.open = originalOpen
    },
  }
}

/**
 * Runs `fn` inside a real click dispatch so the ICRC-29 transport's
 * `detectNonClickEstablishment` guard is satisfied — exactly like a browser
 * running a click handler. If the library breaks the user-gesture chain by
 * awaiting before `signIn()`, the transport rejects and the test fails.
 */
export async function withUserGesture<T>(fn: () => Promise<T>): Promise<T> {
  let started: Promise<T> | undefined
  const handler = () => {
    started = fn()
  }
  // Registered after the transport's own capture listener, so `withinClick`
  // is already true by the time `fn` runs.
  window.addEventListener("click", handler, true)
  try {
    window.dispatchEvent(new MouseEvent("click", { bubbles: true }))
  } finally {
    window.removeEventListener("click", handler, true)
  }
  if (!started) {
    throw new Error("click handler did not run")
  }
  return started
}

/** Candid-encoded `vec { record { text; text } }` attribute payload. */
export function encodeAttributes(entries: Array<[string, string]>): Uint8Array {
  return new Uint8Array(
    IDL.encode([IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text))], [entries])
  )
}

function defaultAttributesResponse() {
  return {
    data: encodeAttributes([
      ["openid:https://accounts.google.com:email", "user@example.com"],
      ["openid:https://accounts.google.com:name", "Test User"],
    ]),
    signature: new Uint8Array([1, 2, 3, 4]),
  }
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
