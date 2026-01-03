import { createRootRoute } from "@tanstack/react-router"
import { Outlet } from "@tanstack/react-router"

export const Route = createRootRoute({
  pendingMinMs: 1000,
  component: RootComponent,
})

function RootComponent() {
  return <Outlet />
}
