import { Link } from "@tanstack/react-router"
import type { ReactElement, ReactNode } from "react"

const NAV = [
  { to: "/", label: "Home", exact: true },
  { to: "/wallet", label: "Wallet", exact: false },
  { to: "/safety", label: "Safety lab", exact: false },
  { to: "/playground", label: "Playground", exact: false },
  { to: "/history", label: "History", exact: false },
] as const

/**
 * The page frame around every route: a sticky header (brand, main
 * navigation, tools) and the main column. Rendered by the root route's shell,
 * so it stays on not-found and error pages too.
 *
 * The header's tool slots (`data-slot`) are where the canister jump box and
 * the sign-in button go.
 */
export function AppShell({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="app-header">
        <div className="app-header-inner">
          <Link
            to="/"
            className="brand"
            aria-label="Canister Studio, home"
            // Active (aria-current) on the home page only, and never styled so.
            activeOptions={{ exact: true }}
            activeProps={{}}
          >
            <BrandMark />
            <span className="brand-name">Canister Studio</span>
          </Link>
          <nav className="app-nav" aria-label="Main">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="app-nav-link"
                activeOptions={{ exact: item.exact }}
                // Link sets aria-current="page" itself on an active link.
                activeProps={{ className: "active" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="app-header-tools">
            <div className="app-header-slot" data-slot="canister-jump" />
            <span
              className="badge badge-network"
              title="Every call goes to the Internet Computer mainnet"
            >
              mainnet
            </span>
            <div className="app-header-slot" data-slot="auth" />
          </div>
        </div>
      </header>
      <main id="main" className="app-main" tabIndex={-1}>
        {children}
      </main>
      <footer className="app-footer">
        <p className="muted">
          Canister Studio: automatic forms and safe calls for any Internet
          Computer canister, on ic-reactor and candid-core.
        </p>
      </footer>
    </div>
  )
}

function BrandMark(): ReactElement {
  return (
    <svg
      className="brand-mark"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2" y="2" width="20" height="20" rx="6" fill="currentColor" />
      <path
        d="M8 9.5 5.5 12 8 14.5M16 9.5l2.5 2.5-2.5 2.5M13.2 8l-2.4 8"
        fill="none"
        stroke="var(--color-on-accent)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
