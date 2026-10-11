import { createFileRoute } from "@tanstack/react-router"
import type { ReactElement } from "react"

export const Route = createFileRoute("/playground")({
  component: PlaygroundPage,
})

function PlaygroundPage(): ReactElement {
  return (
    <section className="page">
      <header className="page-header">
        <h1 className="page-title">Playground</h1>
      </header>
    </section>
  )
}
