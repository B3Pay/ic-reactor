import { createFileRoute } from "@tanstack/react-router"
import type { ReactElement } from "react"

export const Route = createFileRoute("/safety")({ component: SafetyPage })

function SafetyPage(): ReactElement {
  return (
    <section className="page">
      <header className="page-header">
        <h1 className="page-title">Safety lab</h1>
      </header>
    </section>
  )
}
