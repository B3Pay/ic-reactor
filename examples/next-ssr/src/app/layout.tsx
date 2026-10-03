// The root layout, a Server Component. It renders the client module that owns
// the tab's client (./providers.tsx) around every page, so the client and its
// cache stay alive across client-side navigations.
import type { Metadata } from "next"
import Link from "next/link"
import type { ReactNode } from "react"
import { SessionBadge } from "@/components/SessionBadge"
import { Providers } from "./providers"
import "./globals.css"

export const metadata: Metadata = {
  title: "Next.js SSR on ic-reactor 4",
  description:
    "Mainnet ICRC-1 ledgers read on the server, hydrated losslessly, and read again as the signed-in user.",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <header className="top">
            <nav>
              <Link href="/">Ledgers</Link>
              <Link href="/account">Account lookup</Link>
            </nav>
            <SessionBadge />
          </header>
          {children}
        </Providers>
      </body>
    </html>
  )
}
