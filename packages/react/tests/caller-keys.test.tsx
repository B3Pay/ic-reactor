/**
 * Query keys follow the caller React renders with (#813).
 *
 * A server render has no session: it prefetches and renders as the anonymous
 * principal, and `useAuth()` honours that with an anonymous server snapshot.
 * The keys `useClient()` builds honour it too: it follows the client's caller
 * with `useSyncExternalStore` and the same anonymous server snapshot. An
 * `AuthClient` reads a stored session synchronously, so for a visitor who
 * signed in on an earlier visit the client's live caller is already the user
 * while the page hydrates; keys built from it would miss the data the server
 * dehydrated, render other markup than the server's HTML, and send every
 * prefetched read again.
 *
 * React moves a hydrated component on to the live caller itself, with the
 * synchronous update `useSyncExternalStore` makes after hydrating when the
 * snapshot differs from the server's. Two consequences are accepted and
 * pinned here: a Suspense boundary still dehydrated below a component that
 * moves is rendered on the client (L1), and a read the hydrating render built
 * may run once and be cancelled before anything is sent (L2).
 *
 * Every client here is a `createTestClient()` over an in-memory replica whose
 * one canister answers with the caller it saw, so a test reads from its log
 * who sent what, and from the page whose answer it shows.
 */
import { c } from "@candid-core/schema"
import { createClient, isReactorError, type Client } from "@ic-reactor/core"
import { createTestClient } from "@ic-reactor/core/testing"
import {
  HydrationBoundary,
  dehydrate,
  skipToken,
  useQuery,
  useSuspenseQuery,
  type DehydratedState,
} from "@tanstack/react-query"
import { act, render, screen, waitFor } from "@testing-library/react"
import {
  Component,
  StrictMode,
  Suspense,
  lazy,
  startTransition,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  version,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from "react"
import { hydrateRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ReactorProvider, useAuth, useClient } from "../src/index.js"
import { macrotask, testAuth } from "./helpers.js"

const ANONYMOUS = "2vxsx-fae"
const CANISTER = "rdmx6-jaaaa-aaaaa-aaadq-cai"
const REACT_18 = Number(version.split(".")[0]) < 19

/** One query that answers with who called it. */
const WHO = c.service({ whoami: c.func([], [c.text], "query") })
type Who = { whoami: () => Promise<string> }

/**
 * A test client and its replica. Signed in as the identity of `seed` unless
 * `signedIn` is `false`, as a server's client and a first visit are.
 */
function replica(options: { seed?: number; signedIn?: boolean } = {}) {
  const test = createTestClient({
    identity: options.seed ?? 7,
    signedIn: options.signedIn ?? true,
  })
  test.mock<Who>(WHO, CANISTER, {
    whoami: ({ caller }) => `read by ${caller}`,
  })
  tests.push(test)
  return test
}
type Replica = ReturnType<typeof replica>

/** The callers of every `whoami` the replica answered, in order. */
const whoamiCallers = (test: Replica): (string | undefined)[] =>
  test.requests
    .filter(({ methodName }) => methodName === "whoami")
    .map(({ caller }) => caller)

/**
 * A read's options as `useSuspenseQuery` types them: its `queryFn` may not be
 * `skipToken`, which a read built with its arguments never is.
 */
const suspense = <T extends { queryFn?: unknown }>(options: T) =>
  options as T & { queryFn: Exclude<T["queryFn"], typeof skipToken> }

const tests: ReturnType<typeof createTestClient>[] = []
/** Clients a test made with `createClient`, disposed after it. */
const made: Client[] = []
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
  for (const test of tests.splice(0)) test.client.dispose()
  for (const client of made.splice(0)) client.dispose()
  vi.restoreAllMocks()
})

/** A component that reads with `useClient()` alone: no `useAuth()`. */
function Reader() {
  const client = useClient()
  const who = client.canister<Who>(WHO, { id: CANISTER })
  const read = useQuery(client.queryOptions(who, "whoami"))
  return <main>{read.isError ? "ERROR" : (read.data ?? "loading")}</main>
}

/** The root's own `useAuth()`, which moves on to the session after hydrating. */
function Header() {
  const { status } = useAuth()
  return <header>{status}</header>
}

/** The page: a header at the root, and the reader below a Suspense boundary. */
function page(
  client: Client,
  state: DehydratedState,
  Late: ComponentType
): ReactElement {
  return (
    <ReactorProvider client={() => client}>
      <Header />
      <HydrationBoundary state={state}>
        <Suspense fallback={<p>loading</p>}>
          <Late />
        </Suspense>
      </HydrationBoundary>
    </ReactorProvider>
  )
}

/**
 * What a server sends: it prefetches as nobody, dehydrates, and renders the
 * page to HTML with that client. The state crosses as JSON, as it does in an
 * app.
 */
async function serverRender() {
  const server = replica({ signedIn: false })
  const who = server.client.canister<Who>(WHO, { id: CANISTER })
  await server.client.queryClient.prefetchQuery(
    server.client.queryOptions(who, "whoami")
  )
  const json = JSON.stringify(dehydrate(server.client.queryClient))
  const html = renderToString(page(server.client, JSON.parse(json), Reader))
  return { server, json, html }
}

/**
 * Hydrates `container` with `element`, returning what React reported: the
 * messages of its recoverable errors, the errors themselves, and its console.
 */
async function hydrate(element: ReactElement) {
  const recoverable: string[] = []
  const reported: unknown[] = []
  const logged = vi.spyOn(console, "error").mockImplementation(() => {})
  await act(async () => {
    root = hydrateRoot(container, element, {
      onRecoverableError: (error) => {
        reported.push(error)
        recoverable.push(String((error as Error).message))
      },
    })
  })
  await act(macrotask)
  return { recoverable, reported, logged }
}

/** Every `innerHTML` of `container` that a commit left, in order. */
function watchCommits() {
  const commits: string[] = []
  const watcher = new MutationObserver(() => commits.push(container.innerHTML))
  watcher.observe(container, {
    subtree: true,
    childList: true,
    characterData: true,
  })
  return { commits, stop: () => watcher.disconnect() }
}

/** Every error a query of `client` went into, in order. */
function watchErrors(client: Client) {
  const errors: unknown[] = []
  const stop = client.queryClient.getQueryCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "error") {
      errors.push(event.action.error)
    }
  })
  return { errors, stop }
}

/** A lazy component whose chunk arrives when the test calls `deliver`. */
function lateChunk(Content: ComponentType) {
  let deliver!: () => void
  const Late = lazy(
    () =>
      new Promise<{ default: ComponentType }>((resolve) => {
        deliver = () => resolve({ default: Content })
      })
  )
  return { Late, deliver: () => deliver() }
}

/**
 * The server's HTML of a boundary rewritten the way a stream sends it before
 * its content: pending, with the fallback in its place. React waits for the
 * stream while the document is still loading, which `loading()` makes it.
 */
function streamed(html: string, content: string) {
  const pending = html.replace(
    `<!--$-->${content}<!--/$-->`,
    '<!--$?--><template id="B:0"></template><p>fallback</p><!--/$-->'
  )
  expect(pending).not.toBe(html)
  return pending
}
async function whileLoading(run: () => Promise<void>) {
  Object.defineProperty(document, "readyState", {
    configurable: true,
    get: () => "loading",
  })
  try {
    await run()
  } finally {
    delete (document as unknown as { readyState?: string }).readyState
  }
}

describe("hydrating with a stored session", () => {
  it.each([
    ["", (page: ReactElement) => page],
    [
      " under StrictMode",
      (page: ReactElement) => <StrictMode>{page}</StrictMode>,
    ],
  ])(
    "renders the server's keys, sends nothing during hydration, then reads once as the user%s",
    async (_, wrap) => {
      const { server, json, html } = await serverRender()
      expect(html).toContain(`read by ${ANONYMOUS}`)
      expect(whoamiCallers(server)).toEqual([ANONYMOUS])
      container.innerHTML = html
      const served = container.querySelector("main")

      const browser = replica({ seed: 7 })
      const user = browser.auth.getPrincipal()?.toText()
      expect(browser.client.caller()).toBe(user)
      const commits = watchCommits()
      const { recoverable, logged } = await hydrate(
        wrap(page(browser.client, JSON.parse(json), Reader))
      )

      // The first render matched the server's HTML: React kept its nodes and
      // reported nothing.
      expect(recoverable).toEqual([])
      expect(logged).not.toHaveBeenCalled()
      // Right after hydration the reader renders the user's keys, and reads
      // them once, as the user. The anonymous read the server made is not sent
      // again, and its answer is never shown as the user's.
      await waitFor(() =>
        expect(container.querySelector("main")?.textContent).toBe(
          `read by ${user}`
        )
      )
      commits.stop()
      expect(container.querySelector("main")).toBe(served)
      expect(whoamiCallers(browser)).toEqual([user])
      expect(container.querySelector("header")?.textContent).toBe("signed-in")
      expect(commits.commits.filter((html) => html.includes("ERROR"))).toEqual(
        []
      )
    }
  )

  it("hydrates a provider given a spread copy of the client as one given the client", async () => {
    const { json, html } = await serverRender()
    container.innerHTML = html
    const served = container.querySelector("main")
    const browser = replica({ seed: 7 })
    const user = browser.auth.getPrincipal()?.toText()
    // A structural copy, as a test's double of a client often is.
    const copy: Client = { ...browser.client }

    const { recoverable, logged } = await hydrate(
      page(copy, JSON.parse(json), Reader)
    )

    expect(recoverable).toEqual([])
    expect(logged).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(container.querySelector("main")?.textContent).toBe(
        `read by ${user}`
      )
    )
    expect(container.querySelector("main")).toBe(served)
    expect(whoamiCallers(browser)).toEqual([user])
  })

  it("hydrates a late boundary below no component that renders with the caller from the server's keys, then moves it to the user", async () => {
    const { json, html } = await serverRender()
    container.innerHTML = html
    const served = container.querySelector("main")

    const { Late, deliver } = lateChunk(Reader)
    const browser = replica({ seed: 7 })
    const user = browser.auth.getPrincipal()?.toText()
    const { recoverable, logged } = await hydrate(
      page(browser.client, JSON.parse(json), Late)
    )
    // The root hydrated and its header moved on to the session; the boundary
    // is still the server's.
    expect(container.querySelector("header")?.textContent).toBe("signed-in")
    expect(container.querySelector("main")?.textContent).toBe(
      `read by ${ANONYMOUS}`
    )

    await act(async () => deliver())
    await act(macrotask)

    expect(recoverable).toEqual([])
    expect(logged).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(container.querySelector("main")?.textContent).toBe(
        `read by ${user}`
      )
    )
    expect(container.querySelector("main")).toBe(served)
    expect(whoamiCallers(browser)).toEqual([user])
  })

  it.each([
    ["a read the server did not prefetch (isLoading)", false],
    ["a stale read the server prefetched (isFetching)", true],
  ] as const)(
    "hydrates a component that renders the fetch state of %s, then loads the user's read",
    async (_, prefetched) => {
      function Status() {
        const client = useClient()
        const who = client.canister<Who>(WHO, { id: CANISTER })
        const read = useQuery(client.queryOptions(who, "whoami"))
        return (
          <main>
            {`${read.isLoading ? "loading" : "settled"}|${
              read.isFetching ? "fetching" : "idle"
            }|${read.fetchStatus}|${read.data ?? "none"}`}
          </main>
        )
      }
      const tree = (client: Client, state: DehydratedState) => (
        <ReactorProvider client={() => client}>
          <HydrationBoundary state={state}>
            <Status />
          </HydrationBoundary>
        </ReactorProvider>
      )
      const server = replica({ signedIn: false })
      if (prefetched) {
        const serverWho = server.client.canister<Who>(WHO, { id: CANISTER })
        await server.client.queryClient.prefetchQuery(
          server.client.queryOptions(serverWho, "whoami")
        )
      }
      const json = JSON.stringify(dehydrate(server.client.queryClient))
      container.innerHTML = renderToString(
        tree(server.client, JSON.parse(json))
      )
      const served = container.querySelector("main")

      const browser = replica({ seed: 7 })
      const user = browser.auth.getPrincipal()?.toText()
      const { recoverable, logged } = await hydrate(
        tree(browser.client, JSON.parse(json))
      )

      expect(recoverable).toEqual([])
      expect(logged).not.toHaveBeenCalled()
      await waitFor(() =>
        expect(container.querySelector("main")?.textContent).toBe(
          `settled|idle|idle|read by ${user}`
        )
      )
      expect(container.querySelector("main")).toBe(served)
      expect(whoamiCallers(browser)).toEqual([user])
    }
  )
})

describe("useClient()", () => {
  it("renders a component that uses only it again on sign-in, switch and sign-out, with the new caller's keys", async () => {
    const test = replica({ seed: 1, signedIn: false })
    const renders: string[] = []
    function Keys() {
      const client = useClient()
      const who = client.canister<Who>(WHO, { id: CANISTER })
      const key = client.queryKey(who, "whoami")
      renders.push(String(key[2]))
      const read = useQuery(client.queryOptions(who, "whoami"))
      return (
        <p data-testid="keys" data-caller={String(key[2])}>
          {read.data ?? "loading"}
        </p>
      )
    }
    render(
      <ReactorProvider client={() => test.client}>
        <Keys />
      </ReactorProvider>
    )
    const shown = () => screen.getByTestId("keys")
    await waitFor(() =>
      expect(shown().textContent).toBe(`read by ${ANONYMOUS}`)
    )

    // Each change comes from the auth, not from this tree: nothing else
    // renders the component again.
    await act(async () => {
      await test.auth.signIn(1)
    })
    const first = test.auth.getPrincipal()?.toText()
    expect(shown().dataset.caller).toBe(first)
    await waitFor(() => expect(shown().textContent).toBe(`read by ${first}`))

    act(() => {
      test.auth.switchTo(2)
    })
    const second = test.auth.getPrincipal()?.toText()
    expect(second).not.toBe(first)
    expect(shown().dataset.caller).toBe(second)
    await waitFor(() => expect(shown().textContent).toBe(`read by ${second}`))

    await act(async () => {
      await test.auth.signOut()
    })
    expect(shown().dataset.caller).toBe(ANONYMOUS)
    expect(shown().textContent).toBe(`read by ${ANONYMOUS}`)
    await waitFor(() => expect(whoamiCallers(test)).toHaveLength(4))

    // Every read was sent as the caller whose key it fills: the anonymous key
    // read again on its return, as it is stale.
    expect(whoamiCallers(test)).toEqual([ANONYMOUS, first, second, ANONYMOUS])
    // The component rendered with each caller's keys, in turn.
    const callers = renders.filter((key, at) => key !== renders[at - 1])
    expect(callers).toEqual([ANONYMOUS, first, second, ANONYMOUS])
  })

  it("returns the provider's client object itself once the caller React renders is the live one", async () => {
    const test = replica({ seed: 1 })
    const seen: Client[] = []
    function Probe() {
      seen.push(useClient())
      return <p data-testid="status">{useAuth().status}</p>
    }
    render(
      <ReactorProvider client={() => test.client}>
        <Probe />
      </ReactorProvider>
    )
    await act(async () => {
      await test.auth.signOut()
    })
    act(() => {
      test.auth.switchTo(3)
    })

    expect(screen.getByTestId("status").textContent).toBe("signed-in")
    expect(seen.length).toBeGreaterThanOrEqual(3)
    for (const client of seen) expect(client).toBe(test.client)
  })

  it("returns the client itself after a hydration, and a view of it only for the hydrating render", async () => {
    const { json, html } = await serverRender()
    container.innerHTML = html
    const browser = replica({ seed: 7 })
    const seen: Client[] = []
    function Probe() {
      const client = useClient()
      seen.push(client)
      return <Reader />
    }

    await hydrate(page(browser.client, JSON.parse(json), Probe))

    expect(seen).toHaveLength(2)
    const [hydrating] = seen
    // The hydrating render's view: the server's caller, the client's own
    // cache, canisters and writes.
    expect(hydrating).not.toBe(browser.client)
    expect(hydrating?.caller()).toBe(ANONYMOUS)
    expect(hydrating?.authState()).toEqual({
      status: "anonymous",
      principal: ANONYMOUS,
    })
    expect(hydrating?.queryClient).toBe(browser.client.queryClient)
    expect(hydrating?.canister).toBe(browser.client.canister)
    expect(hydrating?.mutationOptions).toBe(browser.client.mutationOptions)
    expect(hydrating?.subscribe).toBe(browser.client.subscribe)
    expect(seen[1]).toBe(browser.client)
  })

  it("reads as nobody when the caller turns anonymous before the hydrating render's effects", async () => {
    function Nav() {
      const client = useClient()
      const who = client.canister<Who>(WHO, { id: CANISTER })
      const read = useQuery(client.queryOptions(who, "whoami"))
      return <main>{read.isError ? "ERROR" : (read.data ?? "loading")}</main>
    }
    let expire!: () => void
    function Expire() {
      useLayoutEffect(() => expire(), [])
      return null
    }
    const tree = (client: Client) => (
      <ReactorProvider client={() => client}>
        <Nav />
        <Expire />
      </ReactorProvider>
    )
    const server = replica({ signedIn: false })
    expire = () => {}
    container.innerHTML = renderToString(tree(server.client))
    const browser = replica({ seed: 7 })
    expire = () => browser.auth.expire()

    const { recoverable } = await hydrate(tree(browser.client))

    expect(recoverable).toEqual([])
    await waitFor(() =>
      expect(container.querySelector("main")?.textContent).toBe(
        `read by ${ANONYMOUS}`
      )
    )
    expect(whoamiCallers(browser)).toEqual([ANONYMOUS])
  })

  // N2, documented misuse: the guides say to read useClient() in render, and
  // pin what keeping its hydrating value does, so that a change to it shows.
  it("leaves a value kept from the hydrating render (state, ref, module variable) the anonymous view for good", async () => {
    let module: Client | undefined
    const kept: Client[] = []
    function Keeper() {
      const client = useClient()
      const [state] = useState(client)
      const ref = useRef(client)
      module ??= client
      kept.splice(0, 3, state, ref.current, module)
      const who = state.canister<Who>(WHO, { id: CANISTER })
      const read = useQuery(state.queryOptions(who, "whoami"))
      return (
        <main data-live={client.caller()} data-kept={state.caller()}>
          {read.isError ? "ERROR" : (read.data ?? "loading")}
        </main>
      )
    }
    const tree = (client: Client, state: DehydratedState) => (
      <ReactorProvider client={() => client}>
        <HydrationBoundary state={state}>
          <Keeper />
        </HydrationBoundary>
      </ReactorProvider>
    )
    const server = replica({ signedIn: false })
    const serverWho = server.client.canister<Who>(WHO, { id: CANISTER })
    await server.client.queryClient.prefetchQuery(
      server.client.queryOptions(serverWho, "whoami")
    )
    const json = JSON.stringify(dehydrate(server.client.queryClient))
    container.innerHTML = renderToString(tree(server.client, JSON.parse(json)))
    module = undefined
    const browser = replica({ seed: 7 })
    const user = browser.auth.getPrincipal()?.toText()

    const { recoverable } = await hydrate(
      tree(browser.client, JSON.parse(json))
    )
    for (let tick = 0; tick < 3; tick++) await act(macrotask)

    expect(recoverable).toEqual([])
    const shown = () => container.querySelector("main")
    // The component rendered again with the client, for the user, but what
    // it kept is the hydrating render's view, and shows the server's data.
    expect(shown()?.dataset.live).toBe(user)
    expect(shown()?.dataset.kept).toBe(ANONYMOUS)
    expect(shown()?.textContent).toBe(`read by ${ANONYMOUS}`)
    expect(kept).toHaveLength(3)
    const who = browser.client.canister<Who>(WHO, { id: CANISTER })
    for (const value of kept) {
      expect(value).not.toBe(browser.client)
      expect(value.caller()).toBe(ANONYMOUS)
      expect(value.queryKey(who, "whoami")).toContain(ANONYMOUS)
    }
    // A read it starts while the user is signed in is cancelled, and sends
    // nothing as anyone.
    await act(() => browser.client.queryClient.invalidateQueries())
    for (let tick = 0; tick < 3; tick++) await act(macrotask)
    expect(shown()?.textContent).toBe(`read by ${ANONYMOUS}`)
    expect(whoamiCallers(browser)).toEqual([])
  })

  it.each([false, true])(
    "hands a nested ReactorProvider given it the client itself, which reads as the user after a signed-in reload and follows a sign-out and a sign-in (StrictMode: %s)",
    async (strict) => {
      const seen: Client[] = []
      function Inner() {
        const client = useClient()
        seen.push(client)
        const who = client.canister<Who>(WHO, { id: CANISTER })
        const read = useQuery(client.queryOptions(who, "whoami"))
        return (
          <main data-caller={client.caller()}>
            {read.isError ? "ERROR" : (read.data ?? "loading")}
          </main>
        )
      }
      // The hydrating render's useClient() is the anonymous view: the nested
      // provider must hold the client it was made over, not the view.
      function Outer() {
        const client = useClient()
        return (
          <ReactorProvider client={() => client}>
            <Inner />
          </ReactorProvider>
        )
      }
      const tree = (client: Client, state: DehydratedState) => {
        const element = (
          <ReactorProvider client={() => client}>
            <HydrationBoundary state={state}>
              <Outer />
            </HydrationBoundary>
          </ReactorProvider>
        )
        return strict ? <StrictMode>{element}</StrictMode> : element
      }
      const server = replica({ signedIn: false })
      const serverWho = server.client.canister<Who>(WHO, { id: CANISTER })
      await server.client.queryClient.prefetchQuery(
        server.client.queryOptions(serverWho, "whoami")
      )
      const json = JSON.stringify(dehydrate(server.client.queryClient))
      container.innerHTML = renderToString(
        tree(server.client, JSON.parse(json))
      )
      const browser = replica({ seed: 7 })
      const user = browser.auth.getPrincipal()?.toText()
      const shown = () => container.querySelector("main")
      const commits = watchCommits()
      try {
        const { recoverable } = await hydrate(
          tree(browser.client, JSON.parse(json))
        )
        expect(recoverable).toEqual([])
        await waitFor(() =>
          expect(shown()?.textContent).toBe(`read by ${user}`)
        )
        expect(shown()?.dataset.caller).toBe(user)
        for (let tick = 0; tick < 3; tick++) await act(macrotask)
        // StrictMode mounts the reader twice, and each mount may read.
        expect(new Set(whoamiCallers(browser))).toEqual(new Set([user]))
        // The nested provider's tree, past its hydrating render, is on the
        // outer provider's client itself.
        expect(seen[seen.length - 1]).toBe(browser.client)

        await act(async () => {
          await browser.auth.signOut()
        })
        await waitFor(() =>
          expect(shown()?.textContent).toBe(`read by ${ANONYMOUS}`)
        )
        expect(shown()?.dataset.caller).toBe(ANONYMOUS)

        await act(async () => {
          await browser.auth.signIn(3)
        })
        const next = browser.auth.getPrincipal()?.toText()
        expect(next).not.toBe(user)
        await waitFor(() =>
          expect(shown()?.textContent).toBe(`read by ${next}`)
        )
        expect(shown()?.dataset.caller).toBe(next)
        expect(
          commits.commits.filter((html) => html.includes("ERROR"))
        ).toEqual([])
      } finally {
        commits.stop()
      }
    }
  )
})

/**
 * L1: on a signed-in reload, a Suspense boundary that is still dehydrated
 * below a component that renders with the caller is rendered on the client
 * when that component moves on to the session.
 */
describe("a Suspense boundary still dehydrated below a component that renders with the caller", () => {
  /** The boundary's content: what the server rendered, and the lazy chunk. */
  function Content() {
    return <article>from the server</article>
  }

  /** A nav bar that holds the client for an action, and shows whose keys it would build. */
  function ActionNav({ Late }: { Late: ComponentType }) {
    const client = useClient()
    return (
      <nav data-caller={client.caller()}>
        <button onClick={() => void client.signIn()}>sign in</button>
        <Suspense fallback={<p>fallback</p>}>
          <Late />
        </Suspense>
      </nav>
    )
  }

  /** The same, following the session as a header does. */
  function StatusNav({ Late }: { Late: ComponentType }) {
    const { principal } = useAuth()
    return (
      <nav data-caller={principal}>
        <Suspense fallback={<p>fallback</p>}>
          <Late />
        </Suspense>
      </nav>
    )
  }

  /** The same, reading with the client, and showing an error if its read fails. */
  function ReadingNav({ Late }: { Late: ComponentType }) {
    const client = useClient()
    const who = client.canister<Who>(WHO, { id: CANISTER })
    const read = useQuery(client.queryOptions(who, "whoami"))
    return (
      <nav data-caller={client.caller()}>
        <b>{read.isError ? "ERROR" : (read.data ?? "loading")}</b>
        <Suspense fallback={<p>fallback</p>}>
          <Late />
        </Suspense>
      </nav>
    )
  }

  const tree = (
    client: Client,
    state: DehydratedState,
    Nav: ComponentType<{ Late: ComponentType }>,
    Late: ComponentType
  ) => (
    <ReactorProvider client={() => client}>
      <HydrationBoundary state={state}>
        <Nav Late={Late} />
      </HydrationBoundary>
    </ReactorProvider>
  )

  it.each([
    ["useClient()", ActionNav, false],
    ["useAuth()", StatusNav, false],
    ["useClient() and reads", ReadingNav, false],
    ["useClient() and reads, under StrictMode", ReadingNav, true],
  ] as const)(
    "is rendered on the client when the parent that calls %s moves on, with the user's data and nothing sent as anyone else",
    async (_, Nav, strict) => {
      const server = replica({ signedIn: false })
      const serverWho = server.client.canister<Who>(WHO, { id: CANISTER })
      await server.client.queryClient.prefetchQuery(
        server.client.queryOptions(serverWho, "whoami")
      )
      const json = JSON.stringify(dehydrate(server.client.queryClient))
      const wrap = (element: ReactElement) =>
        strict ? <StrictMode>{element}</StrictMode> : element
      container.innerHTML = renderToString(
        wrap(tree(server.client, JSON.parse(json), Nav, Content))
      )
      const served = container.querySelector("article")
      expect(served?.textContent).toBe("from the server")
      // Stale, so that mounting the parent's read fetches it again.
      const state = JSON.parse(json) as DehydratedState
      for (const query of state.queries) query.state.dataUpdatedAt = 1

      const { Late, deliver } = lateChunk(Content)
      const browser = replica({ seed: 7 })
      const user = browser.auth.getPrincipal()?.toText()
      const errors = watchErrors(browser.client)
      const commits = watchCommits()
      try {
        const { recoverable, logged } = await hydrate(
          wrap(tree(browser.client, state, Nav, Late))
        )

        // The parent moved on to the session right after hydrating, and that
        // update reached the boundary while its chunk was still loading:
        // React rendered it on the client, so it shows its fallback. React 18
        // reports it; React 19 does not.
        expect(container.querySelector("nav")?.dataset.caller).toBe(user)
        expect(container.querySelector("p")?.textContent).toBe("fallback")
        expect(served?.isConnected).toBe(false)
        if (REACT_18) expect(recoverable.length).toBeGreaterThan(0)
        else expect(recoverable).toEqual([])
        expect(logged).not.toHaveBeenCalled()

        await act(async () => deliver())
        await act(macrotask)
        expect(container.querySelector("article")?.textContent).toBe(
          "from the server"
        )
        if (Nav === ReadingNav) {
          await waitFor(() =>
            expect(container.querySelector("b")?.textContent).toBe(
              `read by ${user}`
            )
          )
        }
        // Its data is still the user's (D20): nothing was sent as anyone
        // else, and the cancelled anonymous read, if it ran, was never shown.
        expect(new Set(whoamiCallers(browser))).toEqual(
          new Set(Nav === ReadingNav ? [user] : [])
        )
        expect(
          commits.commits.filter((html) => html.includes("ERROR"))
        ).toEqual([])
        for (const error of errors.errors) {
          expect(error).toMatchObject({
            kind: "cancelled",
            code: "caller_changed",
          })
        }
      } finally {
        commits.stop()
        errors.stop()
      }
    }
  )

  it.each([
    ["useClient()", ActionNav],
    ["useAuth()", StatusNav],
    ["useClient() and reads", ReadingNav],
  ] as const)(
    "renders a streamed boundary on the client when the parent that calls %s moves on, on React 18 too",
    async (_, Nav) => {
      const server = replica({ signedIn: false })
      const serverWho = server.client.canister<Who>(WHO, { id: CANISTER })
      await server.client.queryClient.prefetchQuery(
        server.client.queryOptions(serverWho, "whoami")
      )
      const json = JSON.stringify(dehydrate(server.client.queryClient))
      container.innerHTML = streamed(
        renderToString(tree(server.client, JSON.parse(json), Nav, Content)),
        "<article>from the server</article>"
      )
      await whileLoading(async () => {
        const browser = replica({ seed: 7 })
        const user = browser.auth.getPrincipal()?.toText()
        const { recoverable, logged } = await hydrate(
          tree(browser.client, JSON.parse(json), Nav, Content)
        )
        await act(macrotask)

        // The move is a synchronous update, and it reached the boundary
        // before its HTML arrived: React rendered it on the client, and React
        // 18 reports that.
        expect(container.querySelector("nav")?.dataset.caller).toBe(user)
        expect(container.querySelector("template")).toBeNull()
        expect(container.querySelector("article")?.textContent).toBe(
          "from the server"
        )
        if (REACT_18) expect(recoverable.length).toBeGreaterThan(0)
        else expect(recoverable).toEqual([])
        expect(logged).not.toHaveBeenCalled()
      })
    }
  )

  it.each([
    ["whose stored session expired", "expired"],
    ["whose session is signed in elsewhere", "elsewhere"],
  ] as const)(
    "is rendered on the client when a useAuth() parent shows its status after hydrating, in a tab %s",
    async (_, kind) => {
      // The caller stays anonymous in such a tab, but the status differs from
      // the server's, so the parent moves on as on a signed-in reload.
      function StatusOnlyNav({ Late }: { Late: ComponentType }) {
        const { status } = useAuth()
        return (
          <nav data-status={status}>
            <Suspense fallback={<p>fallback</p>}>
              <Late />
            </Suspense>
          </nav>
        )
      }
      const empty: DehydratedState = { mutations: [], queries: [] }
      const { server, browser } = await steadyTab(kind)
      container.innerHTML = renderToString(
        tree(server, empty, StatusOnlyNav, Content)
      )
      const served = container.querySelector("article")
      expect(served?.textContent).toBe("from the server")

      const { Late, deliver } = lateChunk(Content)
      const { recoverable, logged } = await hydrate(
        tree(browser, empty, StatusOnlyNav, Late)
      )

      expect(container.querySelector("nav")?.dataset.status).toBe(
        ownStatus[kind]
      )
      expect(container.querySelector("p")?.textContent).toBe("fallback")
      expect(served?.isConnected).toBe(false)
      if (REACT_18) expect(recoverable.length).toBeGreaterThan(0)
      else expect(recoverable).toEqual([])
      expect(logged).not.toHaveBeenCalled()

      await act(async () => deliver())
      await act(macrotask)
      expect(container.querySelector("article")?.textContent).toBe(
        "from the server"
      )
    }
  )

  it("keeps the server's HTML when it is passed as children to the component that moves on", async () => {
    function Nav({ children }: { children: ReactNode }) {
      const client = useClient()
      return <nav data-caller={client.caller()}>{children}</nav>
    }
    const tree = (client: Client, Late: ComponentType) => (
      <ReactorProvider client={() => client}>
        <Nav>
          <Suspense fallback={<p>fallback</p>}>
            <Late />
          </Suspense>
        </Nav>
      </ReactorProvider>
    )
    const server = replica({ signedIn: false })
    container.innerHTML = renderToString(tree(server.client, Content))
    const served = container.querySelector("article")
    const { Late, deliver } = lateChunk(Content)
    const browser = replica({ seed: 7 })

    const { recoverable } = await hydrate(tree(browser.client, Late))

    expect(container.querySelector("nav")?.dataset.caller).toBe(
      browser.auth.getPrincipal()?.toText()
    )
    expect(container.querySelector("article")).toBe(served)
    expect(container.querySelector("p")).toBeNull()
    await act(async () => deliver())
    await act(macrotask)
    expect(container.querySelector("article")).toBe(served)
    expect(recoverable).toEqual([])
  })

  it("keeps a streamed boundary pending when it is passed as children to the component that moves on", async () => {
    function Nav({ children }: { children: ReactNode }) {
      const client = useClient()
      return <nav data-caller={client.caller()}>{children}</nav>
    }
    const tree = (client: Client) => (
      <ReactorProvider client={() => client}>
        <Nav>
          <Suspense fallback={<p>fallback</p>}>
            <Content />
          </Suspense>
        </Nav>
      </ReactorProvider>
    )
    const server = replica({ signedIn: false })
    container.innerHTML = streamed(
      renderToString(tree(server.client)),
      "<article>from the server</article>"
    )
    await whileLoading(async () => {
      const browser = replica({ seed: 7 })
      const { recoverable } = await hydrate(tree(browser.client))
      await act(macrotask)

      // The nav moved on to the session; the boundary still waits for the
      // stream.
      expect(container.querySelector("nav")?.dataset.caller).toBe(
        browser.auth.getPrincipal()?.toText()
      )
      expect(recoverable).toEqual([])
      expect(container.querySelector("template")).not.toBeNull()
      expect(container.querySelector("article")).toBeNull()
    })
  })

  // The `em` assertion can only fail on React 18, which verify:peer-floors
  // runs: React 19 commits an unrelated transition even while another one is
  // held, so it passes there with or without a held transition, and
  // verify:faults (React 19 only) cannot verify it. Checked by hand on 18.0
  // with the first attempt's held settle transition put back.
  it("holds no transition: an unrelated one commits at once while the chunk loads", async () => {
    let bump!: () => void
    function Counter() {
      const [count, setCount] = useState(0)
      bump = () => startTransition(() => setCount(1))
      return <em>{count}</em>
    }
    const pageWith = (client: Client, Late: ComponentType) => (
      <ReactorProvider client={() => client}>
        <ActionNav Late={Late} />
        <Counter />
      </ReactorProvider>
    )
    const server = replica({ signedIn: false })
    container.innerHTML = renderToString(pageWith(server.client, Content))
    const { Late, deliver } = lateChunk(Content)
    const browser = replica({ seed: 7 })
    await hydrate(pageWith(browser.client, Late))

    await act(async () => bump())
    await act(macrotask)
    expect(container.querySelector("em")?.textContent).toBe("1")

    await act(async () => deliver())
    await act(macrotask)
    expect(container.querySelector("article")?.textContent).toBe(
      "from the server"
    )
    expect(container.querySelector("nav")?.dataset.caller).toBe(
      browser.auth.getPrincipal()?.toText()
    )
  })

  it.each([
    ["with the server's data", true],
    ["without the server's data", false],
  ] as const)(
    "lets a late child that reads the parent's key with useSuspenseQuery settle as the user: %s",
    async (_, dehydrated) => {
      const seen: (string | undefined)[] = []
      function Nav({ Late }: { Late: ComponentType }) {
        const client = useClient()
        const who = client.canister<Who>(WHO, { id: CANISTER })
        const read = useQuery(client.queryOptions(who, "whoami"))
        seen.push(read.data)
        return (
          <nav>
            <b>{read.isError ? "ERROR" : "nav"}</b>
            <Suspense fallback={<p>fallback</p>}>
              <Late />
            </Suspense>
          </nav>
        )
      }
      let clicks = 0
      function Child() {
        const client = useClient()
        const who = client.canister<Who>(WHO, { id: CANISTER })
        const read = useSuspenseQuery(
          suspense(client.queryOptions(who, "whoami"))
        )
        return <article onClick={() => clicks++}>{read.data}</article>
      }
      const server = replica({ signedIn: false })
      const serverWho = server.client.canister<Who>(WHO, { id: CANISTER })
      await server.client.queryClient.prefetchQuery(
        server.client.queryOptions(serverWho, "whoami")
      )
      // The server rendered the read either way; it sent its state or not.
      const json = JSON.stringify(
        dehydrated
          ? dehydrate(server.client.queryClient)
          : { mutations: [], queries: [] }
      )
      container.innerHTML = renderToString(
        tree(server.client, JSON.parse(json), Nav, Child)
      )
      const state = JSON.parse(json) as DehydratedState
      for (const query of state.queries) query.state.dataUpdatedAt = 1
      const { Late, deliver } = lateChunk(Child)
      const browser = replica({ seed: 7 })
      const user = browser.auth.getPrincipal()?.toText()
      const commits = watchCommits()
      try {
        await hydrate(tree(browser.client, state, Nav, Late))
        await act(async () => deliver())
        for (let tick = 0; tick < 5; tick++) await act(macrotask)

        // Nothing waits for anything: the child renders as the user and its
        // handler runs.
        await waitFor(() =>
          expect(container.querySelector("article")?.textContent).toBe(
            `read by ${user}`
          )
        )
        act(() => container.querySelector("article")?.click())
        expect(clicks).toBe(1)
        expect(seen[seen.length - 1]).toBe(`read by ${user}`)
        const fetching = browser.client.queryClient
          .getQueryCache()
          .getAll()
          .filter((query) => query.state.fetchStatus !== "idle")
        expect(fetching).toEqual([])
        expect(
          commits.commits.filter((html) => html.includes("ERROR"))
        ).toEqual([])
        expect(new Set(whoamiCallers(browser))).toEqual(new Set([user]))
      } finally {
        commits.stop()
      }
    }
  )
})

/**
 * L2: a read the hydrating render built for the anonymous caller may run once
 * while the user is current. It is cancelled before anything is sent, and the
 * component has moved on to the user's key by then.
 */
describe("a read built for the caller a hydrating render shows", () => {
  it("is cancelled when an effect of the hydrating render runs it, and sent as the user once the effect runs again", async () => {
    function Prefetch() {
      const client = useClient()
      const who = client.canister<Who>(WHO, { id: CANISTER })
      useEffect(() => {
        void client.queryClient.prefetchQuery(
          client.queryOptions(who, "whoami")
        )
      }, [client, who])
      return <main>page</main>
    }
    const tree = (client: Client) => (
      <ReactorProvider client={() => client}>
        <Prefetch />
      </ReactorProvider>
    )
    const server = replica({ signedIn: false })
    container.innerHTML = renderToString(tree(server.client))
    const browser = replica({ seed: 7 })
    const user = browser.auth.getPrincipal()?.toText()
    const errors = watchErrors(browser.client)

    const { recoverable } = await hydrate(tree(browser.client))
    await waitFor(() => expect(whoamiCallers(browser)).toEqual([user]))
    errors.stop()

    // A listener of the client's QueryCache sees it, as kind "cancelled",
    // and the README's filter drops it, so such a listener reports nothing.
    expect(recoverable).toEqual([])
    expect(errors.errors).toHaveLength(1)
    expect(errors.errors[0]).toMatchObject({
      kind: "cancelled",
      code: "caller_changed",
    })
    expect(
      errors.errors.filter(
        (error) => !(isReactorError(error) && error.kind === "cancelled")
      )
    ).toEqual([])
  })

  it("is never shown as an error by a component that hydrated", async () => {
    // The parent's useSuspenseQuery read is stale, so mounting it fetches it
    // again while the user is current.
    function SuspenseReader() {
      const client = useClient()
      const who = client.canister<Who>(WHO, { id: CANISTER })
      const read = useSuspenseQuery(
        suspense(client.queryOptions(who, "whoami"))
      )
      return <main>{read.isError ? "ERROR" : read.data}</main>
    }
    const server = replica({ signedIn: false })
    const serverWho = server.client.canister<Who>(WHO, { id: CANISTER })
    await server.client.queryClient.prefetchQuery(
      server.client.queryOptions(serverWho, "whoami")
    )
    const json = JSON.stringify(dehydrate(server.client.queryClient))
    container.innerHTML = renderToString(
      page(server.client, JSON.parse(json), SuspenseReader)
    )
    const served = container.querySelector("main")
    const state = JSON.parse(json) as DehydratedState
    for (const query of state.queries) query.state.dataUpdatedAt = 1
    const browser = replica({ seed: 7 })
    const user = browser.auth.getPrincipal()?.toText()
    const commits = watchCommits()
    const errors = watchErrors(browser.client)

    const { recoverable, logged } = await hydrate(
      <StrictMode>{page(browser.client, state, SuspenseReader)}</StrictMode>
    )
    await waitFor(() =>
      expect(container.querySelector("main")?.textContent).toBe(
        `read by ${user}`
      )
    )
    commits.stop()
    errors.stop()

    expect(recoverable).toEqual([])
    expect(logged).not.toHaveBeenCalled()
    expect(container.querySelector("main")).toBe(served)
    expect(commits.commits.filter((html) => html.includes("ERROR"))).toEqual([])
    expect(whoamiCallers(browser)).toEqual([user])
    for (const error of errors.errors) {
      expect(error).toMatchObject({ kind: "cancelled", code: "caller_changed" })
    }
  })
})

/**
 * L2, later: a read the hydrating render built is cancelled while the user is
 * current, and a component that hydrated may still be watching its key when
 * that happens (React hides it, mounted, while the move suspends). The read
 * leaves the key as it found it, so once the caller is anonymous again (a
 * sign-out, a session that expires) the key shows the server's data and is
 * read again as nobody, never the cancelled read as an error.
 */
describe("a key whose read the hydrating render built, once the caller is anonymous again", () => {
  /** A second query, so that a sibling can suspend on a key of its own. */
  const PAIR = c.service({
    whoami: c.func([], [c.text], "query"),
    other: c.func([], [c.text], "query"),
  })
  type Pair = { whoami: () => Promise<string>; other: () => Promise<string> }
  function pairReplica(options: { seed?: number; signedIn?: boolean } = {}) {
    const test = createTestClient({
      identity: options.seed ?? 7,
      signedIn: options.signedIn ?? true,
    })
    test.mock<Pair>(PAIR, CANISTER, {
      whoami: ({ caller }) => `read by ${caller}`,
      other: ({ caller }) => `other by ${caller}`,
    })
    tests.push(test)
    return test
  }

  /** The server's state of every read it prefetched, made stale. */
  async function prefetched(
    server: Replica | ReturnType<typeof pairReplica>,
    methods: readonly ("whoami" | "other")[]
  ) {
    const who = server.client.canister<Pair>(PAIR, { id: CANISTER })
    for (const method of methods) {
      await server.client.queryClient.prefetchQuery(
        server.client.queryOptions(who, method)
      )
    }
    const json = JSON.stringify(dehydrate(server.client.queryClient))
    const stale = JSON.parse(json) as DehydratedState
    for (const query of stale.queries) query.state.dataUpdatedAt = 1
    return { fresh: JSON.parse(json) as DehydratedState, stale }
  }

  const leave = {
    "a sign-out": async (test: Replica) => {
      await act(async () => {
        await test.auth.signOut()
      })
    },
    "an expired session": async (test: Replica) => {
      await act(async () => {
        test.auth.expire()
        await macrotask()
      })
    },
  }

  const anonymousWhoami = (test: Replica) =>
    test.client.queryClient
      .getQueryCache()
      .getAll()
      .find(
        (query) =>
          query.queryKey.includes(ANONYMOUS) &&
          query.queryKey.includes("whoami")
      )

  it.each([
    ["a sign-out", false],
    ["a sign-out", true],
    ["an expired session", false],
    ["an expired session", true],
  ] as const)(
    "is shown by a useSuspenseQuery reader with its data after %s, never as an error (StrictMode: %s)",
    async (how, strict) => {
      function SuspenseReader() {
        const client = useClient()
        const who = client.canister<Pair>(PAIR, { id: CANISTER })
        const read = useSuspenseQuery(
          suspense(client.queryOptions(who, "whoami"))
        )
        return <main>{read.isError ? "ERROR" : read.data}</main>
      }
      const wrap = (element: ReactElement) =>
        strict ? <StrictMode>{element}</StrictMode> : element
      const server = pairReplica({ signedIn: false })
      const { fresh, stale } = await prefetched(server, ["whoami"])
      container.innerHTML = renderToString(
        wrap(page(server.client, fresh, SuspenseReader))
      )
      const browser = pairReplica({ seed: 7 })
      const user = browser.auth.getPrincipal()?.toText()
      const commits = watchCommits()
      try {
        await hydrate(wrap(page(browser.client, stale, SuspenseReader)))
        await waitFor(() =>
          expect(container.querySelector("main")?.textContent).toBe(
            `read by ${user}`
          )
        )
        expect(whoamiCallers(browser)).toEqual([user])

        await leave[how](browser)
        await waitFor(() =>
          expect(whoamiCallers(browser)).toEqual([user, ANONYMOUS])
        )
        for (let tick = 0; tick < 3; tick++) await act(macrotask)

        expect(container.querySelector("main")?.textContent).toBe(
          `read by ${ANONYMOUS}`
        )
        expect(
          commits.commits.filter((html) => html.includes("ERROR"))
        ).toEqual([])
        expect(anonymousWhoami(browser)?.state).toMatchObject({
          status: "success",
          fetchStatus: "idle",
        })
      } finally {
        commits.stop()
      }
    }
  )

  // The rows without data guard an invariant: a reader with no data of the
  // server's has nothing a cancelled read could leave behind.
  it.each([
    ["with the server's data", false, true],
    ["with the server's data", true, true],
    ["without data", false, false],
    ["without data", true, false],
  ] as const)(
    "is shown by a useQuery reader %s whose sibling's suspense read suspends the move, never as an error (StrictMode: %s)",
    async (_, strict, withData) => {
      function Plain() {
        const client = useClient()
        const who = client.canister<Pair>(PAIR, { id: CANISTER })
        const read = useQuery(client.queryOptions(who, "whoami"))
        return <main>{read.isError ? "ERROR" : (read.data ?? "loading")}</main>
      }
      function Sibling() {
        const client = useClient()
        const who = client.canister<Pair>(PAIR, { id: CANISTER })
        const read = useSuspenseQuery(
          suspense(client.queryOptions(who, "other"))
        )
        return <aside>{read.data}</aside>
      }
      const tree = (client: Client, state: DehydratedState) => {
        const element = (
          <ReactorProvider client={() => client}>
            <HydrationBoundary state={state}>
              <Suspense fallback={<p>loading</p>}>
                <Plain />
                <Sibling />
              </Suspense>
            </HydrationBoundary>
          </ReactorProvider>
        )
        return strict ? <StrictMode>{element}</StrictMode> : element
      }
      const server = pairReplica({ signedIn: false })
      const { fresh, stale } = await prefetched(
        server,
        withData ? ["whoami", "other"] : ["other"]
      )
      // Only the reader's data is stale. The sibling's is fresh, and the move
      // suspends on the user's key for it, which has nothing yet.
      const sibling = fresh.queries.find((q) => q.queryKey.includes("other"))
      for (const query of stale.queries) {
        if (query.queryKey.includes("other") && sibling !== undefined) {
          query.state.dataUpdatedAt = sibling.state.dataUpdatedAt
        }
      }
      container.innerHTML = renderToString(tree(server.client, fresh))
      const browser = pairReplica({ seed: 7 })
      const user = browser.auth.getPrincipal()?.toText()
      const commits = watchCommits()
      try {
        await hydrate(tree(browser.client, stale))
        await waitFor(() =>
          expect(container.querySelector("main")?.textContent).toBe(
            `read by ${user}`
          )
        )
        for (let tick = 0; tick < 3; tick++) await act(macrotask)
        // StrictMode mounts the reader twice, and each mount may read.
        expect(new Set(whoamiCallers(browser))).toEqual(new Set([user]))
        const sent = whoamiCallers(browser).length

        await leave["a sign-out"](browser)
        await waitFor(() =>
          expect(whoamiCallers(browser).slice(sent)).toEqual([ANONYMOUS])
        )
        for (let tick = 0; tick < 3; tick++) await act(macrotask)

        expect(container.querySelector("main")?.textContent).toBe(
          `read by ${ANONYMOUS}`
        )
        expect(
          commits.commits.filter((html) => html.includes("ERROR"))
        ).toEqual([])
      } finally {
        commits.stop()
      }
    }
  )

  it("is shown with its data by a reader mounted after a sign-out, when an effect of the hydrating render fetched it", async () => {
    let showReader!: () => void
    function Prefetch() {
      const client = useClient()
      const who = client.canister<Pair>(PAIR, { id: CANISTER })
      const [shown, setShown] = useState(false)
      showReader = () => setShown(true)
      useEffect(() => {
        void client.queryClient.prefetchQuery(
          client.queryOptions(who, "whoami")
        )
      }, [client, who])
      return shown ? <Reader /> : <main>page</main>
    }
    const tree = (client: Client, state: DehydratedState) => (
      <ReactorProvider client={() => client}>
        <HydrationBoundary state={state}>
          <Prefetch />
        </HydrationBoundary>
      </ReactorProvider>
    )
    const server = pairReplica({ signedIn: false })
    const { fresh, stale } = await prefetched(server, ["whoami"])
    container.innerHTML = renderToString(tree(server.client, fresh))
    const browser = pairReplica({ seed: 7 })
    const user = browser.auth.getPrincipal()?.toText()
    await hydrate(tree(browser.client, stale))
    await waitFor(() => expect(whoamiCallers(browser)).toEqual([user]))
    for (let tick = 0; tick < 3; tick++) await act(macrotask)

    expect(whoamiCallers(browser)).toEqual([user])
    await leave["a sign-out"](browser)
    const commits = watchCommits()
    try {
      act(() => showReader())
      await waitFor(() => expect(whoamiCallers(browser)).toContain(ANONYMOUS))
      for (let tick = 0; tick < 3; tick++) await act(macrotask)
      expect(container.querySelector("main")?.textContent).toBe(
        `read by ${ANONYMOUS}`
      )
      expect(commits.commits.filter((html) => html.includes("ERROR"))).toEqual(
        []
      )
    } finally {
      commits.stop()
    }
  })

  it("hands an effect that awaits the hydrating render's fetch the data the key had, not a rejection", async () => {
    const settled: string[] = []
    function Fetch() {
      const client = useClient()
      const who = client.canister<Pair>(PAIR, { id: CANISTER })
      useEffect(() => {
        client.queryClient.fetchQuery(client.queryOptions(who, "whoami")).then(
          (data) => settled.push(`data ${data}`),
          (error: unknown) =>
            settled.push(`error ${(error as { code?: string }).code}`)
        )
      }, [client, who])
      return <main>page</main>
    }
    const tree = (client: Client, state: DehydratedState) => (
      <ReactorProvider client={() => client}>
        <HydrationBoundary state={state}>
          <Fetch />
        </HydrationBoundary>
      </ReactorProvider>
    )
    const server = pairReplica({ signedIn: false })
    const { fresh, stale } = await prefetched(server, ["whoami"])
    container.innerHTML = renderToString(tree(server.client, fresh))
    const browser = pairReplica({ seed: 7 })
    const user = browser.auth.getPrincipal()?.toText()
    const errors = watchErrors(browser.client)
    await hydrate(tree(browser.client, stale))
    await waitFor(() => expect(settled).toHaveLength(2))
    errors.stop()

    // The view's fetch ran first and was cancelled before anything was sent;
    // the client's own, after the move, was sent as the user.
    expect(settled).toEqual([
      `data read by ${ANONYMOUS}`,
      `data read by ${user}`,
    ])
    expect(whoamiCallers(browser)).toEqual([user])
    expect(errors.errors).toEqual([])
    expect(anonymousWhoami(browser)?.state).toMatchObject({
      status: "success",
      fetchStatus: "idle",
    })
  })
})

describe("a suspense read the server did not dehydrate", () => {
  it("is cancelled while the user is current, and its boundary renders on the client as the user, never showing an error", async () => {
    function Read() {
      const client = useClient()
      const who = client.canister<Who>(WHO, { id: CANISTER })
      return (
        <main>
          {useSuspenseQuery(suspense(client.queryOptions(who, "whoami"))).data}
        </main>
      )
    }
    class Catch extends Component<
      { children: ReactNode },
      { failed: boolean }
    > {
      state = { failed: false }
      static getDerivedStateFromError() {
        return { failed: true }
      }
      render() {
        return this.state.failed ? <b>ERROR</b> : this.props.children
      }
    }
    const tree = (client: Client) => (
      <ReactorProvider client={() => client}>
        <Catch>
          <Suspense fallback={<p>loading</p>}>
            <Read />
          </Suspense>
        </Catch>
      </ReactorProvider>
    )
    // The server read the data and rendered it, but sent no state for it.
    const server = replica({ signedIn: false })
    const serverWho = server.client.canister<Who>(WHO, { id: CANISTER })
    await server.client.queryClient.prefetchQuery(
      server.client.queryOptions(serverWho, "whoami")
    )
    container.innerHTML = renderToString(tree(server.client))
    expect(container.querySelector("main")?.textContent).toBe(
      `read by ${ANONYMOUS}`
    )

    const browser = replica({ seed: 7 })
    const user = browser.auth.getPrincipal()?.toText()
    const commits = watchCommits()
    const { recoverable, reported } = await hydrate(tree(browser.client))
    await waitFor(() =>
      expect(container.querySelector("main")?.textContent).toBe(
        `read by ${user}`
      )
    )
    commits.stop()

    // React reports that it rendered the boundary on the client, with the
    // cancelled read as the reason: the error itself on React 18, its
    // `cause` on React 19. An `onRecoverableError` that forwards errors
    // should ignore kind "cancelled".
    expect(recoverable.length).toBeGreaterThan(0)
    expect(
      reported.map((error) =>
        REACT_18 ? error : (error as { cause?: unknown }).cause
      )
    ).toContainEqual(
      expect.objectContaining({ kind: "cancelled", code: "caller_changed" })
    )
    expect(whoamiCallers(browser)).toEqual([user])

    // Once nobody is current, the key the hydrating render read is read
    // again as nobody, and the cancelled read is not shown either.
    const after = watchCommits()
    await act(async () => {
      await browser.auth.signOut()
    })
    await waitFor(() =>
      expect(whoamiCallers(browser)).toEqual([user, ANONYMOUS])
    )
    await waitFor(() =>
      expect(container.querySelector("main")?.textContent).toBe(
        `read by ${ANONYMOUS}`
      )
    )
    after.stop()
    expect(
      [...commits.commits, ...after.commits].filter((html) =>
        html.includes("ERROR")
      )
    ).toEqual([])
  })
})

/**
 * L3: the move to the session is a synchronous update, and a
 * `useSuspenseQuery` read with none of the user's data yet suspends it. With a
 * Suspense boundary above the read, the boundary shows its fallback until the
 * data arrives, and the page commits its other updates meanwhile. With none,
 * React 18 refuses a synchronous update that suspends and unmounts the root;
 * React 19 keeps the server's HTML but commits none of this page's updates
 * until the data arrives: a click, a state change from outside an event, and
 * a transition that renders the read again all wait (measured on 19.3: only a
 * transition that leaves the read alone commits). Accepted: React expects a
 * boundary above a component that suspends.
 */
describe("a useSuspenseQuery read on a signed-in reload", () => {
  function SuspenseReader() {
    const client = useClient()
    const who = client.canister<Who>(WHO, { id: CANISTER })
    const read = useSuspenseQuery(suspense(client.queryOptions(who, "whoami")))
    return <main>{read.data}</main>
  }
  /** {@link Counter}'s setter, for an update from outside an event. */
  let setCount: ((update: (count: number) => number) => void) | undefined
  /**
   * A count, which a click on its first button adds one to and a click on its
   * second adds one to in a transition, above the read: each update of it
   * renders the read again.
   */
  function Counter({ boundary }: { boundary: boolean }) {
    const [count, set] = useState(0)
    setCount = set
    return (
      <>
        <nav>
          <button onClick={() => set((n) => n + 1)}>
            <em>{count}</em>
          </button>
          <button onClick={() => startTransition(() => set((n) => n + 1))}>
            later
          </button>
        </nav>
        {boundary ? (
          <Suspense fallback={<p>fallback</p>}>
            <SuspenseReader />
          </Suspense>
        ) : (
          <SuspenseReader />
        )}
      </>
    )
  }
  const tree = (client: Client, state: DehydratedState, boundary: boolean) => (
    <ReactorProvider client={() => client}>
      <HydrationBoundary state={state}>
        <header>top</header>
        <Counter boundary={boundary} />
      </HydrationBoundary>
    </ReactorProvider>
  )
  const count = () => container.querySelector("em")?.textContent
  /**
   * The server's page, with its read prefetched and dehydrated as nobody, and
   * the browser's replica, whose reads wait until the test calls `release`.
   */
  async function served(boundary: boolean) {
    const server = replica({ signedIn: false })
    const serverWho = server.client.canister<Who>(WHO, { id: CANISTER })
    await server.client.queryClient.prefetchQuery(
      server.client.queryOptions(serverWho, "whoami")
    )
    const json = JSON.stringify(dehydrate(server.client.queryClient))
    container.innerHTML = renderToString(
      tree(server.client, JSON.parse(json), boundary)
    )
    expect(container.querySelector("main")?.textContent).toBe(
      `read by ${ANONYMOUS}`
    )
    expect(count()).toBe("0")
    const browser = replica({ seed: 7 })
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    browser.mock<Who>(WHO, CANISTER, {
      whoami: async ({ caller }) => {
        await held
        return `read by ${caller}`
      },
    })
    return {
      state: JSON.parse(json) as DehydratedState,
      main: container.querySelector("main"),
      browser,
      user: browser.auth.getPrincipal()?.toText(),
      release,
    }
  }
  /**
   * Adds one to the count three times, as a click, a transition and a state
   * change from outside an event, and returns the count shown after each.
   */
  async function update() {
    const [click, later] = container.querySelectorAll("button")
    const shown: (string | undefined)[] = []
    for (const run of [
      () => click.click(),
      () => later.click(),
      () => setCount?.((n) => n + 1),
    ]) {
      await act(async () => run())
      await act(macrotask)
      shown.push(count())
    }
    return shown
  }

  it("shows the fallback of a Suspense boundary above it until the user's data arrives, then that data, and commits the page's updates meanwhile", async () => {
    const { state, main, browser, user, release } = await served(true)
    const commits = watchCommits()

    const { recoverable, logged } = await hydrate(
      tree(browser.client, state, true)
    )
    expect(container.querySelector("p")?.textContent).toBe("fallback")
    expect(await update()).toEqual(["1", "2", "3"])
    expect(container.querySelector("p")?.textContent).toBe("fallback")
    release()
    await waitFor(() =>
      expect(container.querySelector("main")?.textContent).toBe(
        `read by ${user}`
      )
    )
    commits.stop()

    expect(recoverable).toEqual([])
    expect(logged).not.toHaveBeenCalled()
    // The move hid the server's content behind the fallback, then showed the
    // user's data in the same node.
    expect(commits.commits[0]).toContain("<p>fallback</p>")
    expect(commits.commits[0]).toContain(`read by ${ANONYMOUS}`)
    expect(commits.commits[commits.commits.length - 1]).not.toContain(
      "fallback"
    )
    expect(container.querySelector("header")?.textContent).toBe("top")
    expect(count()).toBe("3")
    expect(container.querySelector("main")).toBe(main)
    expect(whoamiCallers(browser)).toEqual([user])
  })

  it(
    REACT_18
      ? "fails to render with no Suspense boundary above it on React 18: React unmounts the root"
      : "keeps the server's HTML with no Suspense boundary above it on React 19, and commits none of the page's updates until the user's data arrives",
    async () => {
      const { state, main, browser, user, release } = await served(false)
      const commits = watchCommits()
      const recoverable: unknown[] = []
      const logged = vi.spyOn(console, "error").mockImplementation(() => {})
      let thrown: unknown
      try {
        await act(async () => {
          root = hydrateRoot(container, tree(browser.client, state, false), {
            onRecoverableError: (error) => recoverable.push(error),
          })
        })
        await act(macrotask)
      } catch (error) {
        thrown = error
      }

      if (REACT_18) {
        release()
        commits.stop()
        expect(String((thrown as Error | undefined)?.message)).toMatch(
          /suspended while responding to synchronous input/
        )
        expect(container.innerHTML).toBe("")
        expect(commits.commits).toEqual([""])
        return
      }
      expect(thrown).toBeUndefined()
      // The page looks hydrated, but the move is still pending: a click and
      // a state change render with it, and a transition renders the read
      // again, so the read suspends each one.
      expect(await update()).toEqual(["0", "0", "0"])
      expect(container.querySelector("main")?.textContent).toBe(
        `read by ${ANONYMOUS}`
      )
      expect(commits.commits).toEqual([])
      release()
      await waitFor(() => {
        expect(container.querySelector("main")?.textContent).toBe(
          `read by ${user}`
        )
        expect(count()).toBe("3")
      })
      commits.stop()
      expect(recoverable).toEqual([])
      expect(logged).not.toHaveBeenCalled()
      expect(container.querySelector("main")).toBe(main)
      expect(whoamiCallers(browser)).toEqual([user])
    }
  )
})

/**
 * Tabs whose caller is the one a hydrating render shows, or one that never
 * changes: `useClient()` then has nothing to move on to after hydrating. A
 * stored session that has ended (an `AuthClient` reports `expired` at once)
 * or that another origin holds (`signed-in-elsewhere`) leaves the caller
 * anonymous, like no session at all; a client built with `identity` keeps its
 * caller for good.
 */
const steadyTabs = [
  ["without a session", "anonymous"],
  ["whose stored session expired", "expired"],
  ["whose session is signed in elsewhere", "elsewhere"],
  ["of a client built with identity", "identity"],
] as const

/** The client of one of {@link steadyTabs}, and the server's for its page. */
async function steadyTab(kind: (typeof steadyTabs)[number][1]) {
  if (kind === "identity") {
    const identity = await testAuth({ identity: 7 }).getIdentity()
    const server = createClient({ network: "ic", identity })
    const browser = createClient({ network: "ic", identity })
    made.push(server, browser)
    return { server, browser, auth: undefined }
  }
  const server = replica({ signedIn: false }).client
  const test = replica({ seed: 7, signedIn: kind !== "anonymous" })
  if (kind === "expired") test.auth.expire()
  if (kind === "elsewhere") test.auth.elsewhere()
  return { server, browser: test.client, auth: test.auth }
}

describe.each(steadyTabs)("a tab %s", (_, kind) => {
  it("hydrates a component that calls useClient() with one render, and leaves a streamed boundary below it pending", async () => {
    let renders = 0
    function Content() {
      return <article>content</article>
    }
    function Nav() {
      renders++
      const client = useClient()
      return (
        <nav data-caller={client.caller()}>
          <button onClick={() => void client.signIn()}>sign in</button>
          <Suspense fallback={<p>fallback</p>}>
            <Content />
          </Suspense>
        </nav>
      )
    }
    const tree = (client: Client) => (
      <ReactorProvider client={() => client}>
        <Nav />
      </ReactorProvider>
    )
    const { server, browser, auth } = await steadyTab(kind)
    container.innerHTML = streamed(
      renderToString(tree(server)),
      "<article>content</article>"
    )
    await whileLoading(async () => {
      renders = 0
      const { recoverable, logged } = await hydrate(tree(browser))
      await act(macrotask)

      expect(renders).toBe(1)
      expect(recoverable).toEqual([])
      expect(logged).not.toHaveBeenCalled()
      expect(container.querySelector("template")).not.toBeNull()
      expect(container.querySelector("article")).toBeNull()
      expect(container.querySelector("p")?.textContent).toBe("fallback")
      expect(container.querySelector("nav")?.dataset.caller).toBe(
        browser.caller()
      )

      // A change of status that leaves the caller as it is renders nothing
      // either: the client the component holds builds the same keys.
      if (auth !== undefined && kind !== "anonymous") {
        const before = browser.authState()
        act(() => (kind === "expired" ? auth.elsewhere() : auth.expire()))
        expect(browser.authState().status).not.toBe(before.status)
        expect(browser.authState().principal).toBe(before.principal)
        expect(renders).toBe(1)
      }
    })
  })
})

/** What `useAuth()` shows in each of {@link steadyTabs} once it hydrated. */
const ownStatus = {
  anonymous: "anonymous",
  expired: "expired",
  elsewhere: "signed-in-elsewhere",
  identity: "signed-in",
} as const

describe.each(steadyTabs)("a hydrated useAuth() in a tab %s", (_, kind) => {
  it("shows the server's state while hydrating, then the tab's own, rendering again only for a status that differs", async () => {
    const statuses: string[] = []
    const auths: unknown[] = []
    function Status() {
      const auth = useAuth()
      statuses.push(auth.status)
      auths.push(auth)
      return <b>{auth.status}</b>
    }
    const tree = (client: Client) => (
      <ReactorProvider client={() => client}>
        <Status />
      </ReactorProvider>
    )
    const { server, browser } = await steadyTab(kind)
    container.innerHTML = renderToString(tree(server))
    expect(container.querySelector("b")?.textContent).toBe("anonymous")
    statuses.length = auths.length = 0

    const { recoverable, logged } = await hydrate(tree(browser))
    await act(macrotask)

    expect(recoverable).toEqual([])
    expect(logged).not.toHaveBeenCalled()
    expect(container.querySelector("b")?.textContent).toBe(ownStatus[kind])
    expect(statuses).toEqual(
      kind === "anonymous" ? ["anonymous"] : ["anonymous", ownStatus[kind]]
    )
    expect(new Set(auths).size).toBe(statuses.length)
  })
})

describe("an anonymous tab", () => {
  it("hydrates with one render of each component that calls useClient() or useAuth(), and one useAuth() object", async () => {
    const server = replica({ signedIn: false })
    const renders = { client: 0, auth: 0 }
    const auths: unknown[] = []
    function ClientUser() {
      renders.client++
      return <i>{useClient().caller()}</i>
    }
    function AuthUser() {
      renders.auth++
      const auth = useAuth()
      auths.push(auth)
      return <b>{auth.status}</b>
    }
    const tree = (client: Client) => (
      <ReactorProvider client={() => client}>
        <ClientUser />
        <AuthUser />
      </ReactorProvider>
    )
    container.innerHTML = renderToString(tree(server.client))
    renders.client = renders.auth = 0
    auths.length = 0

    const browser = replica({ signedIn: false })
    const { recoverable } = await hydrate(tree(browser.client))
    await act(macrotask)

    expect(recoverable).toEqual([])
    expect(renders).toEqual({ client: 1, auth: 1 })
    expect(auths).toHaveLength(1)
    // A render the session did not cause keeps the object too.
    act(() => root?.render(tree(browser.client)))
    expect(renders.auth).toBe(2)
    expect(new Set(auths).size).toBe(1)
    // It still follows the session from then on.
    await act(async () => {
      await browser.auth.signIn(7)
    })
    expect(container.querySelector("b")?.textContent).toBe("signed-in")
    expect(container.querySelector("i")?.textContent).toBe(
      browser.auth.getPrincipal()?.toText()
    )
  })

  it("leaves a streamed boundary below a useAuth() parent pending", async () => {
    let renders = 0
    function Nav() {
      renders++
      const { status } = useAuth()
      return (
        <nav data-status={status}>
          <Suspense fallback={<p>fallback</p>}>
            <article>content</article>
          </Suspense>
        </nav>
      )
    }
    const tree = (client: Client) => (
      <ReactorProvider client={() => client}>
        <Nav />
      </ReactorProvider>
    )
    const server = replica({ signedIn: false })
    container.innerHTML = streamed(
      renderToString(tree(server.client)),
      "<article>content</article>"
    )
    await whileLoading(async () => {
      renders = 0
      const browser = replica({ signedIn: false })
      const { recoverable } = await hydrate(tree(browser.client))
      await act(macrotask)

      expect(renders).toBe(1)
      expect(recoverable).toEqual([])
      expect(container.querySelector("template")).not.toBeNull()
      expect(container.querySelector("article")).toBeNull()
    })
  })
})
