/**
 * The provider owns its client's life. React's development double-mount
 * (`StrictMode` mounts, unmounts and mounts again at once) must not kill a
 * client that is in use, and a real unmount must dispose it exactly once.
 */
import type { Client } from "@ic-reactor/core"
import { act, render } from "@testing-library/react"
import * as React from "react"
import { StrictMode, type ComponentType, type ReactNode } from "react"
import { describe, expect, it } from "vitest"
import { ReactorProvider, useAuth, useClient } from "../src/index.js"
import {
  clientWithAuth,
  macrotask,
  type TestAuth,
  testAuth,
  trackedFactory,
} from "./helpers.js"

/** `React.Activity` exists from React 19.2; the peer range starts at 18. */
const Activity = (
  React as unknown as {
    Activity?: ComponentType<{
      mode: "visible" | "hidden"
      children: ReactNode
    }>
  }
).Activity

function setup() {
  // An auth for each client, as `() => new AuthClient()` makes one: a client
  // disposes the auth it built, and a disposed auth tells nobody anything.
  const auths: TestAuth[] = []
  const tracked = trackedFactory(() =>
    clientWithAuth(() => {
      const auth = testAuth({ identity: 3, signedIn: false })
      auths.push(auth)
      return auth
    })
  )
  /** The auth of the client most recently put to use. */
  const currentAuth = () => auths[auths.length - 1] as TestAuth
  const live: { client?: Client } = {}
  function Probe() {
    live.client = useClient()
    const { status } = useAuth()
    return <p data-testid="status">{status}</p>
  }
  return { currentAuth, live, Probe, ...tracked }
}

describe("a provider's client across mounts", () => {
  it("survives React's development double-mount and keeps working", async () => {
    const { currentAuth, Probe, factory, disposals } = setup()

    const view = render(
      <StrictMode>
        <ReactorProvider client={factory}>
          <Probe />
        </ReactorProvider>
      </StrictMode>
    )
    await act(macrotask)

    // Nothing was disposed, and no client was built to replace a disposed
    // one. React's development render builds two and keeps one.
    expect(disposals()).toBe(0)
    expect(factory.mock.calls.length).toBeLessThanOrEqual(2)
    // The client still hears its auth: the subscription survived.
    expect(view.getByTestId("status").textContent).toBe("anonymous")
    await act(async () => {
      await currentAuth().signIn()
    })
    expect(view.getByTestId("status").textContent).toBe("signed-in")
    expect(disposals()).toBe(0)
  })

  it("disposes the client exactly once when the provider unmounts", async () => {
    const { live, Probe, factory, trackOf, disposals } = setup()
    const view = render(
      <StrictMode>
        <ReactorProvider client={factory}>
          <Probe />
        </ReactorProvider>
      </StrictMode>
    )
    await act(macrotask)
    const used = trackOf(live.client as Client)
    expect(disposals()).toBe(0)

    view.unmount()
    await act(macrotask)
    await act(macrotask)

    expect(used.dispose).toHaveBeenCalledTimes(1)
    expect(disposals()).toBe(1)
  })

  it("disposes the client exactly once when it unmounts outside StrictMode too", async () => {
    const { live, Probe, factory, trackOf, made } = setup()
    const view = render(
      <ReactorProvider client={factory}>
        <Probe />
      </ReactorProvider>
    )
    await act(macrotask)
    const used = trackOf(live.client as Client)
    // Without StrictMode, a mounted provider has built exactly one client.
    expect(made).toHaveLength(1)
    expect(used.dispose).not.toHaveBeenCalled()

    view.unmount()
    // The disposal is for the next macrotask, not this one.
    expect(used.dispose).not.toHaveBeenCalled()
    await act(macrotask)

    expect(used.dispose).toHaveBeenCalledTimes(1)
    // The real client was disposed, not only the call counted.
    await expect(used.client.signIn()).rejects.toThrow(/disposed/)
  })

  it("keeps the client and the factory it was given when the parent renders again", async () => {
    const { live, Probe, factory, made } = setup()
    const first = render(
      <ReactorProvider client={factory}>
        <Probe />
      </ReactorProvider>
    )
    const mounted = live.client

    // A new function on every render, as an inline factory is.
    first.rerender(
      <ReactorProvider client={() => factory()}>
        <Probe />
      </ReactorProvider>
    )
    first.rerender(
      <ReactorProvider client={() => factory()}>
        <Probe />
      </ReactorProvider>
    )
    await act(macrotask)

    expect(live.client).toBe(mounted)
    expect(factory).toHaveBeenCalledTimes(1)
    expect(made).toHaveLength(1)
  })

  it.skipIf(Activity === undefined)(
    "replaces a client that was disposed while its subtree was hidden",
    async () => {
      const Hideable = Activity as NonNullable<typeof Activity>
      const { currentAuth, live, Probe, factory, made, trackOf } = setup()
      const tree = (mode: "visible" | "hidden") => (
        <Hideable mode={mode}>
          <ReactorProvider client={factory}>
            <Probe />
          </ReactorProvider>
        </Hideable>
      )
      const view = render(tree("visible"))
      await act(macrotask)
      const hidden = live.client as Client
      hidden.queryClient.setQueryData(["cached"], "before hiding")

      view.rerender(tree("hidden"))
      await act(macrotask)
      expect(trackOf(hidden).dispose).toHaveBeenCalledTimes(1)

      view.rerender(tree("visible"))
      await act(macrotask)

      // The subtree runs on a live client again, not on the disposed one.
      const shown = live.client as Client
      expect(shown).not.toBe(hidden)
      expect(made).toHaveLength(2)
      // Hiding a provider drops its cache, as the provider's docs say.
      expect(shown.queryClient.getQueryData(["cached"])).toBeUndefined()
      expect(trackOf(shown).dispose).not.toHaveBeenCalled()
      await act(async () => {
        await currentAuth().signIn()
      })
      expect(view.getByTestId("status").textContent).toBe("signed-in")
    }
  )

  it.skipIf(Activity === undefined)(
    "builds one replacement, not two, when StrictMode shows a hidden subtree again",
    async () => {
      const Hideable = Activity as NonNullable<typeof Activity>
      const { live, Probe, factory, made, trackOf, disposals } = setup()
      const tree = (mode: "visible" | "hidden") => (
        <StrictMode>
          <Hideable mode={mode}>
            <ReactorProvider client={factory}>
              <Probe />
            </ReactorProvider>
          </Hideable>
        </StrictMode>
      )
      const view = render(tree("visible"))
      await act(macrotask)
      const hidden = live.client as Client
      const builtBefore = made.length

      view.rerender(tree("hidden"))
      await act(macrotask)
      expect(trackOf(hidden).dispose).toHaveBeenCalledTimes(1)
      view.rerender(tree("visible"))
      await act(macrotask)

      // StrictMode runs the effects of a revealed subtree twice before the
      // replacement is committed; the factory still runs once for it, so no
      // client is built only to be dropped.
      expect(made.length - builtBefore).toBe(1)
      const shown = live.client as Client
      expect(shown).not.toBe(hidden)
      expect(shown).toBe(made[made.length - 1]?.client)
      expect(trackOf(shown).dispose).not.toHaveBeenCalled()
      // Only the client that was hidden was ever disposed, and only once.
      expect(disposals()).toBe(1)
    }
  )
})
