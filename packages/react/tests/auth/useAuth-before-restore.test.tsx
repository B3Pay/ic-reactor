import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import React, { useEffect, useState, type ReactNode } from "react"
import { hydrateRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { QueryClient } from "@tanstack/react-query"
import { ClientManager } from "@ic-reactor/core"
import { Principal } from "@icp-sdk/core/principal"
import { AuthenticationManager } from "../../src/auth/index.js"
import { createAuthHooks } from "../../src/hooks/createAuthHooks.js"

/**
 * `useAuth()` restores the session from an effect, so on the first render
 * nothing has been read yet. It used to report the state the manager starts
 * in there, `isAuthenticating: false, isAuthenticated: false`, and the guides'
 * `ProtectedRoute` took that for "signed out": its `<Navigate>` redirected to
 * the login page from its own effect, which runs before the effect that starts
 * the restore. Every reload of a protected page sent a signed-in user to
 * `/login` (#621). The hooks now report `isAuthenticating: true` until the
 * restore has settled, on the server too.
 */

const USER = "aaaaa-aa"

// The client `useAuth()` builds itself, through the optional peer's module.
const authModule = vi.hoisted(() => ({ AuthClient: vi.fn() }))
vi.mock("@icp-sdk/auth/client", () => authModule)

const identityOf = (text: string) =>
  ({ getPrincipal: () => Principal.fromText(text) }) as never

/** A client that holds a session, or none. */
function fakeAuthClient(signedIn: boolean) {
  return {
    getIdentity: vi.fn(async () => identityOf(signedIn ? USER : "2vxsx-fae")),
    isAuthenticated: vi.fn(async () => signedIn),
    signIn: vi.fn(),
    signOut: vi.fn(),
    requestAttributes: vi.fn(),
  }
}

type FakeAuthClient = ReturnType<typeof fakeAuthClient>

/**
 * Builds the managers as an app does. `built` has `useAuth()` build the client
 * through the auth module; `provided` hands it to the constructor.
 */
function createApp(
  authClient: FakeAuthClient,
  how: "built" | "provided" = "built"
) {
  authModule.AuthClient.mockImplementation(function () {
    return authClient
  })
  const clientManager = new ClientManager({
    queryClient: new QueryClient(),
    agentOptions: { host: "https://icp-api.io" },
  })
  vi.spyOn(clientManager, "initializeAgent").mockResolvedValue()
  const authentication = new AuthenticationManager({
    clientManager,
    ...(how === "provided" && { authClient: authClient as never }),
  })
  const navigate = vi.fn()
  const { useAuth } = createAuthHooks(authentication)

  /** react-router's `<Navigate>` navigates from an effect. */
  function Navigate({ to }: { to: string }) {
    useEffect(() => {
      navigate(to)
    }, [to])
    return null
  }

  /** The guides' ProtectedRoute. */
  function ProtectedRoute({ children }: { children: ReactNode }) {
    const { isAuthenticated, isAuthenticating } = useAuth()
    if (isAuthenticating) return <p>Loading</p>
    if (!isAuthenticated) return <Navigate to="/login" />
    return <>{children}</>
  }

  /** The guides' login button, recording each label it shows. */
  const labels: string[] = []
  function AuthButton() {
    const { isAuthenticated, isAuthenticating } = useAuth()
    const label = isAuthenticating
      ? "Connecting..."
      : isAuthenticated
        ? "Logout"
        : "Login with Internet Identity"
    if (labels[labels.length - 1] !== label) labels.push(label)
    return <button disabled={isAuthenticating}>{label}</button>
  }

  return {
    clientManager,
    authentication,
    navigate,
    labels,
    ProtectedRoute,
    AuthButton,
  }
}

/** Let the restore, which only waits on promises, run to the end. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })

beforeEach(() => {
  vi.spyOn(console, "debug").mockImplementation(() => {})
  vi.spyOn(console, "info").mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe.each([
  ["a client useAuth() builds", "built"],
  ["a client handed to the manager", "provided"],
] as const)("the guides' ProtectedRoute, with %s", (_, how) => {
  it("does not redirect a signed-in user to the login page", async () => {
    const authClient = fakeAuthClient(true)
    const { navigate, ProtectedRoute } = createApp(authClient, how)

    const { container } = render(
      <ProtectedRoute>
        <p>Dashboard</p>
      </ProtectedRoute>
    )
    expect(container.textContent).toBe("Loading")
    await settle()

    expect(navigate).not.toHaveBeenCalled()
    expect(container.textContent).toBe("Dashboard")
  })

  it("redirects a signed-out user once, after the restore has read the session", async () => {
    const authClient = fakeAuthClient(false)
    const { navigate, ProtectedRoute } = createApp(authClient, how)
    const readBeforeRedirect: boolean[] = []
    navigate.mockImplementation(() => {
      readBeforeRedirect.push(authClient.isAuthenticated.mock.calls.length > 0)
    })

    render(
      <ProtectedRoute>
        <p>Dashboard</p>
      </ProtectedRoute>
    )
    await settle()

    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith("/login")
    expect(readBeforeRedirect).toEqual([true])
  })

  it("shows a signed-in user's login button as connecting, then signed in", async () => {
    const { labels, AuthButton } = createApp(fakeAuthClient(true), how)

    render(<AuthButton />)
    await settle()

    expect(labels).toEqual(["Connecting...", "Logout"])
  })
})

describe("a restore that fails", () => {
  it("settles once it fails, without reading the session", async () => {
    // A local replica that cannot be reached fails `clientManager.initialize()`
    // before the restore reads the client. Treating that as settled keeps the
    // guard from showing its spinner for good.
    const authClient = fakeAuthClient(true)
    const { clientManager, navigate, ProtectedRoute } = createApp(authClient)
    let fail!: (error: Error) => void
    vi.mocked(clientManager.initializeAgent).mockReturnValue(
      new Promise<void>((_, reject) => {
        fail = reject
      })
    )

    const { container } = render(
      <ProtectedRoute>
        <p>Dashboard</p>
      </ProtectedRoute>
    )
    await settle()
    expect(container.textContent).toBe("Loading")
    expect(navigate).not.toHaveBeenCalled()

    await act(async () => fail(new Error("replica unreachable")))
    await settle()

    expect(authClient.isAuthenticated).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith("/login")
  })
})

describe("server render and hydration", () => {
  let root: Root | undefined
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
  })

  afterEach(() => {
    act(() => root?.unmount())
    root = undefined
    container.remove()
  })

  /**
   * Server-renders the guides' ProtectedRoute with a tree of its own, as a
   * per-request provider builds one, then hydrates it with a browser's tree.
   */
  async function serverRenderThenHydrate(signedIn: boolean) {
    const Page = ({ app }: { app: ReturnType<typeof createApp> }) => (
      <app.ProtectedRoute>
        <p>Dashboard</p>
      </app.ProtectedRoute>
    )
    // Handed its client, so that only the browser's manager imports the auth
    // module: vitest resolves a second import of a mocked module that starts
    // while the first is in flight to the real one.
    const server = createApp(fakeAuthClient(signedIn), "provided")
    container.innerHTML = renderToString(<Page app={server} />)
    const html = container.innerHTML

    const browser = createApp(fakeAuthClient(signedIn))
    function App() {
      const [app] = useState(() => browser)
      return <Page app={app} />
    }
    const hydrationErrors: string[] = []
    await act(async () => {
      root = hydrateRoot(container, <App />, {
        onRecoverableError: (error) =>
          hydrationErrors.push(String((error as Error).message)),
      })
    })
    await settle()
    return { html, hydrationErrors, navigate: browser.navigate }
  }

  it("renders the loading state, which hydration keeps until the restore finds the session", async () => {
    const { html, hydrationErrors, navigate } =
      await serverRenderThenHydrate(true)

    expect(html).toBe("<p>Loading</p>")
    expect(hydrationErrors).toEqual([])
    expect(navigate).not.toHaveBeenCalled()
    expect(container.textContent).toBe("Dashboard")
  })

  it("redirects once after hydration when the restore finds no session", async () => {
    const { html, hydrationErrors, navigate } =
      await serverRenderThenHydrate(false)

    expect(html).toBe("<p>Loading</p>")
    expect(hydrationErrors).toEqual([])
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith("/login")
  })
})
