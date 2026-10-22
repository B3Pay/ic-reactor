/**
 * A server render has no session, so its HTML shows who calls as the
 * anonymous principal. Hydration has to start from that same state even when
 * the browser holds a session, and only then show the session: including in a
 * component that hydrates after the root's `useAuth()` has already moved on,
 * one inside a Suspense boundary whose code arrives later. React reports every
 * mismatch through `onRecoverableError`, and logs it through `console.error`.
 *
 * The server render here runs in jsdom, where `useSyncExternalStore` takes its
 * server snapshot in `renderToString` as it does anywhere; the server's client
 * is anonymous, as a real server's is, so that a server snapshot that read the
 * browser's state instead would produce different HTML on the two sides.
 */
import { act } from "@testing-library/react"
import {
  StrictMode,
  Suspense,
  lazy,
  useEffect,
  useState,
  type ComponentType,
  type ReactElement,
} from "react"
import { hydrateRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ReactorProvider, useAuth } from "../src/index.js"
import {
  anonymousClient,
  clientWithAuth,
  macrotask,
  type TestAuth,
  testAuth,
} from "./helpers.js"

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
  vi.restoreAllMocks()
})

/** What each render of the header saw, in order. */
let headerStatuses: string[]

function Header() {
  const { status, principal } = useAuth()
  headerStatuses.push(status)
  return <header>{`${status}:${principal}`}</header>
}

const Profile = () => <main>{useAuth().status}</main>

/** The page: the server renders it anonymous, the browser with `auth`. */
function page(Late: ComponentType, auth?: TestAuth): ReactElement {
  return (
    <ReactorProvider
      client={() =>
        auth === undefined ? anonymousClient() : clientWithAuth(() => auth)
      }
    >
      <Header />
      <Suspense fallback={<p>loading</p>}>
        <Late />
      </Suspense>
    </ReactorProvider>
  )
}

/** Hydrates `container` with `element`, returning what React reported. */
async function hydrate(element: ReactElement) {
  const recoverable: string[] = []
  const logged = vi.spyOn(console, "error").mockImplementation(() => {})
  await act(async () => {
    root = hydrateRoot(container, element, {
      onRecoverableError: (error) =>
        recoverable.push(String((error as Error).message)),
    })
  })
  await act(macrotask)
  return { recoverable, logged }
}

describe("hydrating the server's HTML", () => {
  it("is rendered as the same HTML by a client that holds a session and one that does not", () => {
    // The HTML below is the one the hydration tests start from, written by an
    // anonymous client. A server's real client holds no session either, so the
    // two renders have to agree: the server snapshot does not read the auth.
    headerStatuses = []
    const auth = testAuth({ identity: 7 })
    const buildAuth = vi.fn(() => auth)
    const anonymous = renderToString(page(Profile))

    const withSession = renderToString(
      <ReactorProvider client={() => clientWithAuth(buildAuth)}>
        <Header />
        <Suspense fallback={<p>loading</p>}>
          <Profile />
        </Suspense>
      </ReactorProvider>
    )

    expect(withSession).toBe(anonymous)
    expect(withSession).not.toContain("signed-in")
    // The session was not even read, though jsdom has a `window` to read it in.
    expect(buildAuth).not.toHaveBeenCalled()
  })

  it("starts anonymous while the browser is signed in, then shows the session", async () => {
    headerStatuses = []
    const auth = testAuth({ identity: 7 })
    const principal = auth.getPrincipal()?.toText()
    container.innerHTML = renderToString(page(Profile))
    expect(container.textContent).toBe("anonymous:2vxsx-faeanonymous")
    headerStatuses = []

    const { recoverable, logged } = await hydrate(page(Profile, auth))

    expect(recoverable).toEqual([])
    expect(logged).not.toHaveBeenCalled()
    // The first render matched the HTML; the next one showed the session.
    expect(headerStatuses).toEqual(["anonymous", "signed-in"])
    expect(container.querySelector("header")?.textContent).toBe(
      `signed-in:${principal}`
    )
    expect(container.querySelector("main")?.textContent).toBe("signed-in")
  })

  it("hydrates a boundary that arrives after the session was shown", async () => {
    headerStatuses = []
    const auth = testAuth({ identity: 7 })
    container.innerHTML = renderToString(page(Profile))

    let deliver!: () => void
    const Late = lazy(
      () =>
        new Promise<{ default: ComponentType }>((resolve) => {
          deliver = () => resolve({ default: Profile })
        })
    )
    const { recoverable, logged } = await hydrate(page(Late, auth))
    // The header has hydrated and moved on; the boundary is still the server's.
    expect(container.querySelector("header")?.textContent).toMatch(
      /^signed-in:/
    )
    expect(container.querySelector("main")?.textContent).toBe("anonymous")

    await act(async () => deliver())
    await act(macrotask)

    expect(recoverable).toEqual([])
    expect(logged).not.toHaveBeenCalled()
    expect(container.querySelector("main")?.textContent).toBe("signed-in")
  })

  it("stays anonymous when the browser holds no session", async () => {
    headerStatuses = []
    const auth = testAuth({ identity: 7, signedIn: false })
    container.innerHTML = renderToString(page(Profile))

    const { recoverable, logged } = await hydrate(page(Profile, auth))

    expect(recoverable).toEqual([])
    expect(logged).not.toHaveBeenCalled()
    expect(container.textContent).toBe("anonymous:2vxsx-faeanonymous")
  })
})

/**
 * The redirect sign-in route of the auth guide, as the guide shows it: its
 * effect starts the sign-in on a timer that its cleanup clears. Keep the two
 * in step.
 */
function SignInPage() {
  const { status, signIn } = useAuth()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (status === "signed-in") return
    const start = setTimeout(() => {
      signIn({ returnTo: "/account" }).catch((error: unknown) => {
        console.error(error)
        setFailed(true)
      })
    })
    return () => clearTimeout(start)
  }, [status, signIn])
  if (status === "signed-in") return <a href="/account">Continue</a>
  if (failed) {
    return (
      <p>
        The sign-in did not finish. <a href="/sign-in">Try again</a>
      </p>
    )
  }
  return <p>Signing you in…</p>
}

/** The sign-in route: the server renders it anonymous, the browser with `auth`. */
const signInRoute = (auth?: TestAuth): ReactElement => (
  <StrictMode>
    <ReactorProvider
      client={() =>
        auth === undefined ? anonymousClient() : clientWithAuth(() => auth)
      }
    >
      <SignInPage />
    </ReactorProvider>
  </StrictMode>
)

/** `real` with a `signIn` that counts its calls. */
function countingSignIn(real: TestAuth) {
  const signIn = vi.fn((_options?: unknown) => real.signIn())
  return { auth: { ...real, signIn }, signIn }
}

describe("the auth guide's sign-in route, hydrated", () => {
  it("sends nobody to sign in whose session the hydrating render did not show", async () => {
    const { auth, signIn } = countingSignIn(testAuth({ identity: 7 }))
    container.innerHTML = renderToString(signInRoute())

    const { recoverable } = await hydrate(signInRoute(auth))

    expect(recoverable).toEqual([])
    expect(signIn).not.toHaveBeenCalled()
    expect(container.textContent).toBe("Continue")
  })

  it("starts one sign-in in a browser that holds no session, under StrictMode", async () => {
    const { auth, signIn } = countingSignIn(
      testAuth({ identity: 7, signedIn: false })
    )
    container.innerHTML = renderToString(signInRoute())

    await hydrate(signInRoute(auth))

    expect(signIn).toHaveBeenCalledTimes(1)
    expect(signIn).toHaveBeenCalledWith({ returnTo: "/account" })
    expect(auth.getStatus().state).toBe("signed-in")
  })

  it("offers to try again when the sign-in fails", async () => {
    const real = testAuth({ identity: 7, signedIn: false })
    const cancelled = new Error("The user cancelled the sign-in.")
    const auth = { ...real, signIn: vi.fn(() => Promise.reject(cancelled)) }
    container.innerHTML = renderToString(signInRoute())

    await hydrate(signInRoute(auth))

    expect(auth.signIn).toHaveBeenCalledTimes(1)
    expect(container.textContent).toBe("The sign-in did not finish. Try again")
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/sign-in")
  })
})
