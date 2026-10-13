import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react"
import type { ReactElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CKBTC_LEDGER, typedInterface } from "../calls/testing/fixtures.ts"
import type { MethodInfo } from "../interface/types.ts"
import { MethodList } from "./MethodList.tsx"

const ledger = typedInterface(CKBTC_LEDGER)

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** Renders `ui` in a router that restores scroll, as the app's does. */
async function renderInApp(ui: ReactElement) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => ui }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
    scrollRestoration: true,
  })
  await router.load()
  render(<RouterProvider router={router} />)
  return router
}

describe("MethodList", () => {
  it("filters by mode as a radio group: one tab stop, arrow keys move the choice", async () => {
    await renderInApp(
      <MethodList canisterId={CKBTC_LEDGER} methods={ledger.methods} />
    )
    const group = screen.getByRole("radiogroup", { name: "Filter by mode" })
    const [all, query, update] = within(group).getAllByRole("radio")
    if (all === undefined || query === undefined || update === undefined) {
      throw new Error("expected All, query and update")
    }
    expect([all.tabIndex, query.tabIndex, update.tabIndex]).toEqual([0, -1, -1])
    act(() => all.focus())
    fireEvent.keyDown(all, { key: "ArrowRight" })
    expect(query.getAttribute("aria-checked")).toBe("true")
    expect(document.activeElement).toBe(query)
    expect(query.tabIndex).toBe(0)
    // Only queries are listed now.
    expect(screen.queryByRole("link", { name: /icrc1_transfer/ })).toBeNull()
    expect(screen.getByRole("link", { name: /icrc1_symbol/ })).toBeTruthy()
  })

  it("says how many methods it searches, in the singular for one", async () => {
    const one = ledger.methods.filter((m) => m.name === "icrc1_symbol")
    await renderInApp(<MethodList canisterId={CKBTC_LEDGER} methods={one} />)
    expect(screen.getByRole("searchbox").getAttribute("placeholder")).toBe(
      "Search 1 method"
    )
  })

  it("names each method whole, and its arity in words", async () => {
    const long: MethodInfo = {
      name: "get_most_recent_monthly_node_provider_rewards",
      mode: "query",
      args: [],
      results: ledger.method("icrc1_symbol")?.results ?? [],
    }
    await renderInApp(<MethodList canisterId={CKBTC_LEDGER} methods={[long]} />)
    const link = screen.getByRole("link", {
      name: "get_most_recent_monthly_node_provider_rewards, 0 arguments, 1 result",
    })
    // Cut to the column on screen: the title shows the whole name.
    expect(within(link).getByTitle(long.name).textContent).toBe(long.name)
  })

  it("keeps the page where it is when a method is picked, and says it was picked", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {})
    const onPick = vi.fn()
    const router = await renderInApp(
      <MethodList
        canisterId={CKBTC_LEDGER}
        methods={ledger.methods}
        onPick={onPick}
      />
    )
    scrollTo.mockClear()
    fireEvent.click(screen.getByRole("link", { name: /^icrc1_fee/ }))
    await vi.waitFor(() => {
      expect(router.state.location.search).toEqual({ method: "icrc1_fee" })
    })
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenLastCalledWith({
      method: "icrc1_fee",
      certified: undefined,
    })
    expect(scrollTo).not.toHaveBeenCalled()

    // Enter in the search box opens the first match the same way.
    const search = screen.getByRole("searchbox")
    fireEvent.change(search, { target: { value: "symbol" } })
    fireEvent.keyDown(search, { key: "Enter" })
    await vi.waitFor(() => {
      expect(router.state.location.search).toEqual({ method: "icrc1_symbol" })
    })
    expect(onPick).toHaveBeenCalledTimes(2)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it("says nothing was picked here when a click opens the method in another tab", async () => {
    const onPick = vi.fn()
    await renderInApp(
      <MethodList
        canisterId={CKBTC_LEDGER}
        methods={ledger.methods}
        onPick={onPick}
      />
    )
    const link = screen.getByRole("link", { name: /^icrc1_fee/ })
    for (const init of [
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { button: 1 },
    ]) {
      fireEvent.click(link, init)
    }
    expect(onPick).not.toHaveBeenCalled()
  })
})
