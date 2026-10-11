import { createFileRoute } from "@tanstack/react-router"
import type { ReactElement } from "react"

export const Route = createFileRoute("/")({ component: HomePage })

function HomePage(): ReactElement {
  return (
    <section className="page">
      <header className="page-header">
        <h1 className="page-title">Canister Studio</h1>
        <p className="page-subtitle">
          Automatic forms and safe calls for any Internet Computer canister.
        </p>
      </header>
    </section>
  )
}
