import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  render,
  renderHook,
  waitFor,
  act,
  cleanup,
} from "@testing-library/react"
import React, { StrictMode, Suspense } from "react"
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from "@tanstack/react-query"
import { ActorMethod } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { ClientManager, Reactor } from "@ic-reactor/core"
import { createActorHooks } from "../src/createActorHooks.js"
import { createQuery } from "../src/createQuery.js"
import { createSuspenseQuery } from "../src/createSuspenseQuery.js"
import { createInfiniteQuery } from "../src/createInfiniteQuery.js"
import { createSuspenseInfiniteQuery } from "../src/createSuspenseInfiniteQuery.js"
import { createMutation } from "../src/createMutation.js"

/**
 * Hooks bind to their reactor's own QueryClient, and the React setup guide
 * calls `QueryClientProvider` optional. But the provider is also what calls
 * `queryClient.mount()`, and that is the only thing that subscribes a
 * QueryClient to TanStack's focus and online managers. Without it:
 *
 * - `refetchOnWindowFocus` and `refetchOnReconnect`, `true` by default and in
 *   every options table in the docs, never fire;
 * - a query that starts while the browser is offline stays `paused` after the
 *   connection returns, so its spinner never ends;
 * - a mutation sent while offline is never resumed, so `isPending` never ends.
 *
 * None of these tests renders a QueryClientProvider, as that guide allows.
 */

interface TestActor {
  greet: ActorMethod<[string], string>
  set_name: ActorMethod<[string], string>
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
  IDL.Service({
    greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]),
    set_name: IDL.Func([IDL.Text], [IDL.Text], []),
  })

describe("hooks mount their reactor's QueryClient without a provider", () => {
  let queryClient: QueryClient
  let reactor: Reactor<TestActor>
  let callMethod: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    reactor = new Reactor<TestActor>({
      clientManager: new ClientManager({
        queryClient,
        agentOptions: { host: "https://icp-api.io" },
      }),
      name: "greeter",
      canisterId: "rrkah-fqaaa-aaaaa-aaaaq-cai",
      idlFactory,
    })
    let calls = 0
    callMethod = vi
      .spyOn(reactor, "callMethod")
      .mockImplementation(
        (async ({ args }: { args?: string[] }) =>
          `hello ${args?.[0]} #${++calls}`) as never
      )
  })

  afterEach(() => {
    // Unmount first, so resetting the managers cannot refetch for this test.
    cleanup()
    // Both managers are module singletons shared by every test.
    focusManager.setFocused(undefined)
    onlineManager.setOnline(true)
  })

  /** Leave the window and come back to it. */
  const refocus = () =>
    act(() => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })

  it("refetches a stale useActorQuery when the window regains focus", async () => {
    const { useActorQuery } = createActorHooks(reactor)
    const { result } = renderHook(() =>
      useActorQuery({ functionName: "greet", args: ["alice"] })
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe("hello alice #1")
    expect(callMethod).toHaveBeenCalledTimes(1)

    refocus()

    await waitFor(() => expect(callMethod).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.data).toBe("hello alice #2"))
  })

  it("refetches a stale createQuery hook when the window regains focus", async () => {
    const greetQuery = createQuery(reactor, {
      functionName: "greet",
      args: ["bob"],
      staleTime: 0,
    })
    const { result } = renderHook(() => greetQuery.useQuery())
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe("hello bob #1")

    refocus()

    await waitFor(() => expect(callMethod).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.data).toBe("hello bob #2"))
  })

  it("resumes a query that started offline once the connection returns", async () => {
    const { useActorQuery } = createActorHooks(reactor)
    onlineManager.setOnline(false)

    const { result } = renderHook(() =>
      useActorQuery({ functionName: "greet", args: ["carol"] })
    )
    await waitFor(() => expect(result.current.fetchStatus).toBe("paused"))
    expect(callMethod).not.toHaveBeenCalled()

    act(() => onlineManager.setOnline(true))

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe("hello carol #1")
  })

  it("resumes a mutation that was sent offline once the connection returns", async () => {
    const setName = createMutation(reactor, { functionName: "set_name" })
    const { result } = renderHook(() => setName.useMutation())
    onlineManager.setOnline(false)

    act(() => result.current.mutate(["dave"]))
    await waitFor(() => expect(result.current.isPaused).toBe(true))

    act(() => onlineManager.setOnline(true))

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe("hello dave #1")
  })

  it("stops listening once the last hook unmounts", async () => {
    // The mount is reference-counted like QueryClientProvider's, so it must be
    // released: a client that stayed subscribed would refetch for a tree that
    // is gone and could never be garbage collected.
    const { useActorQuery } = createActorHooks(reactor)
    const first = renderHook(() =>
      useActorQuery({ functionName: "greet", args: ["erin"] })
    )
    const second = renderHook(() =>
      useActorQuery({ functionName: "greet", args: ["erin"] })
    )
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true))
    const onFocus = vi.spyOn(queryClient.getQueryCache(), "onFocus")

    first.unmount()
    refocus()
    await waitFor(() => expect(onFocus).toHaveBeenCalledTimes(1))

    second.unmount()
    refocus()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(onFocus).toHaveBeenCalledTimes(1)
  })

  it("leaves a QueryClientProvider's own mount in place", async () => {
    const { useActorQuery } = createActorHooks(reactor)
    render(
      <QueryClientProvider client={queryClient}>
        <div />
      </QueryClientProvider>
    )
    const hook = renderHook(() =>
      useActorQuery({ functionName: "greet", args: ["frank"] })
    )
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))
    const onFocus = vi.spyOn(queryClient.getQueryCache(), "onFocus")

    hook.unmount()
    refocus()

    await waitFor(() => expect(onFocus).toHaveBeenCalledTimes(1))
  })

  describe("every hook mounts the client", () => {
    const infinite = {
      functionName: "greet",
      initialPageParam: "page-1",
      getArgs: (page: string) => [page] as [string],
      getNextPageParam: () => undefined,
    } as const

    const cases: [string, () => () => unknown][] = [
      [
        "bound useActorQuery",
        () => {
          const { useActorQuery } = createActorHooks(reactor)
          return () => useActorQuery({ functionName: "greet", args: ["x"] })
        },
      ],
      [
        "bound useActorSuspenseQuery",
        () => {
          const { useActorSuspenseQuery } = createActorHooks(reactor)
          return () =>
            useActorSuspenseQuery({ functionName: "greet", args: ["x"] })
        },
      ],
      [
        "bound useActorInfiniteQuery",
        () => {
          const { useActorInfiniteQuery } = createActorHooks(reactor)
          return () => useActorInfiniteQuery(infinite)
        },
      ],
      [
        "bound useActorSuspenseInfiniteQuery",
        () => {
          const { useActorSuspenseInfiniteQuery } = createActorHooks(reactor)
          return () => useActorSuspenseInfiniteQuery(infinite)
        },
      ],
      [
        "bound useActorMutation",
        () => {
          const { useActorMutation } = createActorHooks(reactor)
          return () => useActorMutation({ functionName: "set_name" })
        },
      ],
      [
        "bound useActorMethod",
        () => {
          const { useActorMethod } = createActorHooks(reactor)
          return () => useActorMethod({ functionName: "greet", args: ["x"] })
        },
      ],
      [
        "createQuery().useQuery",
        () => {
          const query = createQuery(reactor, {
            functionName: "greet",
            args: ["x"],
          })
          return () => query.useQuery()
        },
      ],
      [
        "createSuspenseQuery().useSuspenseQuery",
        () => {
          const query = createSuspenseQuery(reactor, {
            functionName: "greet",
            args: ["x"],
          })
          return () => query.useSuspenseQuery()
        },
      ],
      [
        "createInfiniteQuery().useInfiniteQuery",
        () => {
          const query = createInfiniteQuery(reactor, infinite)
          return () => query.useInfiniteQuery()
        },
      ],
      [
        "createSuspenseInfiniteQuery().useSuspenseInfiniteQuery",
        () => {
          const query = createSuspenseInfiniteQuery(reactor, infinite)
          return () => query.useSuspenseInfiniteQuery()
        },
      ],
      [
        "createMutation().useMutation",
        () => {
          const mutation = createMutation(reactor, { functionName: "set_name" })
          return () => mutation.useMutation()
        },
      ],
    ]

    it.each(cases)("%s", async (_name, build) => {
      const useHook = build()
      // A Suspense boundary for the suspense hooks, and no provider for any.
      const { result } = renderHook(() => useHook(), {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <Suspense fallback={null}>{children}</Suspense>
        ),
      })
      // Suspense hooks only commit, and so only run effects, once they have
      // data.
      await waitFor(() => expect(result.current).not.toBeNull())
      const onFocus = vi.spyOn(queryClient.getQueryCache(), "onFocus")

      refocus()

      await waitFor(() => expect(onFocus).toHaveBeenCalled())
    })
  })

  describe("a suspense hook that suspends while offline", () => {
    // A suspense hook throws its fetch promise before its component commits,
    // so an effect cannot mount the client until that promise settles. A fetch
    // that started offline only settles once a mounted client hears the
    // connection come back, so the fallback used to stay up for good.
    const infinite = {
      functionName: "greet",
      initialPageParam: "grace",
      getArgs: (page: string) => [page] as [string],
      getNextPageParam: () => undefined,
    } as const

    const cases: [string, () => () => string][] = [
      [
        "createSuspenseQuery().useSuspenseQuery",
        () => {
          const query = createSuspenseQuery(reactor, {
            functionName: "greet",
            args: ["grace"],
          })
          return () => query.useSuspenseQuery().data
        },
      ],
      [
        "createSuspenseInfiniteQuery().useSuspenseInfiniteQuery",
        () => {
          const query = createSuspenseInfiniteQuery(reactor, infinite)
          return () => query.useSuspenseInfiniteQuery().data.pages[0]
        },
      ],
      [
        "bound useActorSuspenseQuery",
        () => {
          const { useActorSuspenseQuery } = createActorHooks(reactor)
          return () =>
            useActorSuspenseQuery({ functionName: "greet", args: ["grace"] })
              .data
        },
      ],
      [
        "bound useActorSuspenseInfiniteQuery",
        () => {
          const { useActorSuspenseInfiniteQuery } = createActorHooks(reactor)
          return () => useActorSuspenseInfiniteQuery(infinite).data.pages[0]
        },
      ],
    ]

    const fetchStatus = () =>
      queryClient.getQueryCache().getAll()[0]?.state.fetchStatus

    it.each(cases)(
      "%s resumes once the connection returns",
      async (_name, build) => {
        const useGreeting = build()
        const Greeting = () => <p>{useGreeting()}</p>
        onlineManager.setOnline(false)

        const { container } = render(
          <Suspense fallback={<p>loading</p>}>
            <Greeting />
          </Suspense>
        )
        await waitFor(() => expect(fetchStatus()).toBe("paused"))
        expect(container.textContent).toBe("loading")
        expect(callMethod).not.toHaveBeenCalled()

        act(() => onlineManager.setOnline(true))

        await waitFor(() =>
          expect(container.textContent).toBe("hello grace #1")
        )
      }
    )

    it.each([
      ["", React.Fragment],
      [" under StrictMode", StrictMode],
    ])(
      "stops listening once it has resumed and unmounted%s",
      async (_name, Wrapper) => {
        // The mount that bridges the suspended render is released when the
        // fetch settles, and the committed hook's own mount on unmount, so a
        // double render or double effect cannot leave the client subscribed.
        const query = createSuspenseQuery(reactor, {
          functionName: "greet",
          args: ["heidi"],
        })
        const Greeting = () => <p>{query.useSuspenseQuery().data}</p>
        onlineManager.setOnline(false)
        const view = render(
          <Wrapper>
            <Suspense fallback={<p>loading</p>}>
              <Greeting />
            </Suspense>
          </Wrapper>
        )
        await waitFor(() => expect(fetchStatus()).toBe("paused"))

        act(() => onlineManager.setOnline(true))
        await waitFor(() =>
          expect(view.container.textContent).toBe("hello heidi #1")
        )

        view.unmount()
        const onFocus = vi.spyOn(queryClient.getQueryCache(), "onFocus")
        refocus()
        await new Promise((resolve) => setTimeout(resolve, 50))
        expect(onFocus).not.toHaveBeenCalled()
      }
    )

    it("finishes the fetch of a tree discarded while suspended, then stops listening", async () => {
      // Nothing ever commits here, so only the fetch settling can release the
      // mount. It resumes on reconnect, as it would under a mounted
      // QueryClientProvider, and the data is cached for the next render.
      const query = createSuspenseQuery(reactor, {
        functionName: "greet",
        args: ["ivan"],
      })
      const Greeting = () => <p>{query.useSuspenseQuery().data}</p>
      onlineManager.setOnline(false)
      const view = render(
        <Suspense fallback={<p>loading</p>}>
          <Greeting />
        </Suspense>
      )
      await waitFor(() => expect(fetchStatus()).toBe("paused"))
      view.unmount()

      act(() => onlineManager.setOnline(true))
      await waitFor(() => expect(query.getCacheData()).toBe("hello ivan #1"))

      const onFocus = vi.spyOn(queryClient.getQueryCache(), "onFocus")
      refocus()
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(onFocus).not.toHaveBeenCalled()
    })
  })
})
