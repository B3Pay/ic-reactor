/**
 * `useAuth` follows the client's state with `useSyncExternalStore`: a
 * component renders once for each change of who calls, and for nothing else.
 */
import { useQueryClient } from "@tanstack/react-query"
import { createTestAuth, type TestAuth } from "@ic-reactor/core/testing"
import type { Client } from "@ic-reactor/core"
import { act, fireEvent, render } from "@testing-library/react"
import { memo, useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ReactorProvider, useAuth, useClient } from "../src/index.js"
import { anonymousClient, clientWithAuth } from "./helpers.js"

afterEach(() => {
  vi.restoreAllMocks()
})

/** The shape `useAuth()` returns, taken from the hook. */
type Auth = ReturnType<typeof useAuth>

/** A page whose parent can render again for reasons that have nothing to do with auth. */
function setup(auth: TestAuth) {
  const renders = { probe: 0, parent: 0 }
  /** What an unmemoized consumer, which renders with its parent, was given. */
  const seen: Auth[] = []

  const Probe = memo(function Probe() {
    renders.probe += 1
    const current = useAuth()
    return <p data-testid="auth">{`${current.status}:${current.principal}`}</p>
  })
  function Plain() {
    seen.push(useAuth())
    return null
  }
  function Parent() {
    renders.parent += 1
    const [count, setCount] = useState(0)
    return (
      <ReactorProvider client={() => clientWithAuth(() => auth)}>
        <button onClick={() => setCount(count + 1)}>{count}</button>
        <Probe />
        <Plain />
      </ReactorProvider>
    )
  }
  const view = render(<Parent />)
  return {
    renders,
    seen,
    view,
    text: () => view.getByTestId("auth").textContent,
    rerenderParent: () => fireEvent.click(view.getByRole("button")),
  }
}

describe("useAuth", () => {
  it("renders again once for each sign-in, switch of account and sign-out", async () => {
    const auth = createTestAuth({ seed: 1, signedIn: false })
    const { renders, text } = setup(auth)
    expect(renders.probe).toBe(1)
    expect(text()).toBe("anonymous:2vxsx-fae")

    await act(async () => {
      await auth.signIn()
    })
    expect(renders.probe).toBe(2)
    expect(text()).toBe(`signed-in:${auth.getPrincipal()?.toText()}`)

    act(() => {
      auth.switchTo(2)
    })
    expect(renders.probe).toBe(3)
    expect(text()).toBe(`signed-in:${auth.getPrincipal()?.toText()}`)

    await act(async () => {
      await auth.signOut()
    })
    expect(renders.probe).toBe(4)
    expect(text()).toBe("anonymous:2vxsx-fae")
  })

  it("follows a session that ends or sits on another origin", () => {
    const auth = createTestAuth({ seed: 1 })
    const { renders, text } = setup(auth)
    expect(text()).toMatch(/^signed-in:/)

    act(() => auth.expire())
    expect(text()).toBe("expired:2vxsx-fae")
    act(() => auth.elsewhere())
    expect(text()).toBe("signed-in-elsewhere:2vxsx-fae")
    expect(renders.probe).toBe(3)
  })

  it("does not render again when the parent does", () => {
    const { renders, rerenderParent } = setup(createTestAuth({ seed: 1 }))
    expect(renders).toEqual({ probe: 1, parent: 1 })

    rerenderParent()
    rerenderParent()
    rerenderParent()

    // The parent rendered three more times and built three new factories.
    expect(renders).toEqual({ probe: 1, parent: 4 })
  })

  it("does not render again for a renewal that changes neither status nor principal", async () => {
    const auth = createTestAuth({ seed: 1 })
    const { renders } = setup(auth)

    await act(async () => {
      await auth.signIn()
    })
    await act(async () => {
      await auth.signIn()
    })

    expect(renders.probe).toBe(1)
  })

  it("returns the same object until the state changes", () => {
    const auth = createTestAuth({ seed: 1 })
    const { seen, rerenderParent } = setup(auth)
    rerenderParent()
    rerenderParent()

    // The consumer rendered with each parent render and got one object.
    expect(seen).toHaveLength(3)
    expect(seen[1]).toBe(seen[0])
    expect(seen[2]).toBe(seen[0])

    act(() => {
      auth.switchTo(2)
    })

    expect(seen).toHaveLength(4)
    expect(seen[3]).not.toBe(seen[0])
    expect(seen[3]?.principal).toBe(auth.getPrincipal()?.toText())
  })

  it("forwards signIn and signOut to the client, with the options it was given", async () => {
    const real = createTestAuth({ seed: 1, signedIn: false })
    const signIn = vi.fn((options?: unknown) => real.signIn(options as never))
    const signOut = vi.fn(() => real.signOut())
    const auth = { ...real, signIn, signOut }
    let current!: Auth
    function Probe() {
      current = useAuth()
      return null
    }
    render(
      <ReactorProvider client={() => clientWithAuth(() => auth)}>
        <Probe />
      </ReactorProvider>
    )

    await act(async () => {
      await current.signIn({ maxTimeToLive: 1n })
    })
    expect(signIn).toHaveBeenCalledWith({ maxTimeToLive: 1n })
    expect(current.status).toBe("signed-in")

    await act(async () => {
      await current.signOut()
    })
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(current.status).toBe("anonymous")
  })

  it("rejects a sign-in on a client that has no auth to sign in with", async () => {
    let current!: Auth
    function Probe() {
      current = useAuth()
      return null
    }
    render(
      <ReactorProvider client={anonymousClient}>
        <Probe />
      </ReactorProvider>
    )

    await expect(current.signIn()).rejects.toThrow(TypeError)
  })
})

describe("useClient", () => {
  it("returns the client of the provider, and TanStack reads the same cache", () => {
    let client: Client | undefined
    let queryClient: unknown
    function Probe() {
      client = useClient()
      queryClient = useQueryClient()
      return null
    }
    const built = anonymousClient()
    render(
      <ReactorProvider client={() => built}>
        <Probe />
      </ReactorProvider>
    )

    expect(client).toBe(built)
    expect(queryClient).toBe(built.queryClient)
  })

  it("throws outside a provider, naming it", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    function Orphan() {
      useClient()
      return null
    }
    function OrphanAuth() {
      useAuth()
      return null
    }

    expect(() => render(<Orphan />)).toThrow(/<ReactorProvider/)
    expect(() => render(<OrphanAuth />)).toThrow(/<ReactorProvider/)
  })
})
