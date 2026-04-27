import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"
import React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ClientManager, IdentityAttributeResult } from "@ic-reactor/core"
import { createAuthHooks } from "../src/createAuthHooks"

// ============================================================================
// Helpers
// ============================================================================

const wrapper =
  (queryClient: QueryClient) =>
  ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

function makeClientManager(queryClient: QueryClient) {
  return new ClientManager({ queryClient })
}

// ============================================================================
// createAuthHooks - useAgentState
// ============================================================================

describe("createAuthHooks - useAgentState", () => {
  let queryClient: QueryClient
  let clientManager: ClientManager

  beforeEach(() => {
    queryClient = new QueryClient()
    clientManager = makeClientManager(queryClient)
  })

  it("returns the initial agent state", () => {
    const { useAgentState } = createAuthHooks(clientManager)
    const { result } = renderHook(() => useAgentState(), {
      wrapper: wrapper(queryClient),
    })

    expect(result.current).toBeDefined()
    // Agent is not fully initialised in tests but the object should be present
    expect(typeof result.current).toBe("object")
  })

  it("reflects agent state changes via subscribeAgentState", async () => {
    const { useAgentState } = createAuthHooks(clientManager)

    // Spy on the subscription to simulate a state change
    const listeners: Array<(state: any) => void> = []
    vi.spyOn(clientManager, "subscribeAgentState").mockImplementation((cb) => {
      listeners.push(cb)
      return () => {
        const idx = listeners.indexOf(cb)
        if (idx !== -1) listeners.splice(idx, 1)
      }
    })

    const { result } = renderHook(() => useAgentState(), {
      wrapper: wrapper(queryClient),
    })

    // Trigger a fake state-change notification
    act(() => {
      listeners.forEach((listener) => listener(clientManager.agentState))
    })

    // The hook should still return a defined state object
    expect(result.current).toBeDefined()
  })
})

// ============================================================================
// createAuthHooks - useUserPrincipal
// ============================================================================

describe("createAuthHooks - useUserPrincipal", () => {
  let queryClient: QueryClient
  let clientManager: ClientManager

  beforeEach(() => {
    queryClient = new QueryClient()
    clientManager = makeClientManager(queryClient)
  })

  it("returns null when not authenticated", () => {
    const { useUserPrincipal } = createAuthHooks(clientManager)
    const { result } = renderHook(() => useUserPrincipal(), {
      wrapper: wrapper(queryClient),
    })

    expect(result.current).toBeNull()
  })

  it("returns a principal when identity is set", () => {
    // Mock the auth state to have an identity
    const mockPrincipal = { toText: () => "2vxsx-fae", _isPrincipal: true }
    const mockIdentity = {
      getPrincipal: () => mockPrincipal,
    }

    vi.spyOn(clientManager, "authState", "get").mockReturnValue({
      isAuthenticated: true,
      isAuthenticating: false,
      identity: mockIdentity as any,
      error: undefined,
    })

    const { useUserPrincipal } = createAuthHooks(clientManager)
    const { result } = renderHook(() => useUserPrincipal(), {
      wrapper: wrapper(queryClient),
    })

    expect(result.current).not.toBeNull()
    expect(result.current?.toText()).toBe("2vxsx-fae")
  })
})

// ============================================================================
// createAuthHooks - useAuth
// ============================================================================

describe("createAuthHooks - useAuth", () => {
  let queryClient: QueryClient
  let clientManager: ClientManager

  beforeEach(() => {
    queryClient = new QueryClient()
    clientManager = makeClientManager(queryClient)
    // Prevent real network calls
    vi.spyOn(clientManager, "initialize").mockResolvedValue(clientManager)
  })

  it("returns the expected shape", async () => {
    const { useAuth } = createAuthHooks(clientManager)
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(queryClient),
    })

    await waitFor(() => {
      expect(result.current).toBeDefined()
    })

    expect(typeof result.current.login).toBe("function")
    expect(typeof result.current.logout).toBe("function")
    expect(typeof result.current.authenticate).toBe("function")
    expect(typeof result.current.isAuthenticated).toBe("boolean")
    expect(typeof result.current.isAuthenticating).toBe("boolean")
  })

  it("auto-initializes session on mount", async () => {
    const { useAuth } = createAuthHooks(clientManager)

    renderHook(() => useAuth(), { wrapper: wrapper(queryClient) })

    await waitFor(() => {
      expect(clientManager.initialize).toHaveBeenCalledTimes(1)
    })
  })

  it("does not call initialize more than once across re-renders", async () => {
    const { useAuth } = createAuthHooks(clientManager)
    const { rerender } = renderHook(() => useAuth(), {
      wrapper: wrapper(queryClient),
    })

    rerender()
    rerender()

    await waitFor(() => {
      expect(clientManager.initialize).toHaveBeenCalledTimes(1)
    })
  })

  it("reflects unauthenticated state by default", async () => {
    const { useAuth } = createAuthHooks(clientManager)
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(queryClient),
    })

    await waitFor(() => expect(result.current).toBeDefined())

    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.principal).toBeNull()
    expect(result.current.identity).toBeNull()
  })

  it("exposes login and logout from clientManager", async () => {
    const { useAuth } = createAuthHooks(clientManager)
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(queryClient),
    })

    await waitFor(() => expect(result.current).toBeDefined())

    // login / logout should be the same references as on clientManager
    expect(result.current.login).toBe(clientManager.login)
    expect(result.current.logout).toBe(clientManager.logout)
  })

  it("returns principal derived from authenticated identity", async () => {
    const mockPrincipal = { toText: () => "aaaaa-aa", _isPrincipal: true }
    const mockIdentity = { getPrincipal: () => mockPrincipal }

    vi.spyOn(clientManager, "authState", "get").mockReturnValue({
      isAuthenticated: true,
      isAuthenticating: false,
      identity: mockIdentity as any,
      error: undefined,
    })

    const { useAuth } = createAuthHooks(clientManager)
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(queryClient),
    })

    await waitFor(() => expect(result.current).toBeDefined())

    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.principal?.toText()).toBe("aaaaa-aa")
    expect(result.current.identity).toBe(mockIdentity)
  })

  it("exposes error from auth state", async () => {
    const authError = new Error("Auth failed")

    vi.spyOn(clientManager, "authState", "get").mockReturnValue({
      isAuthenticated: false,
      isAuthenticating: false,
      identity: null,
      error: authError,
    })

    const { useAuth } = createAuthHooks(clientManager)
    const { result } = renderHook(() => useAuth(), {
      wrapper: wrapper(queryClient),
    })

    await waitFor(() => expect(result.current).toBeDefined())

    expect(result.current.error).toBe(authError)
  })
})

// ============================================================================
// createAuthHooks - useIdentityAttributes
// ============================================================================

describe("createAuthHooks - useIdentityAttributes", () => {
  let queryClient: QueryClient
  let clientManager: ClientManager

  beforeEach(() => {
    queryClient = new QueryClient()
    clientManager = makeClientManager(queryClient)
    vi.spyOn(clientManager, "initialize").mockResolvedValue(clientManager)
  })

  it("tracks loading and success state", async () => {
    const attributes = {
      principal: "aaaaa-aa",
      requestedKeys: ["openid:https://issuer.example.com:email"],
      signedAttributes: {
        data: new Uint8Array([1]),
        signature: new Uint8Array([2]),
      },
      decodedAttributes: { email: "alice@example.com" },
      completedAt: new Date().toISOString(),
    }
    ;(clientManager as any).requestOpenIdIdentityAttributes = vi
      .fn()
      .mockResolvedValue(attributes)

    const { useIdentityAttributes } = createAuthHooks(clientManager)
    const { result } = renderHook(() => useIdentityAttributes(), {
      wrapper: wrapper(queryClient),
    })

    let promise!: Promise<IdentityAttributeResult>
    act(() => {
      promise = result.current.requestOpenIdAttributes({
        openIdProvider: "https://issuer.example.com",
        keys: ["email"],
        nonce: new Uint8Array([1, 2, 3]),
      })
    })

    expect(result.current.isRequestingAttributes).toBe(true)
    await act(async () => {
      await promise
    })

    expect(result.current.isRequestingAttributes).toBe(false)
    expect(result.current.attributes).toBe(attributes)
    expect(result.current.attributeError).toBeNull()
  })

  it("requests attributes for arbitrary OpenID providers", async () => {
    const attributes = {
      principal: "aaaaa-aa",
      requestedKeys: ["openid:https://issuer.example.com:email"],
      signedAttributes: {
        data: new Uint8Array([1]),
        signature: new Uint8Array([2]),
      },
      decodedAttributes: { email: "alice@example.com" },
      completedAt: new Date().toISOString(),
    }
    ;(clientManager as any).requestOpenIdIdentityAttributes = vi
      .fn()
      .mockResolvedValue(attributes)

    const { useIdentityAttributes } = createAuthHooks(clientManager)
    const { result } = renderHook(() => useIdentityAttributes(), {
      wrapper: wrapper(queryClient),
    })

    await act(async () => {
      await result.current.requestOpenIdAttributes({
        openIdProvider: "https://issuer.example.com",
        keys: ["email"],
        nonce: new Uint8Array([1]),
      })
    })

    expect(
      (clientManager as any).requestOpenIdIdentityAttributes
    ).toHaveBeenCalledWith({
      openIdProvider: "https://issuer.example.com",
      keys: ["email"],
      nonce: new Uint8Array([1]),
    })
    expect(result.current.attributes).toBe(attributes)
  })

  it("tracks error state", async () => {
    const error = new Error("attribute request failed")
    ;(clientManager as any).requestIdentityAttributes = vi
      .fn()
      .mockRejectedValue(error)

    const { useIdentityAttributes } = createAuthHooks(clientManager)
    const { result } = renderHook(() => useIdentityAttributes(), {
      wrapper: wrapper(queryClient),
    })

    await act(async () => {
      await expect(
        result.current.requestAttributes({
          keys: ["openid:https://issuer.example.com:email"],
          nonce: new Uint8Array([1]),
        })
      ).rejects.toBe(error)
    })

    expect(result.current.isRequestingAttributes).toBe(false)
    expect(result.current.attributeError).toBe(error)
  })

  it("clears attributes and errors", async () => {
    const attributes = {
      principal: "aaaaa-aa",
      requestedKeys: ["openid:https://issuer.example.com:email"],
      signedAttributes: {
        data: new Uint8Array([1]),
        signature: new Uint8Array([2]),
      },
      decodedAttributes: { email: "alice@example.com" },
      completedAt: new Date().toISOString(),
    }
    ;(clientManager as any).requestOpenIdIdentityAttributes = vi
      .fn()
      .mockResolvedValue(attributes)

    const { useIdentityAttributes } = createAuthHooks(clientManager)
    const { result } = renderHook(() => useIdentityAttributes(), {
      wrapper: wrapper(queryClient),
    })

    await act(async () => {
      await result.current.requestOpenIdAttributes({
        openIdProvider: "https://issuer.example.com",
        keys: ["email"],
        nonce: new Uint8Array([1]),
      })
    })

    act(() => {
      result.current.clearAttributes()
    })

    expect(result.current.attributes).toBeNull()
    expect(result.current.attributeError).toBeNull()
  })
})
