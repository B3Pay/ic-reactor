/**
 * A fake Internet Identity provider that speaks the real ICRC-29 (postMessage
 * transport), ICRC-34 (delegation) and `ii-icrc3-attributes` wire protocols.
 *
 * These tests drive the *real* `AuthClient` from `@icp-sdk/auth/client` — no
 * `vi.mock` of the auth package — so regressions in the actual integration
 * (option pass-through, nonce contract, popup gesture chain, session restore)
 * surface here instead of in production.
 */
import { vi } from "vitest"
import {
  DelegationChain,
  Ed25519KeyIdentity,
  type SignedDelegation,
} from "@icp-sdk/core/identity"
import { Principal } from "@icp-sdk/core/principal"
import { IDL } from "@icp-sdk/core/candid"

export const FAKE_II_ORIGIN = "https://id.ai"

interface JsonRpcRequest {
  jsonrpc: "2.0"
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

export interface DelegationRequestRecord {
  publicKey: string
  targets?: string[]
  maxTimeToLive?: string
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
  attributesError?: { code: number; message: string }
  /** Delegation lifetime in ms, relative to now. */
  delegationLifetimeMs?: number
}

export interface FakeIdentityProvider {
  readonly rootIdentity: Ed25519KeyIdentity
  /** URL each `window.open` call was made against. */
  readonly openedUrls: string[]
  /** Every window that was opened; `closed` reflects real `close()` calls. */
  readonly windows: FakeSignerWindow[]
  readonly delegationRequests: DelegationRequestRecord[]
  readonly attributesRequests: AttributesRequestRecord[]
  /** Number of `window.open` calls, i.e. distinct II popups shown to the user. */
  readonly openCount: number
  setAttributesResponse(payload: {
    data: Uint8Array
    signature: Uint8Array
  }): void
  setAttributesError(error: { code: number; message: string } | null): void
  restore(): void
}

export interface FakeSignerWindow {
  closed: boolean
  close(): void
  focus(): void
  postMessage(message: unknown, targetOrigin?: string): void
}

/**
 * Installs a fake II provider over `window.open` for the duration of a test.
 */
export function installFakeIdentityProvider(
  options: FakeIdentityProviderOptions = {}
): FakeIdentityProvider {
  const rootIdentity = options.rootIdentity ?? Ed25519KeyIdentity.generate()
  const delegationLifetimeMs =
    options.delegationLifetimeMs ?? 8 * 60 * 60 * 1000

  let attributesResponse =
    options.attributesResponse ?? defaultAttributesResponse()
  let attributesError = options.attributesError ?? null

  const openedUrls: string[] = []
  const windows: FakeSignerWindow[] = []
  const delegationRequests: DelegationRequestRecord[] = []
  const attributesRequests: AttributesRequestRecord[] = []

  const originalOpen = window.open

  const openSpy = vi.fn(
    (url?: string | URL, _target?: string, _features?: string) => {
      openedUrls.push(String(url ?? ""))
      const signerWindow = createSignerWindow()
      windows.push(signerWindow)
      return signerWindow as unknown as Window
    }
  )

  // jsdom types `window.open` more narrowly than the spy signature.
  window.open = openSpy as unknown as typeof window.open

  function createSignerWindow(): FakeSignerWindow {
    const signerWindow: FakeSignerWindow = {
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
      origin: FAKE_II_ORIGIN,
    })
    Object.defineProperty(event, "source", { value: source })
    window.dispatchEvent(event)
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

        const sessionKeyDer = fromBase64(params.publicKey)
        const expiration = new Date(Date.now() + delegationLifetimeMs)
        const targets = params.targets?.map((text) => Principal.fromText(text))

        const chain = await DelegationChain.create(
          rootIdentity,
          { toDer: () => sessionKeyDer } as never,
          expiration,
          targets ? { targets } : undefined
        )

        respond(source, {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            publicKey: toBase64(new Uint8Array(chain.publicKey)),
            signerDelegation: chain.delegations.map(
              (signed: SignedDelegation) => ({
                delegation: {
                  pubkey: toBase64(new Uint8Array(signed.delegation.pubkey)),
                  expiration: signed.delegation.expiration.toString(),
                  ...(signed.delegation.targets
                    ? {
                        targets: signed.delegation.targets.map((t) =>
                          t.toText()
                        ),
                      }
                    : {}),
                },
                signature: toBase64(new Uint8Array(signed.signature)),
              })
            ),
          },
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

  return {
    rootIdentity,
    openedUrls,
    windows,
    delegationRequests,
    attributesRequests,
    get openCount() {
      return openSpy.mock.calls.length
    },
    setAttributesResponse(payload) {
      attributesResponse = payload
    },
    setAttributesError(error) {
      attributesError = error
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
