/**
 * ICRC1Provider - Custom Provider with Dynamic Canister ID
 *
 * This component demonstrates how to create a custom provider that supports
 * dynamic canister IDs using the v3 API. It creates a Reactor instance and
 * exposes the generated hooks via React Context.
 */
import {
  PropsWithChildren,
  createContext,
  useContext,
  useMemo,
  useState,
} from "react"
import { Reactor } from "@ic-reactor/core"
import { createActorHooks, ActorHooks } from "@ic-reactor/react"
import { idlFactory, type ICRC1 } from "./declarations/icrc1"
import { clientManager } from "./reactor"

// ============================================================================
// 1. Context Definition
// ============================================================================

type ICRC1Hooks = ActorHooks<ICRC1, "candid">

interface ICRC1ContextValue {
  canisterId: string
  hooks: ICRC1Hooks
  error: string | null
}

const ICRC1Context = createContext<ICRC1ContextValue | null>(null)

// ============================================================================
// 2. Custom Hook to use the Provider
// ============================================================================

export const useICRC1Context = () => {
  const context = useContext(ICRC1Context)
  if (!context) {
    throw new Error("useICRC1Context must be used within an ICRC1Provider")
  }
  return context
}

// ============================================================================
// 4. Provider Component
// ============================================================================

interface ICRC1ProviderProps extends PropsWithChildren {
  canisterId: string
}

const ICRC1Provider: React.FC<ICRC1ProviderProps> = ({
  children,
  canisterId,
}) => {
  const [error, setError] = useState<string | null>(null)

  // Create Reactor and hooks when canister ID changes
  const hooks = useMemo<ICRC1Hooks>(() => {
    try {
      setError(null)
      const reactor = new Reactor<ICRC1>({
        name: "icrc1",
        clientManager,
        canisterId,
        idlFactory,
      })

      return createActorHooks(reactor)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      throw e
    }
  }, [canisterId])

  return (
    <ICRC1Context.Provider value={{ canisterId, hooks, error }}>
      {error && (
        <div className="card">
          <div className="transfer-result error">
            <strong>Error:</strong> {error}
          </div>
        </div>
      )}
      {hooks && children}
    </ICRC1Context.Provider>
  )
}

ICRC1Provider.displayName = "ICRC1Provider"

export default ICRC1Provider
