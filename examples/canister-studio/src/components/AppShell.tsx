import { Link } from "@tanstack/react-router"
import type { ReactElement, ReactNode } from "react"
import { AppHeader } from "./AppHeader.tsx"

/**
 * The page frame around every route: the sticky header and the main column.
 * Rendered by the root route's shell, so it stays on not-found and error
 * pages too.
 */
export function AppShell({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <AppHeader />
      <main id="main" className="app-main" tabIndex={-1}>
        {children}
      </main>
      <footer className="app-footer">
        <p className="muted">
          Canister Studio: automatic forms and safe calls for any Internet
          Computer canister, on ic-reactor and Meant.{" "}
          <Link to="/safety">How calls stay safe</Link>
        </p>
      </footer>
    </div>
  )
}
