import { useCallback, useEffect, useRef, useState } from "react"
import { Principal } from "@icp-sdk/core/principal"
import type { IdentityAttributesManager } from "./identity-attributes-manager.js"
import type {
  IdentityAttributeResult,
  RequestIdentityAttributesParameters,
  RequestOpenIdIdentityAttributesParameters,
} from "./types.js"

export interface UseIdentityAttributesReturn {
  requestAttributes: (
    params: RequestIdentityAttributesParameters
  ) => Promise<IdentityAttributeResult>
  requestOpenIdAttributes: (
    params: RequestOpenIdIdentityAttributesParameters
  ) => Promise<IdentityAttributeResult>
  attributes: IdentityAttributeResult | null
  isRequestingAttributes: boolean
  attributeError: Error | null
  clearAttributes: () => void
}

/** What `request()` reports as the principal of a signed-out session. */
const ANONYMOUS_PRINCIPAL = Principal.anonymous().toText()

export function createIdentityAttributeHooks(
  identityAttributes: IdentityAttributesManager
) {
  const useIdentityAttributes = (): UseIdentityAttributesReturn => {
    const [attributes, setAttributes] =
      useState<IdentityAttributeResult | null>(null)
    const [isRequestingAttributes, setIsRequestingAttributes] = useState(false)
    const [attributeError, setAttributeError] = useState<Error | null>(null)

    /** The principal the session is currently signed in as, if any. */
    const currentPrincipal = useCallback(() => {
      const { authState } = identityAttributes.authentication
      return authState.isAuthenticated
        ? authState.identity?.getPrincipal().toText()
        : undefined
    }, [])

    /**
     * A request started before a sign-out or an account switch resolves after
     * it, and publishing that result would put the previous user's decoded PII
     * back on screen with no further auth event to clear it again. So a result
     * is committed only when it is the current session's own: it carries the
     * principal signed in when it resolves or, while nobody is, the anonymous
     * principal that a `signIn: false` request made while signed out reports.
     *
     * With `signIn: true` the request itself signs the user in, so the
     * principal seen before the request (none, for a first sign-in; the old
     * account, for a switch made inside the provider window) is never the one
     * the result belongs to. Comparing against it left `attributes` null after
     * every successful first-time sign-in. Nor does "the same principal before
     * and after" mean the session never changed: the request's own sign-in is
     * published only when the whole request ends, so a user who signed in
     * through it and signed out before it ended is nobody on both sides. Their
     * name and email then went up on the signed-out screen.
     */
    const publishIfCurrent = useCallback(
      (result: IdentityAttributeResult) => {
        const session = currentPrincipal() ?? ANONYMOUS_PRINCIPAL
        if (result.principal !== session) return false
        setAttributes(result)
        return true
      },
      [currentPrincipal]
    )

    /**
     * The failure counterpart of `publishIfCurrent`. A request that signs in
     * can fail on its attribute side after its own sign-in went through, and
     * the manager keeps that sign-in before it reports the failure, so the
     * session is now the one this request opened and the failure is that
     * user's to see. A failure that lands after a sign-out is still dropped.
     */
    const publishErrorIfCurrent = useCallback(
      (requestedFor: string | undefined, signsIn: boolean, error: Error) => {
        const current = currentPrincipal()
        if (requestedFor !== current && !(signsIn && current !== undefined)) {
          return
        }
        setAttributeError(error)
      },
      [currentPrincipal]
    )

    const requestAttributes = useCallback(
      async (params: RequestIdentityAttributesParameters) => {
        setIsRequestingAttributes(true)
        setAttributeError(null)
        const requestedFor = currentPrincipal()
        try {
          const result = await identityAttributes.request(params)
          publishIfCurrent(result)
          return result
        } catch (error) {
          publishErrorIfCurrent(
            requestedFor,
            params.signIn !== false,
            error as Error
          )
          throw error
        } finally {
          setIsRequestingAttributes(false)
        }
      },
      []
    )

    const requestOpenIdAttributes = useCallback(
      async (params: RequestOpenIdIdentityAttributesParameters) => {
        setIsRequestingAttributes(true)
        setAttributeError(null)
        const requestedFor = currentPrincipal()
        try {
          const result = await identityAttributes.requestOpenId(params)
          publishIfCurrent(result)
          return result
        } catch (error) {
          publishErrorIfCurrent(
            requestedFor,
            params.signIn !== false,
            error as Error
          )
          throw error
        } finally {
          setIsRequestingAttributes(false)
        }
      },
      []
    )

    const clearAttributes = useCallback(() => {
      setAttributes(null)
      setAttributeError(null)
    }, [])

    // Decoded attributes are the signed-in user's personal data — a name, an
    // email. They used to survive a sign-out or a switch to another account,
    // so the next person to look at the screen saw the previous user's details.
    // Drop them whenever the principal behind them changes.
    const attributedPrincipal = useRef<string | undefined>(undefined)
    useEffect(() => {
      const { authentication } = identityAttributes
      attributedPrincipal.current ??= currentPrincipal()

      return authentication.subscribeAuthState(() => {
        const principal = currentPrincipal()
        if (principal === attributedPrincipal.current) return
        attributedPrincipal.current = principal
        setAttributes(null)
        setAttributeError(null)
      })
    }, [])

    return {
      requestAttributes,
      requestOpenIdAttributes,
      attributes,
      isRequestingAttributes,
      attributeError,
      clearAttributes,
    }
  }

  return { useIdentityAttributes }
}
