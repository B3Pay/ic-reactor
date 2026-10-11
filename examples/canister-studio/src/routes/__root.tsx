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
    links: [{ rel: "stylesheet", href: stylesUrl }],
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
