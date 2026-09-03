import { useCallback, useEffect, useRef, useState } from "react"
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
     * is committed only when it is the signed-in user's own: it carries the
     * principal that is current when it resolves, or the session has not
     * changed since it was asked for.
     *
     * The first test is the one the default flow needs. With `signIn: true`
     * the request itself signs the user in, so the principal seen before the
     * request (none, for a first sign-in; the old account, for a switch made
     * inside the provider window) is never the one the result belongs to.
     * Comparing against the pre-request principal alone left the hook's
     * `attributes` null after every successful first-time sign-in.
     */
    const isCurrent = useCallback(
      (requestedFor: string | undefined) => requestedFor === currentPrincipal(),
      [currentPrincipal]
    )

    const publishIfCurrent = useCallback(
      (requestedFor: string | undefined, result: IdentityAttributeResult) => {
        const current = currentPrincipal()
        if (result.principal !== current && requestedFor !== current) {
          return false
        }
        setAttributes(result)
        return true
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
          publishIfCurrent(requestedFor, result)
          return result
        } catch (error) {
          if (isCurrent(requestedFor)) setAttributeError(error as Error)
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
          publishIfCurrent(requestedFor, result)
          return result
        } catch (error) {
          if (isCurrent(requestedFor)) setAttributeError(error as Error)
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
