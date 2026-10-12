/// <reference types="vite/client" />
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router"
import type { ReactElement, ReactNode } from "react"
import { AppShell } from "../components/AppShell.tsx"
import type { RouterContext } from "../router.tsx"
import stylesUrl from "../styles.css?url"

// The brand mark as the tab icon, inline: the app serves no static files.
const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="6" fill="#4f46e5"/><path d="M8 9.5 5.5 12 8 14.5M16 9.5l2.5 2.5-2.5 2.5M13.2 8l-2.4 8" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
)}`

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Canister Studio" },
      {
        name: "description",
        content:
          "Automatic forms and safe calls for any Internet Computer canister: typed canisters, live certified interfaces, server-rendered results.",
      },
      { name: "color-scheme", content: "light dark" },
    ],
    links: [
      { rel: "stylesheet", href: stylesUrl },
      { rel: "icon", type: "image/svg+xml", href: FAVICON },
    ],
  }),
  shellComponent: RootDocument,
  component: RootLayout,
})

function RootLayout(): ReactElement {
  return <Outlet />
}

// The document itself. The shell wraps every route's component, and its
// not-found and error components too, so the app frame stays on those pages.
function RootDocument({ children }: { children: ReactNode }): ReactElement {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <AppShell>{children}</AppShell>
        <Scripts />
      </body>
    </html>
  )
}
