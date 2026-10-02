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
import { createTestAuth, type TestAuth } from "@ic-reactor/core/testing"
import { act } from "@testing-library/react"
import { Suspense, lazy, type ComponentType, type ReactElement } from "react"
import { hydrateRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ReactorProvider, useAuth } from "../src/index.js"
import { anonymousClient, clientWithAuth, macrotask } from "./helpers.js"

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
  it("starts anonymous while the browser is signed in, then shows the session", async () => {
    headerStatuses = []
    const auth = createTestAuth({ seed: 7 })
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
    const auth = createTestAuth({ seed: 7 })
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
    const auth = createTestAuth({ seed: 7, signedIn: false })
    container.innerHTML = renderToString(page(Profile))

    const { recoverable, logged } = await hydrate(page(Profile, auth))

    expect(recoverable).toEqual([])
    expect(logged).not.toHaveBeenCalled()
    expect(container.textContent).toBe("anonymous:2vxsx-faeanonymous")
  })
})
