// What the page says when an interface did not load: the reason it names
// must be the one that applies.
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { InterfacePayload } from "../../interface/types.ts"
import { CanisterLoadFailure } from "./CanisterLoadFailure.tsx"

afterEach(cleanup)

type Failed = Extract<InterfacePayload, { ok: false }>

async function renderFailure(payload: Omit<Failed, "ok" | "canisterId">) {
  const failed: Failed = {
    ok: false,
    canisterId: "qoctq-giaaa-aaaaa-aaaea-cai",
    ...payload,
  }
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => <CanisterLoadFailure payload={failed} />,
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  await router.load()
  render(<RouterProvider router={router} />)
}

describe("CanisterLoadFailure", () => {
  it("names the method cap as well as the size cap for an interface too large", async () => {
    await renderFailure({
      code: "too_large",
      message: "The interface has 1204 methods; the studio loads at most 1000.",
    })
    await screen.findByText("The interface is too large")
    const text = document.body.textContent ?? ""
    expect(text).toContain("1,000 methods")
    expect(text).not.toMatch(/up to 256 KiB on its server; this one is larger/)
  })

  it("never promises a cached second read after a compile ran past its deadline", async () => {
    await renderFailure({
      code: "timeout",
      message: "The compile took longer than 2 s, so the server stopped it.",
    })
    await screen.findByText("Loading the interface took too long")
    const text = document.body.textContent ?? ""
    expect(text).not.toMatch(/usually cached/)
    expect(text).toContain("refused for a short while")
  })
})
