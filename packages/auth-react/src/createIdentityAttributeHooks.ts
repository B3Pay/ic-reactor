import { useCallback, useState } from "react"
import type {
  IdentityAttributeResult,
  IdentityAttributesManager,
  RequestIdentityAttributesParameters,
  RequestOpenIdIdentityAttributesParameters,
} from "@ic-reactor/auth"

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
