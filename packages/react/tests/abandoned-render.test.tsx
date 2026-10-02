/**
 * A client built for a render that React throws away is disposed anyway.
 *
 * React gives a discarded render no cleanup. A Suspense boundary above the
 * provider that suspends during the provider's first render, or StrictMode's
 * second call of the `useState` initializer, leaves a client that never
 * reaches the effect that would dispose it, and a child's `useAuth()` has
 * already built that client's auth and subscribed to it. The provider
 * registers each client it owns with a `FinalizationRegistry` until it
 * commits it, so the registry disposes the ones React dropped.
 *
 * Garbage collection decides when a real registry runs its cleanup, so most
 * tests here install a fake whose collections the test triggers
 * (`fakeFinalizationRegistry`), and one runs a real collection where the
 * runtime exposes `gc()`.
 */
import { createTestAuth, type TestAuth } from "@ic-reactor/core/testing"
import type { Client } from "@ic-reactor/core"
import { act, render } from "@testing-library/react"
import { StrictMode, Suspense, useEffect, type ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  bindingsWith,
  clientWithAuth,
  fakeFinalizationRegistry,
  macrotask,
  trackedFactory,
  withDisposeSpy,
} from "./helpers.js"

/** The runtime's own registry, captured before any test stubs it. */
const RealRegistry = (globalThis as { FinalizationRegistry?: unknown })
  .FinalizationRegistry

/** Node's `gc()`, present when the worker runs with `--expose-gc`. */
const collectGarbage = (globalThis as { gc?: () => void }).gc

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

/**
 * A factory that builds each client over an auth of its own, and the clients
 * that a committed tree used.
 */
function setup(bindings: Awaited<ReturnType<typeof bindingsWith>>) {
  const { useAuth, useClient } = bindings
  const auths: TestAuth[] = []
  const tracked = trackedFactory(() => {
    const auth = createTestAuth({ seed: 5, signedIn: false })
    auths.push(auth)
    return clientWithAuth(() => auth)
  })
  /** The auth of a client the factory built. */
  const authOf = (client: Client): TestAuth =>
    auths[tracked.made.indexOf(tracked.trackOf(client))] as TestAuth
  /** The clients a committed `Probe` read: an effect runs only on commit. */
  const committed = new Set<Client>()

  function Probe() {
    const client = useClient()
    const { status } = useAuth()
    useEffect(() => {
      committed.add(client)
    }, [client])
    return <p data-testid="status">{status}</p>
  }
  return { ...tracked, authOf, committed, Probe }
}

/**
 * A child that suspends until {@link open} is called, as a lazy route or a
 * pending `use(promise)` does. Rendered below the provider and inside a
 * boundary above it, it throws the provider's first render away.
 */
function suspendUntilOpened() {
  let opened = false
  let resolve: () => void = () => {}
  const gate = new Promise<void>((done) => {
    resolve = done
  })
  function Gate(): ReactNode {
    if (!opened) throw gate
    return null
  }
  const open = async (): Promise<void> => {
    opened = true
    await act(async () => {
      resolve()
      await gate
    })
    await act(macrotask)
  }
  return { Gate, open }
}

describe("a client the provider owns, and the registry that backs its disposal", () => {
  it("is registered while it renders and unregistered once committed, so a collection never disposes it", async () => {
    const registry = fakeFinalizationRegistry()
    const bindings = await bindingsWith(registry.Registry)
    const { ReactorProvider, useClient } = bindings
    const { factory, made, trackOf, authOf, committed, Probe } = setup(bindings)
    const standingWhileRendering: boolean[] = []
    function Witness() {
      const client = useClient()
      standingWhileRendering.push(
        registry.live.some((entry) => entry.held === client)
      )
      return null
    }

    const view = render(
      <ReactorProvider client={factory}>
        <Witness />
        <Probe />
      </ReactorProvider>
    )
    await act(macrotask)

    expect(made).toHaveLength(1)
    const [client] = [...committed] as [Client]
    expect(client).toBe(made[0]?.client)
    // Registered before the commit: a render React dropped there would leave
    // a registration behind.
    expect(standingWhileRendering[0]).toBe(true)
    // Unregistered by the commit: the provider's unmount owns it now.
    expect(registry.registered).toEqual([client])
    expect(registry.unregistered).toContain(client)
    expect(registry.live).toEqual([])

    registry.collectAll()
    expect(trackOf(client).dispose).not.toHaveBeenCalled()
    await act(() => authOf(client).signIn())
    expect(view.getByTestId("status").textContent).toBe("signed-in")

    view.unmount()
    await act(macrotask)
    expect(trackOf(client).dispose).toHaveBeenCalledTimes(1)
  })

  it("disposes, with its auth, each client of a first render that a Suspense boundary above the provider threw away", async () => {
    const registry = fakeFinalizationRegistry()
    const bindings = await bindingsWith(registry.Registry)
    const { ReactorProvider } = bindings
    const { factory, made, trackOf, authOf, committed, Probe } = setup(bindings)
    const { Gate, open } = suspendUntilOpened()

    const view = render(
      <Suspense fallback={<p>loading</p>}>
        <ReactorProvider client={factory}>
          <Probe />
          <Gate />
        </ReactorProvider>
      </Suspense>
    )
    await act(macrotask)
    expect(view.container.textContent).toBe("loading")
    expect(committed.size).toBe(0)
    await open()

    expect(committed.size).toBe(1)
    const [used] = [...committed] as [Client]
    const dropped = made.filter((entry) => entry.client !== used)
    expect(dropped.length).toBeGreaterThan(0)
    for (const entry of dropped) {
      // The leak: the thrown-away render built the client's auth and
      // subscribed to it, and no effect of it ever runs.
      expect(authOf(entry.client).listenerCount).toBe(1)
      expect(entry.dispose).not.toHaveBeenCalled()
    }
    expect(registry.live.map((entry) => entry.held)).toEqual(
      dropped.map((entry) => entry.client)
    )

    registry.collectAll()
    registry.collectAll()

    for (const entry of dropped) {
      expect(entry.dispose).toHaveBeenCalledTimes(1)
      expect(authOf(entry.client).disposed).toBe(true)
      expect(authOf(entry.client).listenerCount).toBe(0)
    }
    // The client the tree runs on is untouched, and still hears its auth.
    expect(trackOf(used).dispose).not.toHaveBeenCalled()
    expect(authOf(used).disposed).toBe(false)
    await act(() => authOf(used).signIn())
    expect(view.getByTestId("status").textContent).toBe("signed-in")
  })

  it("disposes the client of the initializer call that StrictMode drops, and only that one", async () => {
    const registry = fakeFinalizationRegistry()
    const bindings = await bindingsWith(registry.Registry)
    const { ReactorProvider } = bindings
    const { factory, made, trackOf, committed, Probe } = setup(bindings)

    const view = render(
      <StrictMode>
        <ReactorProvider client={factory}>
          <Probe />
        </ReactorProvider>
      </StrictMode>
    )
    await act(macrotask)

    expect(committed.size).toBe(1)
    const [used] = [...committed] as [Client]
    const dropped = made.filter((entry) => entry.client !== used)
    // StrictMode builds two clients in development and keeps one.
    expect(dropped).toHaveLength(1)
    expect(registry.live.map((entry) => entry.held)).toEqual([
      dropped[0]?.client,
    ])

    registry.collectAll()
    expect(dropped[0]?.dispose).toHaveBeenCalledTimes(1)
    expect(trackOf(used).dispose).not.toHaveBeenCalled()

    view.unmount()
    await act(macrotask)
    expect(trackOf(used).dispose).toHaveBeenCalledTimes(1)
  })
})

describe("a client the app created before the provider's factory ran", () => {
  it("is never registered, even when renders are thrown away", async () => {
    const registry = fakeFinalizationRegistry()
    const { ReactorProvider, useAuth } = await bindingsWith(registry.Registry)
    const auth = createTestAuth({ seed: 6, signedIn: false })
    const { client, dispose } = withDisposeSpy(clientWithAuth(() => auth))
    const { Gate, open } = suspendUntilOpened()
    function Status() {
      return <p data-testid="status">{useAuth().status}</p>
    }

    const view = render(
      <StrictMode>
        <Suspense fallback={<p>loading</p>}>
          <ReactorProvider client={() => client}>
            <Status />
            <Gate />
          </ReactorProvider>
        </Suspense>
      </StrictMode>
    )
    await act(macrotask)
    await open()
    registry.collectAll()

    expect(registry.registered).toEqual([])
    expect(dispose).not.toHaveBeenCalled()
    await act(() => client.signIn())
    expect(view.getByTestId("status").textContent).toBe("signed-in")

    view.unmount()
    await act(macrotask)
    registry.collectAll()
    expect(dispose).not.toHaveBeenCalled()
  })
})

describe("a runtime without FinalizationRegistry", () => {
  it("still mounts, follows the auth and disposes a committed client once", async () => {
    const bindings = await bindingsWith(undefined)
    expect(
      (globalThis as { FinalizationRegistry?: unknown }).FinalizationRegistry
    ).toBeUndefined()
    const { ReactorProvider } = bindings
    const { factory, trackOf, authOf, committed, Probe } = setup(bindings)
    const { Gate, open } = suspendUntilOpened()

    const view = render(
      <StrictMode>
        <Suspense fallback={<p>loading</p>}>
          <ReactorProvider client={factory}>
            <Probe />
            <Gate />
          </ReactorProvider>
        </Suspense>
      </StrictMode>
    )
    await act(macrotask)
    await open()

    const [used] = [...committed] as [Client]
    expect(view.getByTestId("status").textContent).toBe("anonymous")
    await act(() => authOf(used).signIn())
    expect(view.getByTestId("status").textContent).toBe("signed-in")

    view.unmount()
    await act(macrotask)
    expect(trackOf(used).dispose).toHaveBeenCalledTimes(1)
  })
})

describe("a real garbage collection", () => {
  it.skipIf(
    typeof collectGarbage !== "function" || typeof RealRegistry !== "function"
  )(
    "disposes the clients of a thrown-away first render once their state is collected",
    async () => {
      const gc = collectGarbage as () => void
      const bindings = await bindingsWith(RealRegistry)
      const { ReactorProvider } = bindings
      const { factory, made, trackOf, authOf, committed, Probe } =
        setup(bindings)
      const { Gate, open } = suspendUntilOpened()

      const view = render(
        <Suspense fallback={<p>loading</p>}>
          <ReactorProvider client={factory}>
            <Probe />
            <Gate />
          </ReactorProvider>
        </Suspense>
      )
      await act(macrotask)
      await open()

      const [used] = [...committed] as [Client]
      const dropped = made.filter((entry) => entry.client !== used)
      expect(dropped.length).toBeGreaterThan(0)
      // A registry runs its cleanups in a task after the collection that
      // found the targets unreachable; a few rounds absorb a collection that
      // ran before React let go of the last of them.
      for (
        let round = 0;
        round < 20 &&
        dropped.some((entry) => entry.dispose.mock.calls.length === 0);
        round++
      ) {
        gc()
        await macrotask()
      }

      for (const entry of dropped) {
        expect(entry.dispose).toHaveBeenCalledTimes(1)
        expect(authOf(entry.client).listenerCount).toBe(0)
      }
      expect(trackOf(used).dispose).not.toHaveBeenCalled()
      expect(authOf(used).listenerCount).toBe(1)
      view.unmount()
      await act(macrotask)
      expect(trackOf(used).dispose).toHaveBeenCalledTimes(1)
    }
  )
})
