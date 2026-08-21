import type {
  IdentityAttributeNonce,
  IdentityAttributeResult,
  RequestIdentityAttributesParameters,
  RequestOpenIdIdentityAttributesParameters,
} from "./types.js"

import { AuthenticationManager } from "./authentication-manager.js"
import {
  decodeIdentityAttributeValues,
  identityAttributeKeys,
  normalizeSignedIdentityAttributes,
} from "./identity-attributes.js"

/**
 * Requests and decodes signed identity attributes for an authenticated
 * Internet Identity session.
 *
 * Await `authentication.prepareClient()` once during startup (the `useAuth`
 * hook already does) so that {@link request} can open the identity provider
 * window synchronously from a click handler.
 *
 * @example
 * ```ts
 * const attributes = new IdentityAttributesManager(authentication)
 * const result = await attributes.request({
 *   keys: ["name"],
 *   nonce: () => fetchNonceFromCanister(),
 * })
 * ```
 */
export class IdentityAttributesManager {
  constructor(public readonly authentication: AuthenticationManager) {}

  public request = async ({
    keys,
    nonce,
    signIn = true,
    maxTimeToLive,
    targets,
    ...clientOptions
  }: RequestIdentityAttributesParameters): Promise<IdentityAttributeResult> => {
    // Nothing may be awaited before `requestAttributes` / `signIn` are invoked:
    // the ICRC-29 transport only opens the identity provider window while the
    // browser still considers us inside the user gesture. `getPreparedClient`
    // is synchronous whenever `prepareClient()` has run.
    const preparedClient = this.authentication.getPreparedClient(clientOptions)
    const authClient =
      preparedClient ?? (await this.authentication.ensureClient(clientOptions))

    if (!authClient) {
      throw new Error(
        "Authentication module is missing or failed to initialize. To request identity attributes, please install @icp-sdk/auth v8, or provide a compatible authClient."
      )
    }

    this.authentication.setAuthenticating()

    try {
      // `signIn` first: it opens the transport channel synchronously, and the
      // attribute request then reuses that same channel and window.
      const identityPromise = signIn
        ? this.authentication.signInOrRecoverIdentity({
            maxTimeToLive,
            targets,
          })
        : Promise.resolve(authClient.getIdentity())
      const requestPromise = authClient.requestAttributes({
        keys,
        nonce: toAuthClientNonce(nonce),
      })

      const [signedAttributes, identity] = await Promise.all([
        requestPromise,
        identityPromise,
      ])

      const finalIdentity = identity ?? (await authClient.getIdentity())
      const isAuthenticated = await authClient.isAuthenticated()
      await this.authentication.commitIdentity(finalIdentity, isAuthenticated)

      const normalizedSignedAttributes =
        normalizeSignedIdentityAttributes(signedAttributes)

      return {
        principal: finalIdentity.getPrincipal().toText(),
        requestedKeys: keys,
        signedAttributes: normalizedSignedAttributes,
        decodedAttributes: decodeIdentityAttributeValues(
          normalizedSignedAttributes.data,
          keys
        ),
        completedAt: new Date().toISOString(),
      }
    } catch (error) {
      this.authentication.setAuthenticationError(error as Error)
      throw error
    }
  }

  public requestOpenId = ({
    keys,
    openIdProvider,
    ...rest
  }: RequestOpenIdIdentityAttributesParameters): Promise<IdentityAttributeResult> => {
    // Called (not awaited) synchronously so the user gesture is preserved.
    return this.request({
      ...rest,
      openIdProvider,
      keys: identityAttributeKeys({ openIdProvider, keys }),
    })
  }
}

/**
 * Adapts our nonce input to the `@icp-sdk/auth` nonce contract.
 *
 * v8 takes `() => Promise<Uint8Array>` — a thunk, so it can journal the value
 * and replay the same bytes through a redirect flow. The thunk form also opens
 * the transport channel synchronously, which is what preserves the user
 * gesture.
 *
 * Until 3.12.0 this probed `typeof authClient.memoize === "function"` to detect
 * v8 and fell back to a bare promise for v7. The peer range is now `^8.0.0`, so
 * the probe would only ever take one branch.
 */
function toAuthClientNonce(
  nonce: IdentityAttributeNonce
): () => Promise<Uint8Array> {
  return () => Promise.resolve(typeof nonce === "function" ? nonce() : nonce)
}
