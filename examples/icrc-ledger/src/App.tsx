import { lazy, Suspense, useState } from "react"
import { MainnetTab } from "./MainnetTab.tsx"

// The sandbox brings the in-memory replica (and its signature code) with it,
// so it is a chunk of its own, loaded the first time the tab is opened.
const SandboxTab = lazy(() => import("./SandboxTab.tsx"))

const TABS = [
  { id: "mainnet", label: "Mainnet" },
  { id: "sandbox", label: "Sandbox" },
] as const

type Tab = (typeof TABS)[number]["id"]

export function App() {
  const [tab, setTab] = useState<Tab>("mainnet")
  // A tab stays mounted once opened, so switching back keeps its state: the
  // sandbox's balances, the mainnet cache.
  const [opened, setOpened] = useState<ReadonlySet<Tab>>(new Set(["mainnet"]))
  const open = (next: Tab) => {
    setTab(next)
    setOpened((current) => new Set(current).add(next))
  }

  return (
    <main>
      <h1>ICRC-1 ledger on ic-reactor 4</h1>
      <p className="lede">
        Modules generated from the <code>.did</code> files (
        <code>src/canisters/</code>), one client per tab, and TanStack
        Query&apos;s own hooks.
      </p>
      <div className="tabs" role="tablist">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => open(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {TABS.map(({ id }) =>
        opened.has(id) ? (
          <div
            key={id}
            role="tabpanel"
            id={`panel-${id}`}
            aria-labelledby={`tab-${id}`}
            hidden={tab !== id}
          >
            {id === "mainnet" ? (
              <MainnetTab />
            ) : (
              <Suspense
                fallback={<p className="muted">Loading the sandbox…</p>}
              >
                <SandboxTab />
              </Suspense>
            )}
          </div>
        ) : null
      )}
    </main>
  )
}
