import { createFileRoute } from "@tanstack/react-router"
import type { ReactElement } from "react"

export const Route = createFileRoute("/wallet")({ component: WalletPage })

function WalletPage(): ReactElement {
  return (
    <section className="page">
      <header className="page-header">
        <h1 className="page-title">Wallet</h1>
      </header>
    </section>
  )
}
