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

    const requestAttributes = useCallback(
      async (params: RequestIdentityAttributesParameters) => {
        setIsRequestingAttributes(true)
        setAttributeError(null)
        try {
          const result = await identityAttributes.request(params)
          setAttributes(result)
          return result
        } catch (error) {
          setAttributeError(error as Error)
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
        try {
          const result = await identityAttributes.requestOpenId(params)
          setAttributes(result)
          return result
        } catch (error) {
          setAttributeError(error as Error)
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
      const currentPrincipal = () =>
        authentication.authState.isAuthenticated
          ? authentication.authState.identity?.getPrincipal().toText()
          : undefined

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
