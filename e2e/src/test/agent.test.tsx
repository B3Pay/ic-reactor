import { describe, it, expect, beforeAll } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { createAuthHooks } from "@ic-reactor/react"
import { ClientManager } from "@ic-reactor/core"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

describe("Auth Hooks Test", () => {
  const queryClient = new QueryClient()

  const clientManager = new ClientManager({
    withCanisterEnv: true,
    agentOptions: {
      verifyQuerySignatures: false,
    },
    queryClient,
  })

  const { useAuth, useAgentState } = createAuthHooks(clientManager)

  beforeAll(async () => {
    await clientManager.initialize()
  })

  it("should provide auth state with default values", async () => {
    const TestComponent = () => {
      const { isAuthenticated, principal } = useAuth()

      return (
        <div>
          <span data-testid="auth-status">
            {isAuthenticated ? "Authenticated" : "Anonymous"}
          </span>
          <span data-testid="principal">{principal?.toText() || "none"}</span>
        </div>
      )
    }

    render(
      <QueryClientProvider client={queryClient}>
        <TestComponent />
      </QueryClientProvider>
    )

    // Wait for auth state to settle (useAuth auto-initializes)
    await waitFor(() => {
      expect(screen.getByTestId("auth-status")).toHaveTextContent("Anonymous")
    })
    expect(screen.getByTestId("principal")).toHaveTextContent("none")
  })

  it("should access clientManager directly", () => {
    expect(clientManager).toBeDefined()
    expect(clientManager.network).toBeDefined()
  })

  it("should provide auth state with useAuthState after initialization", async () => {
    const TestComponent = () => {
      const { isInitialized, isInitializing } = useAgentState()

      return (
        <div>
          <span data-testid="is-initialized">
            {isInitialized ? "yes" : "no"}
          </span>
          <span data-testid="is-initializing">
            {isInitializing ? "yes" : "no"}
          </span>
        </div>
      )
    }

    render(
      <QueryClientProvider client={queryClient}>
        <TestComponent />
      </QueryClientProvider>
    )

    // Wait for initialization to complete (isInitializing becomes false)
    await waitFor(() => {
      expect(screen.getByTestId("is-initializing")).toHaveTextContent("no")
    })
    expect(screen.getByTestId("is-initialized")).toHaveTextContent("yes")
  })
})
