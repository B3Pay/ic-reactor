/**
 * `useAuth` follows the client's state with `useSyncExternalStore`: a
 * component renders once for each change of who calls, and for nothing else.
 */
import { c } from "@meantjs/schema"
import { encodeArgs } from "@meantjs/schema/codec"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createClient, type Client } from "@ic-reactor/core"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { memo, useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ReactorProvider, useAuth, useClient } from "../src/index.js"
import {
  anonymousClient,
  clientWithAuth,
  fakeReplica,
  testAuth,
  type TestAuth,
} from "./helpers.js"

afterEach(() => {
  vi.useRealTimers()
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
    const auth = testAuth({ identity: 1, signedIn: false })
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
    const auth = testAuth({ identity: 1 })
    const { renders, text } = setup(auth)
    expect(text()).toMatch(/^signed-in:/)

    act(() => auth.expire())
    expect(text()).toBe("expired:2vxsx-fae")
    act(() => auth.elsewhere())
    expect(text()).toBe("signed-in-elsewhere:2vxsx-fae")
    expect(renders.probe).toBe(3)
  })

  it("does not render again when the parent does", () => {
    const { renders, rerenderParent } = setup(testAuth({ identity: 1 }))
    expect(renders).toEqual({ probe: 1, parent: 1 })

    rerenderParent()
    rerenderParent()
    rerenderParent()

    // The parent rendered three more times and built three new factories.
    expect(renders).toEqual({ probe: 1, parent: 4 })
  })

  it("does not render again for a renewal that changes neither status nor principal", async () => {
    // One instant for every sign-in, so that each session ends when the first does.
    vi.spyOn(Date, "now").mockReturnValue(Date.now())
    const auth = testAuth({ identity: 1 })
    const { renders } = setup(auth)

    await act(async () => {
      await auth.signIn()
    })
    await act(async () => {
      await auth.signIn()
    })

    expect(renders.probe).toBe(1)
  })

  it("renders again with expired when the session ends, with no user activity", () => {
    vi.useFakeTimers()
    const auth = testAuth({ identity: 1 })
    const status = auth.getStatus()
    if (status.state !== "signed-in") throw new Error("not signed in")
    let current!: Auth
    function Probe() {
      current = useAuth()
      return <p data-testid="auth">{current.status}</p>
    }
    render(
      <ReactorProvider client={() => clientWithAuth(() => auth)}>
        <Probe />
      </ReactorProvider>
    )
    expect(current.status).toBe("signed-in")
    expect(current.expiresAt).toBe(status.expiresAtMs)

    // Nothing notifies: the auth expires by the clock alone, as AuthClient's does.
    act(() => {
      vi.advanceTimersByTime(status.expiresAtMs - Date.now())
    })
    expect(screen.getByTestId("auth").textContent).toBe("expired")
    expect(current.principal).toBe("2vxsx-fae")
    expect(current.expiresAt).toBeUndefined()
  })

  it("returns the same object until the state changes", () => {
    const auth = testAuth({ identity: 1 })
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
    const real = testAuth({ identity: 1, signedIn: false })
    const signIn = vi.fn((options?: unknown) => real.signIn(options as never))
    const signOut = vi.fn((_options?: unknown) => real.signOut())
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
      await current.signOut({ returnTo: "https://app.example/bye" })
    })
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(signOut).toHaveBeenCalledWith({
      returnTo: "https://app.example/bye",
    })
    expect(current.status).toBe("anonymous")
  })

  it("renders a public read when the auth factory throws, and rejects a sign-in with what it threw", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const canisterId = "rdmx6-jaaaa-aaaaa-aaadq-cai"
    const service = c.service({ hello: c.func([], [c.text], "query") })
    const replica = await fakeReplica({
      [canisterId]: {
        query: () => {
          const reply = encodeArgs([c.text], ["hello, anyone"])
          if (!reply.ok) throw new Error("the reply does not encode")
          return reply.bytes
        },
      },
    })
    const cause = new DOMException(
      "The operation is insecure.",
      "SecurityError"
    )
    const factory = vi.fn((): never => {
      throw cause
    })
    let current!: Auth
    function Page() {
      current = useAuth()
      const client = useClient()
      const canister = client.canister<{ hello: () => Promise<string> }>(
        service,
        { id: canisterId }
      )
      const read = useQuery(client.queryOptions(canister, "hello"))
      return (
        <p data-testid="read">{`${current.status}:${read.data ?? "loading"}`}</p>
      )
    }
    const client = createClient({
      network: { host: replica.host, rootKey: replica.rootKey },
      fetch: replica.fetch,
      auth: factory,
    })
    render(
      <ReactorProvider client={() => client}>
        <Page />
      </ReactorProvider>
    )

    await waitFor(
      () =>
        expect(screen.getByTestId("read").textContent).toBe(
          "anonymous:hello, anyone"
        ),
      { timeout: 10_000 }
    )
    expect(factory).toHaveBeenCalledTimes(1)
    await expect(current.signIn()).rejects.toBe(cause)
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
