import { createFileRoute, Outlet } from "@tanstack/react-router"
import type { ReactElement } from "react"

export const Route = createFileRoute("/canister/$canisterId")({
  component: CanisterLayout,
})

function CanisterLayout(): ReactElement {
  const { canisterId } = Route.useParams()
  return (
    <section className="page">
      <header className="page-header">
        <h1 className="page-title">Canister</h1>
        <p className="page-subtitle mono">{canisterId}</p>
      </header>
      <Outlet />
    </section>
  )
}
