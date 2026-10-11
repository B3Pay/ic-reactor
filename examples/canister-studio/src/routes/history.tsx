import { createFileRoute } from "@tanstack/react-router"
import type { ReactElement } from "react"

export const Route = createFileRoute("/history")({ component: HistoryPage })

function HistoryPage(): ReactElement {
  return (
    <section className="page">
      <header className="page-header">
        <h1 className="page-title">History</h1>
      </header>
    </section>
  )
}
