// Third-party modules the framework pages' examples import, which no workspace
// package installs, so the shared `ambient.d.ts` has no stub for them. Only what
// the snippets use is declared. `globals.ts` pulls this file in.

declare module "react-router-dom" {
  import type { ReactNode } from "react"

  export function Navigate(props: {
    to: string
    state?: unknown
    replace?: boolean
  }): ReactNode
  export function Route(props: { path: string; element: ReactNode }): ReactNode
  export function Link(props: {
    to: string
    onMouseEnter?: () => void
    children?: ReactNode
  }): ReactNode
  export function useLocation(): { pathname: string; state: unknown }
}

declare module "@tanstack/react-query-devtools" {
  import type { ReactNode } from "react"

  export function ReactQueryDevtools(props: {
    initialIsOpen?: boolean
  }): ReactNode
}
