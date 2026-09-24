import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import React, { StrictMode } from "react"
import { hydrateRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import {
  HydrationBoundary,
  QueryClient,
  QueryClientProvider,
  dehydrate,
  useQueryClient,
} from "@tanstack/react-query"
import type { ActorMethod } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import { ClientManager } from "@ic-reactor/core"
import { createReactorProvider } from "../src/createReactorProvider.js"
import { defineReactor } from "../src/defineReactor.js"
import { AuthenticationManager } from "../src/auth/index.js"
import { authenticationOf } from "../src/ownedAuthentication.js"

/**
 * `createReactorProvider` replaces the provider server-rendered apps wrote by
 * hand (examples/nextjs's `provider.tsx`): it builds the reactors once per
 * mounted tree, hands them to `useReactor()`, provides their QueryClient and
 * disposes the Internet Identity managers when the tree unmounts.
 */

interface TodoActor {
  greet: ActorMethod<[string], string>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({ greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]) })

const CANISTER_ID = "rrkah-fqaaa-aaaaa-aaaaq-cai"
const HOST = "https://icp-api.io"

const identityOf = (text: string) =>
  ({ getPrincipal: () => Principal.fromText(text) }) as never

/** An auth client that answers from memory, signed in or not. */
function fakeAuthClient(signedIn: boolean) {
  return {
    getIdentity: vi.fn(async () =>
      identityOf(signedIn ? "aaaaa-aa" : "2vxsx-fae")
    ),
    isAuthenticated: vi.fn(async () => signedIn),
    signIn: vi.fn(),
    signOut: vi.fn(),
  } as never
}

/** A todo reactor whose calls answer without a replica. */
function defineTodo(options: { signedIn?: boolean } = {}) {
  const todo = defineReactor<TodoActor>({
    name: "todo",
    idlFactory,
    canisterId: CANISTER_ID,
    agentOptions: { host: HOST },
    auth: { authClient: fakeAuthClient(options.signedIn ?? false) },
  })
  vi.spyOn(todo.reactor, "callMethod").mockImplementation(
    (async ({ args }: { args?: string[] }) => `hello ${args?.[0]}`) as never
  )
  return todo
}

/** A bare `ClientManager` + `AuthenticationManager` pair. */
function createManagers() {
  const clientManager = new ClientManager({
    queryClient: new QueryClient(),
    agentOptions: { host: HOST },
  })
  const authentication = new AuthenticationManager({
    clientManager,
    authClient: fakeAuthClient(false),
  })
  return { clientManager, authentication }
}

let dispose: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  dispose = vi.spyOn(AuthenticationManager.prototype, "dispose")
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("createReactorProvider", () => {
  it("gives the components below it the value its factory built", async () => {
    const factory = vi.fn(() => defineTodo())
    const { ReactorProvider, useReactor } = createReactorProvider(factory)
    const seen: unknown[] = []

    function Greeting() {
      const todo = useReactor()
      seen.push(todo)
      const { data } = todo.useActorQuery({
        functionName: "greet",
        args: ["alice"],
      })
      return <p>{data ?? "loading"}</p>
    }

    const view = render(
      <ReactorProvider>
        <Greeting />
      </ReactorProvider>
    )

    expect(await screen.findByText("hello alice")).toBeTruthy()
    view.rerender(
      <ReactorProvider>
        <Greeting />
      </ReactorProvider>
    )
    // Built once for the mount, and the same value on every render.
    expect(factory).toHaveBeenCalledTimes(1)
    expect(new Set(seen)).toEqual(new Set([factory.mock.results[0].value]))
  })

  it("builds a value per mounted provider", () => {
    const { ReactorProvider, useReactor } = createReactorProvider(() =>
      createManagers()
    )
    const seen: unknown[] = []
    function Probe() {
      seen.push(useReactor())
      return null
    }

    render(
      <>
        <ReactorProvider>
          <Probe />
        </ReactorProvider>
        <ReactorProvider>
          <Probe />
        </ReactorProvider>
      </>
    )

    expect(seen).toHaveLength(2)
    expect(seen[0]).not.toBe(seen[1])
  })

  it("returns one property of the value by name", () => {
    const { ReactorProvider, useReactor } = createReactorProvider(() => ({
      managers: createManagers(),
      label: "todo",
    }))
    let label: string | undefined
    function Probe() {
      label = useReactor("label")
      return null
    }

    render(
      <ReactorProvider>
        <Probe />
      </ReactorProvider>
    )

    expect(label).toBe("todo")
  })

  it("throws an error naming the provider outside it", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { useReactor } = createReactorProvider(() => createManagers())
    function Probe() {
      useReactor()
      return null
    }

    expect(() => render(<Probe />)).toThrow(
      /useReactor\(\) was called outside its <ReactorProvider>/
    )
  })

  it("keeps each provider's context to its own useReactor", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const first = createReactorProvider(() => createManagers())
    const second = createReactorProvider(() => createManagers())
    function Probe() {
      second.useReactor()
      return null
    }

    expect(() =>
      render(
        <first.ReactorProvider>
          <Probe />
        </first.ReactorProvider>
      )
    ).toThrow(/outside its <ReactorProvider>/)
  })

  it("passes its props to the factory once, and builds again for a new key", () => {
    const factory = vi.fn(({ canisterId }: { canisterId: string }) => ({
      canisterId,
      ...createManagers(),
    }))
    const { ReactorProvider, useReactor } = createReactorProvider(factory)
    let current: ReturnType<typeof factory> | undefined
    function Probe() {
      current = useReactor()
      return null
    }
    const tree = (key: string, canisterId: string) => (
      <ReactorProvider key={key} canisterId={canisterId}>
        <Probe />
      </ReactorProvider>
    )

    const view = render(tree("a", CANISTER_ID))
    const first = current!
    expect(first.canisterId).toBe(CANISTER_ID)

    // Read once per mount, like a `useState` initial value.
    view.rerender(tree("a", "aaaaa-aa"))
    expect(current).toBe(first)
    expect(factory).toHaveBeenCalledTimes(1)
    expect(dispose).not.toHaveBeenCalled()

    // A new key is a new tree: the old one is released, a new one built.
    view.rerender(tree("b", "aaaaa-aa"))
    expect(factory).toHaveBeenCalledTimes(2)
    expect(current).not.toBe(first)
    expect(current!.canisterId).toBe("aaaaa-aa")
    expect(dispose.mock.contexts).toEqual([first.authentication])
  })

  describe("QueryClientProvider", () => {
    function renderClientOf(
      element: (children: React.ReactNode) => React.ReactElement
    ) {
      let client: QueryClient | undefined
      function Probe() {
        client = useQueryClient()
        return null
      }
      render(element(<Probe />))
      return client
    }

    it("provides the QueryClient a defineReactor result uses", () => {
      const { ReactorProvider, useReactor } = createReactorProvider(() =>
        defineTodo()
      )
      let todo: ReturnType<typeof defineTodo> | undefined
      function Todo() {
        todo = useReactor()
        return null
      }

      const client = renderClientOf((probe) => (
        <ReactorProvider>
          <Todo />
          {probe}
        </ReactorProvider>
      ))

      expect(client).toBe(todo!.queryClient)
    })

    it("provides the one QueryClient several reactors share", () => {
      let shared: QueryClient | undefined
      const { ReactorProvider } = createReactorProvider(() => {
        const first = defineTodo()
        const second = defineReactor<TodoActor>({
          name: "second",
          idlFactory,
          canisterId: "aaaaa-aa",
          clientManager: first.clientManager,
        })
        shared = first.queryClient
        return { first, second, reactor: second.reactor }
      })

      const client = renderClientOf((probe) => (
        <ReactorProvider>{probe}</ReactorProvider>
      ))

      expect(client).toBe(shared)
    })

    it("provides none when the value holds several QueryClients", () => {
      const outer = new QueryClient()
      const { ReactorProvider } = createReactorProvider(() => ({
        first: defineTodo(),
        second: defineTodo(),
      }))

      const client = renderClientOf((probe) => (
        <QueryClientProvider client={outer}>
          <ReactorProvider>{probe}</ReactorProvider>
        </QueryClientProvider>
      ))

      expect(client).toBe(outer)
    })

    it("provides none with queryClientProvider: false", () => {
      const outer = new QueryClient()
      const { ReactorProvider } = createReactorProvider(() => defineTodo(), {
        queryClientProvider: false,
      })

      const client = renderClientOf((probe) => (
        <QueryClientProvider client={outer}>
          <ReactorProvider>{probe}</ReactorProvider>
        </QueryClientProvider>
      ))

      expect(client).toBe(outer)
    })

    it("lets a HydrationBoundary below it feed the reactor hooks", async () => {
      // What a server component prefetched with a reactor of its own, sent
      // down as dehydrated state.
      const server = defineTodo()
      await server.reactor.fetchQuery({
        functionName: "greet",
        args: ["alice"],
      })
      const state = dehydrate(server.queryClient)

      const factory = vi.fn(() => defineTodo())
      const { ReactorProvider, useReactor } = createReactorProvider(factory)
      const firstRender: Array<string | undefined> = []
      function Greeting() {
        const { data } = useReactor().useActorQuery({
          functionName: "greet",
          args: ["alice"],
          // Fresh, so that mounting does not fetch again.
          staleTime: 60_000,
        })
        firstRender.push(data)
        return <p>{data ?? "loading"}</p>
      }

      render(
        <ReactorProvider>
          <HydrationBoundary state={state}>
            <Greeting />
          </HydrationBoundary>
        </ReactorProvider>
      )

      expect(firstRender[0]).toBe("hello alice")
      expect(
        factory.mock.results[0].value.reactor.callMethod
      ).not.toHaveBeenCalled()
    })
  })

  describe("on unmount", () => {
    it("disposes the manager a defineReactor result built", async () => {
      const { ReactorProvider, useReactor } = createReactorProvider(() =>
        defineTodo()
      )
      let todo: ReturnType<typeof defineTodo> | undefined
      function SignIn() {
        todo = useReactor()
        const { isAuthenticating } = todo.useAuth()
        return <p>{isAuthenticating ? "checking" : "checked"}</p>
      }

      const view = render(
        <ReactorProvider>
          <SignIn />
        </ReactorProvider>
      )
      expect(await screen.findByText("checked")).toBeTruthy()
      expect(dispose).not.toHaveBeenCalled()

      view.unmount()

      expect(dispose.mock.contexts).toEqual([todo!.authentication])
    })

    it("builds no manager to dispose for a tree that never used one", () => {
      const { ReactorProvider, useReactor } = createReactorProvider(() =>
        defineTodo()
      )
      let todo: ReturnType<typeof defineTodo> | undefined
      function Probe() {
        todo = useReactor()
        return null
      }

      render(
        <ReactorProvider>
          <Probe />
        </ReactorProvider>
      ).unmount()

      expect(authenticationOf(todo!)).toBeUndefined()
      expect(dispose).not.toHaveBeenCalled()
    })

    it("disposes each manager the value holds once", () => {
      let built: AuthenticationManager[] = []
      const { ReactorProvider } = createReactorProvider(() => {
        const todo = defineTodo()
        const shared = todo.authentication
        const other = defineReactor<TodoActor>({
          name: "other",
          idlFactory,
          canisterId: "aaaaa-aa",
          authentication: shared,
        })
        const { authentication: own } = createManagers()
        built = [shared, own]
        return { todo, other, shared, own }
      })

      render(<ReactorProvider />).unmount()

      expect(dispose).toHaveBeenCalledTimes(2)
      expect(new Set(dispose.mock.contexts)).toEqual(new Set(built))
    })

    it("disposes a value that is itself a manager", () => {
      let authentication: AuthenticationManager | undefined
      const { ReactorProvider } = createReactorProvider(
        () => (authentication = createManagers().authentication)
      )

      render(<ReactorProvider />).unmount()

      expect(dispose.mock.contexts).toEqual([authentication])
    })
  })

  describe("under StrictMode", () => {
    it("keeps one value across the effect StrictMode runs twice, and restores the session", async () => {
      const { ReactorProvider, useReactor } = createReactorProvider(() =>
        defineTodo({ signedIn: true })
      )
      const seen = new Set<unknown>()
      function Header() {
        const todo = useReactor()
        seen.add(todo)
        const { isAuthenticated, principal } = todo.useAuth()
        const { data } = todo.useActorQuery({
          functionName: "greet",
          args: [principal?.toText() ?? "guest"],
        })
        return <p>{isAuthenticated ? data : "signed out"}</p>
      }

      const view = render(
        <StrictMode>
          <ReactorProvider>
            <Header />
          </ReactorProvider>
        </StrictMode>
      )

      // StrictMode's second cleanup-and-effect pass disposed the manager, and
      // the restore `useAuth()` started still settled on the same value.
      expect(await screen.findByText("hello aaaaa-aa")).toBeTruthy()
      expect(seen.size).toBe(1)
      const [todo] = seen as Set<ReturnType<typeof defineTodo>>
      expect(dispose.mock.contexts).toEqual([todo.authentication])

      view.unmount()
      expect(dispose.mock.contexts).toEqual([
        todo.authentication,
        todo.authentication,
      ])
    })
  })

  describe("server rendering and hydration", () => {
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

    it("renders on the server without effects, and hydrates without a mismatch", async () => {
      const factory = vi.fn(() => defineTodo({ signedIn: true }))
      const { ReactorProvider, useReactor } = createReactorProvider(factory)
      function Header() {
        const { useAuth } = useReactor()
        const { isAuthenticating, isAuthenticated } = useAuth()
        if (isAuthenticating) return <header>checking</header>
        return <header>{isAuthenticated ? "signed in" : "signed out"}</header>
      }
      function Greeting() {
        const { useActorQuery } = useReactor()
        const { data } = useActorQuery({
          functionName: "greet",
          args: ["alice"],
        })
        return <p>{data ?? "loading"}</p>
      }
      const app = (
        <ReactorProvider>
          <Header />
          <Greeting />
        </ReactorProvider>
      )

      container.innerHTML = renderToString(app)
      expect(container.textContent).toBe("checkingloading")
      expect(dispose).not.toHaveBeenCalled()

      const hydrationErrors: unknown[] = []
      await act(async () => {
        root = hydrateRoot(container, app, {
          onRecoverableError: (error) => hydrationErrors.push(error),
        })
      })
      await waitFor(() =>
        expect(container.textContent).toBe("signed inhello alice")
      )

      expect(hydrationErrors).toEqual([])
      // The server render and the browser each built their own value.
      expect(factory).toHaveBeenCalledTimes(2)
      expect(factory.mock.results[0].value).not.toBe(
        factory.mock.results[1].value
      )
    })
  })
})
