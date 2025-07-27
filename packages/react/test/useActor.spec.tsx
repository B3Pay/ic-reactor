import React, { createContext } from "react"
import { describe, it, expect } from "bun:test"
import { render, waitFor } from "@testing-library/react"
import { backend, idlFactory } from "./candid"
import { AgentProvider, CandidAdapterProvider, useActor } from "../dist"
import { ActorHooksReturnType } from "../dist/types"
import { extractActorContext } from "../dist/helpers"

type Backend = typeof backend

describe("useActor Tests", () => {
  it("should handle actor loading and queries", async () => {
    const BackendActor = () => {
      const { hooks, fetchError, isAuthenticating, isFetching } =
        useActor<Backend>({
          canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
          idlFactory,
        })

      return isFetching || isAuthenticating ? (
        <p data-testid="loading">Loading Candid interface...</p>
      ) : fetchError ? (
        <p data-testid="error">Error: {fetchError}</p>
      ) : (
        hooks && <TestComponent {...hooks} />
      )
    }

    const TestComponent = ({ useQueryCall }: ActorHooksReturnType<Backend>) => {
      const { data: version, loading } = useQueryCall({
        functionName: "version",
      })

      return (
        <div>
          <span data-testid="version-status">
            {loading
              ? "Loading..."
              : version
              ? version.toString()
              : "Ready To call"}
          </span>
        </div>
      )
    }

    const { container } = render(
      <AgentProvider>
        <CandidAdapterProvider>
          <BackendActor />
        </CandidAdapterProvider>
      </AgentProvider>
    )

    // Wait for loading to complete
    await waitFor(
      () => {
        const loadingElement = container.querySelector(
          '[data-testid="loading"]'
        )
        expect(loadingElement).toBeNull()
      },
      { timeout: 3000 }
    )

    const versionStatus = container.querySelector(
      '[data-testid="version-status"]'
    ) as HTMLElement

    await waitFor(
      () => {
        expect(versionStatus.textContent).toBe("0.2.0")
      },
      { timeout: 3000 }
    )
  })

  it("should work with context pattern", async () => {
    const ActorContext = createContext<ActorHooksReturnType<Backend> | null>(
      null
    )

    const { useQueryCall } = extractActorContext(ActorContext)

    const BackendActor = ({ children }: any) => {
      const { hooks, isFetching, isAuthenticating, fetchError } =
        useActor<Backend>({
          canisterId: "xeka7-ryaaa-aaaal-qb57a-cai",
          idlFactory,
        })

      return (
        <ActorContext.Provider value={hooks}>
          <h2>IC Canister Interaction</h2>
          {(isFetching || isAuthenticating) && (
            <p data-testid="loading">Loading Candid interface...</p>
          )}
          {fetchError && <p data-testid="error">Error: {fetchError}</p>}
          {hooks && children}
        </ActorContext.Provider>
      )
    }

    const CanisterName = () => {
      const { data: version, loading } = useQueryCall({
        functionName: "version",
      })

      return (
        <div>
          <span data-testid="canister-version">
            {loading
              ? "Loading..."
              : version
              ? version.toString()
              : "Ready To call"}
          </span>
        </div>
      )
    }

    const { container } = render(
      <AgentProvider withDevtools>
        <BackendActor>
          <CanisterName />
        </BackendActor>
      </AgentProvider>
    )

    // Wait for loading to complete
    await waitFor(
      () => {
        const loadingElement = container.querySelector(
          '[data-testid="loading"]'
        )
        expect(loadingElement).toBeNull()
      },
      { timeout: 3000 }
    )

    const versionStatus = container.querySelector(
      '[data-testid="canister-version"]'
    ) as HTMLElement

    await waitFor(
      () => {
        expect(versionStatus.textContent).toBe("0.2.0")
      },
      { timeout: 3000 }
    )
  })
})
