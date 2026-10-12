import { ClientOnly, createFileRoute } from "@tanstack/react-router"
import type { ReactElement } from "react"
import { HistoryList } from "../components/history/HistoryList.tsx"
import { RouteError } from "../components/RouteError.tsx"
import { Skeleton } from "../components/Spinner.tsx"

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "History · Canister Studio" },
      {
        name: "description",
        content:
          "The calls made in this browser, with their exact argument bytes: replay them or share them.",
      },
    ],
  }),
  errorComponent: (props) => (
    <RouteError {...props} title="The history failed to load" />
  ),
  component: HistoryPage,
})

function HistoryPage(): ReactElement {
  return (
    <div className="page history">
      <header className="page-header">
        <h1 className="page-title">History</h1>
        <p className="page-subtitle">
          Every call you ran or sent in this browser, newest first, with its
          arguments as the exact Candid bytes that were sent (never
          re-serialized JSON). The reads a page makes by itself, such as
          balances and token metadata, are not kept. Replay a read, reopen a
          write prefilled, or copy a link that renders the read’s result on the
          server.
        </p>
      </header>
      {/* The history lives in this browser's storage: nothing to render on a
          server, and nothing to match while hydrating. */}
      <ClientOnly fallback={<HistorySkeleton />}>
        <HistoryList />
      </ClientOnly>
    </div>
  )
}

function HistorySkeleton(): ReactElement {
  return (
    <div className="stack" aria-busy="true">
      <span className="sr-only">Loading your history</span>
      <Skeleton height="2.25rem" />
      <Skeleton height="12rem" />
    </div>
  )
}
