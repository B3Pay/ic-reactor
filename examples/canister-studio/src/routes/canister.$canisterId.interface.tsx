import { createFileRoute } from "@tanstack/react-router"
import type { ReactElement } from "react"

export const Route = createFileRoute("/canister/$canisterId/interface")({
  component: InterfacePage,
})

function InterfacePage(): ReactElement {
  return <h2 className="section-title">Interface</h2>
}
