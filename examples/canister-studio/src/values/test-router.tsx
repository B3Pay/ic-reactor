import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { render, type RenderResult } from "@testing-library/react"
import type { ReactElement } from "react"

/**
 * Renders `ui` as the only route of an in-memory router, so the viewers'
 * `Link`s have a router to build their hrefs with. Test-only.
 */
export async function renderInRouter(ui: ReactElement): Promise<RenderResult> {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => ui }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  })
  await router.load()
  return render(<RouterProvider router={router} />)
}
