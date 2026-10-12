// The playground's optional target canister: a mistyped id must say so, not
// be dropped while the forms quietly only encode.
import { createTestClient } from "@ic-reactor/core/testing"
import { ReactorProvider } from "@ic-reactor/react"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  type RouteComponent,
} from "@tanstack/react-router"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { Route as PlaygroundRoute } from "../../routes/playground.tsx"

let test: ReturnType<typeof createTestClient> | undefined
afterEach(() => {
  cleanup()
  test?.client.dispose()
  test = undefined
})

async function openPlayground(): Promise<HTMLInputElement> {
  test = createTestClient({ network: "ic", signedIn: false })
  const client = test.client
  const root = createRootRoute({ component: Outlet })
  const playground = createRoute({
    getParentRoute: () => root,
    path: "/playground",
    validateSearch: PlaygroundRoute.options.validateSearch,
    component: PlaygroundRoute.options.component as RouteComponent,
  })
  const router = createRouter({
    routeTree: root.addChildren([playground]),
    history: createMemoryHistory({ initialEntries: ["/playground"] }),
  })
  await router.load()
  render(
    <ReactorProvider client={() => client}>
      <RouterProvider router={router} />
    </ReactorProvider>
  )
  return (await screen.findByLabelText("Canister id")) as HTMLInputElement
}

const hintOf = (input: HTMLInputElement): string =>
  document.getElementById(input.getAttribute("aria-describedby") ?? "")
    ?.textContent ?? ""

describe("the playground's target canister", () => {
  it("says a mistyped id is not one when the field is left", async () => {
    const input = await openPlayground()
    fireEvent.change(input, { target: { value: "ryjl3-tyaaa-aaaaa-aaaba-ca" } })
    // Still typing: no error yet, but no promise of a target either.
    expect(input.getAttribute("aria-invalid")).toBe("false")
    expect(hintOf(input)).toBe("Not a canister id yet: forms only encode.")
    fireEvent.blur(input)
    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(hintOf(input)).toMatch(
      /is not canonical principal text\. Until it is a canister id, forms only encode\.$/
    )
  })

  it("refuses the management canister when the field is left", async () => {
    const input = await openPlayground()
    fireEvent.change(input, { target: { value: "aaaaa-aa" } })
    fireEvent.blur(input)
    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(hintOf(input)).toMatch(/management canister/)
  })

  it("leaves an empty field, or a real id, without an error", async () => {
    const input = await openPlayground()
    fireEvent.blur(input)
    expect(input.getAttribute("aria-invalid")).toBe("false")
    expect(hintOf(input)).toMatch(/^Without one/)
    fireEvent.change(input, {
      target: { value: "ryjl3-tyaaa-aaaaa-aaaba-cai" },
    })
    fireEvent.blur(input)
    expect(input.getAttribute("aria-invalid")).toBe("false")
    expect(hintOf(input)).toBe("Forms call this canister on mainnet.")
  })
})
