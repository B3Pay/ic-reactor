import { createFileRoute } from "@tanstack/react-router"
import type { ReactElement } from "react"

export const Route = createFileRoute("/canister/$canisterId/")({
  component: MethodsPage,
})

function MethodsPage(): ReactElement {
  return <h2 className="section-title">Methods</h2>
}
