import type {
  AuthenticationClientOptions,
  IdentityAttributeResult,
  RequestIdentityAttributesParameters,
  RequestOpenIdIdentityAttributesParameters,
} from "./types"

import { AuthenticationManager } from "./authentication-manager"
import {
  decodeIdentityAttributeValues,
  identityAttributeKeys,
  normalizeSignedIdentityAttributes,
} from "./identity-attributes"

/**
 * Requests signed identity attributes through an AuthenticationManager.
 *
 * This optional feature is separated from normal sign-in/session management
 * so applications that only need authentication do not carry its workflow in
 * their primary manager.
 */
export class IdentityAttributesManager {
  constructor(public readonly authentication: AuthenticationManager) {}

  public request = async ({
    keys,
    nonce,
    identityProvider,
    openIdProvider,
    windowOpenerFeatures,
    signIn = true,
    maxTimeToLive,
    targets,
  }: RequestIdentityAttributesParameters): Promise<IdentityAttributeResult> => {
    const authClient = await this.authentication.ensureClient(
      getAuthClientOptions({
        identityProvider,
        windowOpenerFeatures,
        openIdProvider,
      })
    )

    if (!authClient) {
      throw new Error(
        "Authentication module is missing or failed to initialize. To request identity attributes, please install @icp-sdk/auth v7 or provide a compatible authClient."
      )
    }

    this.authentication.setAuthenticating()

    try {
      const identityPromise = signIn
        ? this.authentication.signInOrRecoverIdentity({
            maxTimeToLive,
            targets,
          })
        : Promise.resolve(authClient.getIdentity())
      const requestPromise = authClient.requestAttributes({ keys, nonce })

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

  public requestOpenId = async ({
    nonce,
    openIdProvider,
    keys,
    identityProvider,
    windowOpenerFeatures,
    signIn,
    maxTimeToLive,
    targets,
  }: RequestOpenIdIdentityAttributesParameters): Promise<IdentityAttributeResult> => {
    return this.request({
      keys: identityAttributeKeys({ openIdProvider, keys }),
      nonce,
      identityProvider,
      openIdProvider,
      windowOpenerFeatures,
      signIn,
      maxTimeToLive,
      targets,
    })
  }
}

function getAuthClientOptions(
  options: AuthenticationClientOptions
): AuthenticationClientOptions {
  return {
    identityProvider: options.identityProvider,
    windowOpenerFeatures: options.windowOpenerFeatures,
    openIdProvider:
      options.openIdProvider === "google" ||
      options.openIdProvider === "apple" ||
      options.openIdProvider === "microsoft"
        ? options.openIdProvider
        : undefined,
  }
}
