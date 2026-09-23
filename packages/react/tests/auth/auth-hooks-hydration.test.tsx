import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { act } from "@testing-library/react"
import React, {
  Suspense,
  createContext,
  lazy,
  useContext,
  useState,
  type ComponentType,
} from "react"
import { hydrateRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { QueryClient } from "@tanstack/react-query"
import { ClientManager } from "@ic-reactor/core"
import { Principal } from "@icp-sdk/core/principal"
import { AuthenticationManager } from "../../src/auth/index.js"
import { createAuthHooks } from "../../src/hooks/createAuthHooks.js"

/**
 * The auth hooks read the managers through `useSyncExternalStore`. A server
 * render has no session and runs no effects, so its HTML shows the state the
 * managers start in. Hydration has to show that state too, including in a
 * component that hydrates after the root's `useAuth()` has restored the
 * session and initialized the agent: one inside a Suspense boundary whose code
 * arrives later. React reports every mismatch through `onRecoverableError`.
 */

const identityOf = (text: string) =>
  ({ getPrincipal: () => Principal.fromText(text) }) as never

function fakeAuthClient(signedIn: boolean) {
  return {
    getIdentity: vi.fn(async () =>
      identityOf(signedIn ? "aaaaa-aa" : "2vxsx-fae")
    ),
    isAuthenticated: vi.fn(async () => signedIn),
    signIn: vi.fn(),
    signOut: vi.fn(),
  }
}

/** One render tree's managers and hooks, built per request as in examples/nextjs. */
function createTree(authClient?: ReturnType<typeof fakeAuthClient>) {
  const clientManager = new ClientManager({
    queryClient: new QueryClient(),
    agentOptions: { host: "https://icp-api.io" },
  })
  const authentication = new AuthenticationManager({
    clientManager,
    ...(authClient && { authClient: authClient as never }),
  })
  return { clientManager, authentication, ...createAuthHooks(authentication) }
}

type Tree = ReturnType<typeof createTree>
const TreeContext = createContext<Tree | null>(null)
const useTree = () => useContext(TreeContext)!

/** Restores the session from its effect, as the first consumer does. */
function Header() {
  const { isAuthenticated } = useTree().useAuth()
  return <header>{isAuthenticated ? "Signed in" : "Sign in"}</header>
}

function App({
  Late,
  authClient,
}: {
  Late: ComponentType
  authClient?: ReturnType<typeof fakeAuthClient>
}) {
  const [tree] = useState(() => createTree(authClient))
  return (
    <TreeContext.Provider value={tree}>
      <Header />
      <Suspense fallback={<p>loading</p>}>
        <Late />
      </Suspense>
    </TreeContext.Provider>
  )
}

let root: Root | undefined
let container: HTMLElement

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })

/**
 * Server-render `Late`, then hydrate with `Late`'s code arriving only after
 * the header has hydrated and its restore has finished.
 */
async function hydrateLate(
  Late: ComponentType,
  authClient: ReturnType<typeof fakeAuthClient>
) {
  container.innerHTML = renderToString(<App Late={Late} />)

  let deliver!: () => void
  const LazyLate = lazy(
    () =>
      new Promise<{ default: ComponentType }>((resolve) => {
        deliver = () => resolve({ default: Late })
      })
  )
  const hydrationErrors: string[] = []
  await act(async () => {
    root = hydrateRoot(
      container,
      <App Late={LazyLate} authClient={authClient} />,
      {
        onRecoverableError: (error) =>
          hydrationErrors.push(String((error as Error).message)),
      }
    )
  })
  await settle()
  await act(async () => deliver())
  await settle()
  return hydrationErrors
}

beforeEach(() => {
  vi.spyOn(console, "debug").mockImplementation(() => {})
  vi.spyOn(console, "info").mockImplementation(() => {})
  container = document.createElement("div")
  document.body.appendChild(container)
})

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  container.remove()
  vi.restoreAllMocks()
})

describe("auth hooks hydrate against the server's HTML", () => {
  it("useUserPrincipal in a boundary that hydrates after the session is restored", async () => {
    const Profile = () => {
      const principal = useTree().useUserPrincipal()
      return <main>{principal ? principal.toText() : "nobody"}</main>
    }

    const hydrationErrors = await hydrateLate(Profile, fakeAuthClient(true))

    expect(hydrationErrors).toEqual([])
    // Then it shows the restored session.
    expect(container.querySelector("main")?.textContent).toBe("aaaaa-aa")
    expect(container.querySelector("header")?.textContent).toBe("Signed in")
  })

  it("useAgentState in a boundary that hydrates after the agent is initialized", async () => {
    const Status = () => {
      const { isInitialized } = useTree().useAgentState()
      return <main>{isInitialized ? "online" : "starting"}</main>
    }

    const hydrationErrors = await hydrateLate(Status, fakeAuthClient(false))

    expect(hydrationErrors).toEqual([])
    expect(container.querySelector("main")?.textContent).toBe("online")
  })
})
