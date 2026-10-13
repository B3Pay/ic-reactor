import { Link } from "@tanstack/react-router"
import type { ReactElement } from "react"
import { AuthButton } from "./AuthButton.tsx"
import { CanisterJump } from "./CanisterJump.tsx"

const NAV = [
  { to: "/", label: "Home", exact: true },
  { to: "/wallet", label: "Wallet", exact: false },
  { to: "/safety", label: "Safety lab", exact: false },
  { to: "/playground", label: "Playground", exact: false },
  { to: "/history", label: "History", exact: false },
] as const

/**
 * The sticky header on every page: brand, main navigation, the canister jump
 * box, the network badge and the sign-in button.
 */
export function AppHeader(): ReactElement {
  return (
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
          <CanisterJump />
          <span
            className="badge badge-network"
            title="Every call goes to the Internet Computer mainnet"
          >
            mainnet
          </span>
          <AuthButton />
        </div>
      </div>
    </header>
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
