/**
 * A provider disposes only a client its own factory call created (#780).
 *
 * Apps very often create one client at module scope, one per tab and used
 * outside React too, and hand it over as `client={() => client}`. When the
 * provider disposed that client on unmount, every later provider (a remount,
 * a route that remounts the tree, the next test's render) got the same client
 * back from its factory, already disposed: every call was cancelled and the
 * auth read anonymous, with no error anywhere. Such a client is borrowed, and
 * whoever created it decides when it ends.
 */
import { createTestAuth } from "@ic-reactor/core/testing"
import type { Client } from "@ic-reactor/core"
import { act, render } from "@testing-library/react"
import { StrictMode, useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ReactorProvider, useAuth } from "../src/index.js"
import {
  anonymousClient,
  callThrough,
  clientOn,
  clientWithAuth,
  macrotask,
  replicaWithCanister,
  trackedFactory,
  withDisposeSpy,
} from "./helpers.js"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

function Status({ id = "status" }: { id?: string }) {
  return <p data-testid={id}>{useAuth().status}</p>
}

/**
 * A client created before any provider renders, as one at module scope is,
 * on a fake replica, with a spy on its `dispose`.
 */
function moduleScopeClient() {
  const { replica, callers } = replicaWithCanister()
  const auth = createTestAuth({ seed: 7, signedIn: false })
  const real = clientOn(replica, () => auth)
  const { client, dispose } = withDisposeSpy(real)
  return { real, client, dispose, auth, callers }
}

describe("a client created before the provider's factory ran", () => {
  it("is probed with a call that a disposed client cancels before it is sent", async () => {
    const { real, callers } = moduleScopeClient()
    await callThrough(real)
    expect(callers).toEqual(["2vxsx-fae"])

    real.dispose()

    await expect(callThrough(real)).rejects.toMatchObject({
      kind: "cancelled",
      code: "client_disposed",
    })
    expect(callers).toHaveLength(1)
  })

  it("stays usable through three renders and unmounts in a row, as a test suite's renders are", async () => {
    const { real, client, dispose, auth, callers } = moduleScopeClient()
    client.queryClient.setQueryData(["cached"], "from the first render")
    const seen: string[] = []

    for (let round = 1; round <= 3; round++) {
      const view = render(
        <ReactorProvider client={() => client}>
          <Status />
        </ReactorProvider>
      )
      await act(macrotask)

      // Its subscription works: a sign-in renders the tree again.
      expect(view.getByTestId("status").textContent).toBe("anonymous")
      await act(() => client.signIn())
      expect(view.getByTestId("status").textContent).toBe("signed-in")
      const alice = auth.getPrincipal()!.toText()
      expect(client.authState()).toEqual({
        status: "signed-in",
        principal: alice,
      })
      seen.push(alice)
      // A call still goes out, as the signed-in user.
      await callThrough(real)
      await act(() => client.signOut())

      view.unmount()
      await act(macrotask)
      expect(dispose).not.toHaveBeenCalled()
    }

    expect(callers).toEqual(seen)
    expect(seen).toHaveLength(3)
    // Disposing clears the cache; it is still there.
    expect(client.queryClient.getQueryData(["cached"])).toBe(
      "from the first render"
    )
  })

  it("is never disposed under StrictMode's double mount, nor by the unmount after it", async () => {
    const { real, client, dispose } = moduleScopeClient()

    for (let round = 1; round <= 2; round++) {
      const view = render(
        <StrictMode>
          <ReactorProvider client={() => client}>
            <Status />
          </ReactorProvider>
        </StrictMode>
      )
      await act(macrotask)
      view.unmount()
      await act(macrotask)
    }

    expect(dispose).not.toHaveBeenCalled()
    await expect(callThrough(real)).resolves.toBeUndefined()
  })

  it("keeps working for one provider when another that shares it unmounts", async () => {
    const { real, client, dispose, auth, callers } = moduleScopeClient()
    let hideFirst: () => void = () => {}
    function Page() {
      const [first, setFirst] = useState(true)
      hideFirst = () => setFirst(false)
      return (
        <>
          {first && (
            <ReactorProvider client={() => client}>
              <Status id="first" />
            </ReactorProvider>
          )}
          <ReactorProvider client={() => client}>
            <Status id="second" />
          </ReactorProvider>
        </>
      )
    }
    const view = render(<Page />)
    await act(macrotask)

    act(() => hideFirst())
    await act(macrotask)
    expect(view.queryByTestId("first")).toBeNull()

    expect(dispose).not.toHaveBeenCalled()
    await act(() => client.signIn())
    expect(view.getByTestId("second").textContent).toBe("signed-in")
    await callThrough(real)
    expect(callers).toEqual([auth.getPrincipal()!.toText()])
  })

  it("says once, in development, that the client it was given is already disposed", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const client = anonymousClient()
    client.dispose()

    const view = render(
      <StrictMode>
        <ReactorProvider client={() => client}>
          <Status />
        </ReactorProvider>
      </StrictMode>
    )
    await act(macrotask)
    view.unmount()
    render(
      <ReactorProvider client={() => client}>
        <Status />
      </ReactorProvider>
    )
    await act(macrotask)

    expect(error).toHaveBeenCalledTimes(1)
    expect(String(error.mock.calls[0]![0])).toMatch(
      /got a disposed client.*client_disposed.*client=\{\(\) => createClient\(/
    )
  })

  it("says nothing about a disposed client in production", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const client = anonymousClient()
    client.dispose()

    render(
      <ReactorProvider client={() => client}>
        <Status />
      </ReactorProvider>
    )
    await act(macrotask)

    expect(error).not.toHaveBeenCalled()
  })
})

describe("a client the provider's factory created", () => {
  it("is the provider's when the factory creates it lazily, so the next provider is told it is disposed", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    let shared: Client | undefined
    const tracked = trackedFactory(() =>
      clientWithAuth(() => createTestAuth({ seed: 8 }))
    )
    // A getter that creates the shared client on its first call: the first
    // provider's factory call created it.
    const getClient = () => (shared ??= tracked.factory())

    const first = render(
      <ReactorProvider client={getClient}>
        <Status />
      </ReactorProvider>
    )
    await act(macrotask)
    first.unmount()
    await act(macrotask)
    expect(tracked.disposals()).toBe(1)

    render(
      <ReactorProvider client={getClient}>
        <Status />
      </ReactorProvider>
    )
    await act(macrotask)
    expect(error).toHaveBeenCalledTimes(1)
  })

  it("is decided for a copy without core's stamps by whether a client was created during the call", async () => {
    // A spread copy keeps no symbol key, so it carries no serial.
    const shared = anonymousClient()
    const sharedDispose = vi.fn()
    const borrowed: Client = { ...shared, dispose: sharedDispose }
    const ownedDispose = vi.fn()

    const view = render(
      <>
        <ReactorProvider client={() => borrowed}>
          <Status />
        </ReactorProvider>
        <ReactorProvider
          client={() => ({ ...anonymousClient(), dispose: ownedDispose })}
        >
          <Status />
        </ReactorProvider>
      </>
    )
    await act(macrotask)
    view.unmount()
    await act(macrotask)

    expect(sharedDispose).not.toHaveBeenCalled()
    expect(ownedDispose).toHaveBeenCalledTimes(1)
  })
})
