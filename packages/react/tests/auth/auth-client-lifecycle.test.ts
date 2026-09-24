/**
 * What becomes of the clients an `AuthenticationManager` builds, against the
 * **real** `@icp-sdk/auth` AuthClient, with the fake Internet Identity and fake
 * replica of `internet-identity-integration.test.ts`.
 *
 * Like that file, this one runs once per supported major (see
 * `vitest.config.ts`). It is a file of its own because v8's `IdleManager` is a
 * singleton for the module's lifetime: every v8 sign-in in a file registers its
 * idle callbacks on the same one, and a test that counts them needs a module
 * no other sign-in has touched.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import * as React from "react"
import {
  StrictMode,
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react"
import { IDBFactory } from "fake-indexeddb"
import { QueryClient } from "@tanstack/react-query"
import * as authClientModule from "@icp-sdk/auth/client"
import { AuthClient } from "@icp-sdk/auth/client"
import { ClientManager } from "@ic-reactor/core"
import {
  AuthenticationManager,
  IdentityAttributesManager,
} from "../../src/auth/index.js"
import type { AuthClientLike } from "../../src/auth/types.js"
import { detectAuthClientFlavor } from "../../src/auth/auth-client-compat.js"
import { createAuthHooks } from "../../src/hooks/createAuthHooks.js"
import {
  installFakeIdentityProvider,
  withUserGesture,
  type FakeIdentityProvider,
} from "./fake-identity-provider.js"
import { installFakeReplica, type FakeReplica } from "./fake-replica.js"

/** Which major this run resolved `@icp-sdk/auth` to. */
const isV10 = detectAuthClientFlavor(AuthClient) === "session"

const LOCAL_HOST = "http://localhost:4943"

let provider: FakeIdentityProvider
let replica: FakeReplica
/** Every manager a test built, so the clients they made can be released. */
const managers: AuthenticationManager[] = []

function createManager(
  params: Partial<ConstructorParameters<typeof AuthenticationManager>[0]> = {}
) {
  const clientManager = new ClientManager({
    queryClient: new QueryClient({
      defaultOptions: { queries: { retry: false } },
    }),
    agentOptions: { host: LOCAL_HOST },
  })
  const authentication = new AuthenticationManager({
    clientManager,
    ...params,
  })
  managers.push(authentication)
  return { clientManager, authentication }
}

/** Signs in, then signs in through Google, then signs in plainly again. */
async function signInThroughTwoOptionSets(
  authentication: AuthenticationManager
) {
  const clients: Array<AuthClientLike | undefined> = []
  await authentication.prepareClient()
  await withUserGesture(() => authentication.login())
  clients.push(authentication.client)
  // "Continue with Google" needs a client whose provider URL carries
  // `openid=`, so the manager builds another one for it.
  const attributes = new IdentityAttributesManager(authentication)
  await withUserGesture(() =>
    attributes.requestOpenId({
      openIdProvider: "google",
      keys: ["email"],
      nonce: new Uint8Array(32),
    })
  )
  clients.push(authentication.client)
  await withUserGesture(() => authentication.login())
  clients.push(authentication.client)
  expect(new Set(clients).size).toBe(3)
  return clients
}

beforeEach(() => {
  localStorage.clear()
  globalThis.indexedDB = new IDBFactory()
  provider = installFakeIdentityProvider()
  replica = installFakeReplica({
    host: LOCAL_HOST,
    canisters: { [provider.canisterId]: provider.canister },
  })
})

afterEach(() => {
  cleanup()
  for (const { client } of managers.splice(0)) {
    ;(client as { dispose?: () => void } | undefined)?.dispose?.()
  }
  provider.restore()
  replica.restore()
  vi.restoreAllMocks()
})

describe("clients a manager replaces for per-call options (real AuthClient)", () => {
  // First in the file, so v8's IdleManager holds only this test's callbacks.
  it.runIf(!isV10)(
    "runs the app's onIdle once per idle period, however many clients it built (v8)",
    async () => {
      const onIdle = vi.fn()
      const { authentication } = createManager({
        idleOptions: { onIdle, idleTimeout: 60_000 },
      })
      await signInThroughTwoOptionSets(authentication)

      // What v8's IdleManager does when its timer fires: every callback the
      // clients registered, in one loop. `create()` hands back the one they
      // registered on.
      const { IdleManager } = authClientModule as unknown as {
        IdleManager: { create(): { exit(): void } }
      }
      IdleManager.create().exit()
      expect(onIdle).toHaveBeenCalledTimes(1)

      // And once on the next idle period. The one that ended tore the
      // IdleManager down, so only a client that has not registered yet, built
      // for another switch of options, registers on the next one.
      const attributes = new IdentityAttributesManager(authentication)
      await withUserGesture(() =>
        attributes.requestOpenId({
          openIdProvider: "google",
          keys: ["email"],
          nonce: new Uint8Array(32),
        })
      )
      IdleManager.create().exit()
      expect(onIdle).toHaveBeenCalledTimes(2)
    }
  )

  it.runIf(isV10)(
    "disposes each client it replaces, and not the one it uses (v10)",
    async () => {
      const dispose = vi.spyOn(AuthClient.prototype, "dispose")
      const { authentication } = createManager()

      const [first, second, third] =
        await signInThroughTwoOptionSets(authentication)

      expect(dispose.mock.contexts).toEqual([first, second])
      expect(authentication.client).toBe(third)
      // The one in use still signs the user in.
      expect(authentication.authState.isAuthenticated).toBe(true)
    }
  )

  it.runIf(isV10)("never disposes a client handed to it (v10)", async () => {
    const dispose = vi.spyOn(AuthClient.prototype, "dispose")
    const authClient = new AuthClient()
    const { authentication } = createManager({ authClient })

    // Options that would make the manager build a client of its own.
    await authentication.prepareClient({ openIdProvider: "google" })

    expect(authentication.client).toBe(authClient)
    expect(dispose).not.toHaveBeenCalled()
    authClient.dispose()
  })
})

/** The events a v10 client listens for on `window` and `document`. */
const CLIENT_EVENTS = new Set([
  "pointerdown",
  "mousedown",
  "mousemove",
  "keydown",
  "touchstart",
  "wheel",
  "visibilitychange",
  "focus",
  "pageshow",
  "storage",
])

const isCapture = (options: unknown) =>
  typeof options === "boolean"
    ? options
    : Boolean((options as EventListenerOptions | undefined)?.capture)

/**
 * Counts the listeners for {@link CLIENT_EVENTS} added to `window` and
 * `document` from now on and not removed since.
 */
function trackClientListeners() {
  const spies = [window, document].map((target: EventTarget) => ({
    add: vi.spyOn(target, "addEventListener"),
    remove: vi.spyOn(target, "removeEventListener"),
  }))
  return () => {
    let live = 0
    for (const { add, remove } of spies) {
      const removed = [...remove.mock.calls]
      for (const [type, listener, options] of add.mock.calls) {
        if (!CLIENT_EVENTS.has(type)) continue
        const index = removed.findIndex(
          ([removedType, removedListener, removedOptions]) =>
            removedType === type &&
            removedListener === listener &&
            isCapture(removedOptions) === isCapture(options)
        )
        if (index === -1) live++
        else removed.splice(index, 1)
      }
    }
    return live
  }
}

/** React's `<Activity>`, from React 19.2 on. */
const Activity = (
  React as unknown as {
    Activity?: ComponentType<{
      mode: "visible" | "hidden"
      children?: ReactNode
    }>
  }
).Activity

/** Leaves a session in the storage every tab shares, as a tab signed in. */
async function signInInAnotherTab() {
  const tab = createManager()
  await tab.authentication.prepareClient()
  await withUserGesture(() => tab.authentication.login())
  return provider.rootIdentity.getPrincipal().toText()
}

/** Whether a tab opened now finds a session to restore. */
async function newTabIsSignedIn() {
  const tab = createManager()
  await tab.authentication.authenticate()
  return tab.authentication.authState.isAuthenticated
}

describe("dispose() (real AuthClient)", () => {
  it.runIf(isV10)(
    "disposes the client it built, which stops listening to the page (v10)",
    async () => {
      const liveListeners = trackClientListeners()
      const dispose = vi.spyOn(AuthClient.prototype, "dispose")
      const { authentication } = createManager()
      await authentication.prepareClient()
      await withUserGesture(() => authentication.login())
      const client = authentication.client
      expect(liveListeners()).toBeGreaterThan(0)

      authentication.dispose()

      expect(dispose.mock.contexts).toEqual([client])
      expect(authentication.client).toBeUndefined()
      expect(liveListeners()).toBe(0)
      // Disposing is not signing out: the session is still there.
      expect(await newTabIsSignedIn()).toBe(true)
    }
  )

  it.runIf(isV10)("never disposes a client handed to it (v10)", async () => {
    const dispose = vi.spyOn(AuthClient.prototype, "dispose")
    const authClient = new AuthClient()
    const { authentication } = createManager({ authClient })

    authentication.dispose()

    expect(dispose).not.toHaveBeenCalled()
    expect(authentication.client).toBe(authClient)
    authClient.dispose()
  })

  it("builds a new client for a sign-in after it", async () => {
    const { authentication, clientManager } = createManager()
    await authentication.prepareClient()
    const disposed = authentication.client

    authentication.dispose()
    // No await before the sign-in: the module is loaded, so the new client is
    // built inside the click, as the popup needs.
    await withUserGesture(() => authentication.login())

    expect(authentication.client).toBeDefined()
    expect(authentication.client).not.toBe(disposed)
    expect(authentication.authState.isAuthenticated).toBe(true)
    expect((await clientManager.getUserPrincipal()).toText()).toBe(
      provider.rootIdentity.getPrincipal().toText()
    )
  })

  it("builds a new client for prepareClient() and for a sign-out after it", async () => {
    const { authentication, clientManager } = createManager()
    await authentication.prepareClient()
    await withUserGesture(() => authentication.login())

    authentication.dispose()
    await authentication.logout()

    expect(authentication.client).toBeDefined()
    expect(authentication.authState.isAuthenticated).toBe(false)
    expect((await clientManager.getUserPrincipal()).isAnonymous()).toBe(true)
    expect(await newTabIsSignedIn()).toBe(false)

    authentication.dispose()
    const prepared = await authentication.prepareClient()
    expect(prepared).toBeDefined()
    expect(authentication.client).toBe(prepared)
  })
})

describe("a provider that builds its managers per mount (real AuthClient)", () => {
  // As examples/nextjs/src/service/provider.tsx does, which is how a
  // server-rendered app keeps one request's session away from the next.
  function createReactorContext() {
    const { clientManager, authentication } = createManager()
    return {
      clientManager,
      authentication,
      auth: createAuthHooks(authentication),
    }
  }
  type ReactorContextValue = ReturnType<typeof createReactorContext>
  const ReactorContext = createContext<ReactorContextValue | null>(null)

  function ICReactorProvider({ children }: { children?: ReactNode }) {
    const [value] = useState(createReactorContext)
    useEffect(() => () => value.authentication.dispose(), [value])
    return createElement(ReactorContext.Provider, { value }, children)
  }

  /** The managers the mounted tree uses. */
  let mounted: ReactorContextValue | undefined

  function Header() {
    const value = useContext(ReactorContext)!
    mounted = value
    value.auth.useAuth()
    return null
  }

  /** Mounts the provider and waits for `useAuth()` to restore the session. */
  async function mount(strict = false) {
    const tree = createElement(ICReactorProvider, null, createElement(Header))
    const view = render(strict ? createElement(StrictMode, null, tree) : tree)
    // Not the last manager built: StrictMode runs the state initializer twice
    // and keeps one result.
    const { authentication } = mounted!
    await vi.waitFor(() =>
      expect(authentication.authState.identity).not.toBeNull()
    )
    return { ...view, authentication }
  }

  it.runIf(isV10)(
    "leaves no client listening to the page after 50 remounts (v10)",
    async () => {
      const liveListeners = trackClientListeners()

      for (let remount = 0; remount < 50; remount++) {
        const { unmount, authentication } = await mount()
        expect(authentication.client).toBeDefined()
        unmount()
      }

      expect(liveListeners()).toBe(0)
    }
  )

  it.runIf(isV10)(
    "leaves no client listening to the page after remounts that do not wait for the restore (v10)",
    async () => {
      const liveListeners = trackClientListeners()

      // A widget opened and closed again before its session was read: the
      // restore its useAuth() started built the client after dispose().
      for (let remount = 0; remount < 10; remount++) {
        render(
          createElement(ICReactorProvider, null, createElement(Header))
        ).unmount()
      }
      await new Promise((resolve) => setTimeout(resolve, 200))

      expect(liveListeners()).toBe(0)
      expect(managers.every(({ client }) => client === undefined)).toBe(true)
    }
  )

  it("restores a stored session under StrictMode", async () => {
    // StrictMode disposes the managers in the provider's cleanup while the
    // restore its useAuth() started is still running, and mounts again.
    await signInInAnotherTab()

    const { authentication } = await mount(true)

    await vi.waitFor(() =>
      expect(authentication.authState.isAuthenticated).toBe(true)
    )
    expect(authentication.client).toBeDefined()
  })

  it.runIf(Activity !== undefined)(
    "restores again when <Activity> shows the tree it hid during the restore",
    async () => {
      // Hiding runs the provider's cleanup, and so dispose(), and keeps the
      // managers for when the tree is shown again.
      await signInInAnotherTab()
      const App = ({ mode }: { mode: "visible" | "hidden" }) =>
        createElement(
          Activity!,
          { mode },
          createElement(ICReactorProvider, null, createElement(Header))
        )
      const view = render(createElement(App, { mode: "visible" }))
      const { authentication } = mounted!

      view.rerender(createElement(App, { mode: "hidden" }))
      await new Promise((resolve) => setTimeout(resolve, 200))
      // Nothing is mounted, so the restore stopped and built nothing.
      expect(authentication.client).toBeUndefined()

      view.rerender(createElement(App, { mode: "visible" }))
      await vi.waitFor(() =>
        expect(authentication.authState.isAuthenticated).toBe(true)
      )
      expect(authentication.client).toBeDefined()
    }
  )

  it.runIf(Activity !== undefined)(
    "restores again when <Activity> hid the tree while the session was read",
    async () => {
      await signInInAnotherTab()
      const App = ({ mode }: { mode: "visible" | "hidden" }) =>
        createElement(
          Activity!,
          { mode },
          createElement(ICReactorProvider, null, createElement(Header))
        )
      const view = render(createElement(App, { mode: "visible" }))
      const { authentication } = mounted!
      // Hidden once the restore has started reading the client.
      const { authenticate } = authentication
      vi.spyOn(authentication, "authenticate").mockImplementationOnce(() => {
        const reading = authenticate()
        view.rerender(createElement(App, { mode: "hidden" }))
        return reading
      })

      await vi.waitFor(() =>
        expect(authentication.releaseCount).toBeGreaterThan(0)
      )
      await new Promise((resolve) => setTimeout(resolve, 200))
      expect(authentication.client).toBeUndefined()

      view.rerender(createElement(App, { mode: "visible" }))
      await vi.waitFor(() =>
        expect(authentication.authState.isAuthenticated).toBe(true)
      )
    }
  )

  it("restores a manager mounted again after the restore it discarded", async () => {
    // The cleanup disposed the manager, and the same one is mounted again.
    await signInInAnotherTab()
    const { authentication } = createManager()
    const { useAuth } = createAuthHooks(authentication)
    let isAuthenticated: boolean | undefined
    function Consumer() {
      ;({ isAuthenticated } = useAuth())
      return null
    }

    render(createElement(Consumer)).unmount()
    authentication.dispose()
    await new Promise((resolve) => setTimeout(resolve, 200))
    // Nothing is mounted, so the restore stopped and built nothing.
    expect(authentication.client).toBeUndefined()

    render(createElement(Consumer))
    await vi.waitFor(() => expect(isAuthenticated).toBe(true))
    expect(authentication.client).toBeDefined()
  })

  it("still signs in and out under StrictMode", async () => {
    // StrictMode runs the provider's cleanup, and so dispose(), and then its
    // effect again, on the same managers.
    const { unmount, authentication } = await mount(true)

    await withUserGesture(() => authentication.login())
    expect(authentication.authState.isAuthenticated).toBe(true)
    await authentication.logout()
    expect(authentication.authState.isAuthenticated).toBe(false)

    unmount()
    expect(authentication.client).toBeUndefined()
  })
})

describe("following a v10 client's session record (real AuthClient)", () => {
  // The manager subscribes to the client it uses, so that a sign-out or a
  // sign-in in another tab reaches it (#754). A subscription holds the manager,
  // so it has to end with the manager's use of that client.

  /** The clients the manager is subscribed to right now. */
  function trackSubscriptions() {
    const subscribed = new Set<AuthClient>()
    const subscribe = AuthClient.prototype.subscribe
    vi.spyOn(AuthClient.prototype, "subscribe").mockImplementation(function (
      this: AuthClient,
      listener: () => void
    ) {
      const unsubscribe = subscribe.call(this, listener)
      subscribed.add(this)
      return () => {
        subscribed.delete(this)
        unsubscribe()
      }
    })
    return subscribed
  }

  it.runIf(isV10)(
    "stops following each client it replaces or releases (v10)",
    async () => {
      const subscribed = trackSubscriptions()
      const { authentication } = createManager()

      await authentication.prepareClient()
      expect([...subscribed]).toEqual([authentication.client])
      await authentication.prepareClient({ openIdProvider: "google" })
      expect([...subscribed]).toEqual([authentication.client])

      authentication.dispose()
      expect(subscribed.size).toBe(0)
    }
  )

  it.runIf(isV10)(
    "follows a client handed to it again once it is used after dispose() (v10)",
    async () => {
      const subscribed = trackSubscriptions()
      const authClient = new AuthClient()
      const { authentication } = createManager({ authClient })
      expect([...subscribed]).toEqual([authClient])

      authentication.dispose()
      expect(subscribed.size).toBe(0)

      await authentication.prepareClient()
      expect([...subscribed]).toEqual([authClient])
      authClient.dispose()
    }
  )
})

describe("a client that changes under a check in flight (real AuthClient)", () => {
  // A restore reads the client twice, for the identity and for whether it
  // vouches for it, with an await between. Per-call options can replace the
  // client in between, and `dispose()` can release it. The two answers then
  // came from different clients, or the second from none.

  it("restores the account from the client it moved to", async () => {
    const account = await signInInAnotherTab()
    const { authentication, clientManager } = createManager()
    await authentication.prepareClient()

    const restoring = authentication.authenticate()
    // A one-click button prepared while the stored session is still read.
    authentication.getPreparedClient({ openIdProvider: "google" })
    await restoring

    const { identity, isAuthenticated, error } = authentication.authState
    expect(error).toBeUndefined()
    expect(isAuthenticated).toBe(true)
    expect(identity?.getPrincipal().toText()).toBe(account)
    expect((await clientManager.getUserPrincipal()).toText()).toBe(account)
  })

  it("ends a restore quietly when the client is released under it", async () => {
    await signInInAnotherTab()
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const { authentication } = createManager()
    await authentication.prepareClient()

    const restoring = authentication.authenticate()
    authentication.dispose()
    await expect(restoring).resolves.toBeUndefined()

    const { isAuthenticated, isAuthenticating, error } =
      authentication.authState
    expect(error).toBeUndefined()
    expect(isAuthenticating).toBe(false)
    expect(isAuthenticated).toBe(false)
    expect(consoleError).not.toHaveBeenCalled()
    // Nothing built another client for the manager that let go of its own.
    expect(authentication.client).toBeUndefined()
  })

  it("signs out when the client is released during the sign-out", async () => {
    const { authentication, clientManager } = createManager()
    await authentication.prepareClient()
    await withUserGesture(() => authentication.login())

    const signingOut = authentication.logout()
    authentication.dispose()
    await expect(signingOut).resolves.toBeUndefined()

    expect(authentication.authState.error).toBeUndefined()
    expect(authentication.authState.isAuthenticated).toBe(false)
    expect((await clientManager.getUserPrincipal()).isAnonymous()).toBe(true)
    expect(await newTabIsSignedIn()).toBe(false)
  })

  it("fails a sign-in the client is released under with the client's own error", async () => {
    const { authentication } = createManager()
    await authentication.prepareClient()

    const signingIn = withUserGesture(() => authentication.login())
    // The user closes the widget that built the manager with the popup open.
    authentication.dispose()
    const failure = await signingIn.then(
      () => undefined,
      (error: Error) => error
    )

    // v8 has nothing to cancel, and its sign-in finishes.
    if (isV10) expect(failure?.name).toBe("SupersededError")
    expect(failure).not.toBeInstanceOf(TypeError)
    expect(authentication.authState.error).not.toBeInstanceOf(TypeError)
  })
})
