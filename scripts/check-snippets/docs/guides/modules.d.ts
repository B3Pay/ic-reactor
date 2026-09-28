// Third-party modules the guides' examples import, which no workspace package
// installs, so the shared `ambient.d.ts` has no stub for them. Only what the
// snippets use is declared, as functions so that another docs section's stub of
// the same module merges as overloads. `globals.ts` pulls this file in.

declare module "react-router-dom" {
  import type { ReactNode } from "react"

  export function Navigate(props: {
    to: string
    state?: unknown
    replace?: boolean
  }): ReactNode
  export function useLocation(): { pathname: string; state: unknown }
}

declare module "react-error-boundary" {
  import type { ComponentType, ReactNode } from "react"

  // As the package declares it (v6): a boundary catches whatever was thrown, so
  // `error` is `unknown`, not `Error`.
  export interface FallbackProps {
    error: unknown
    resetErrorBoundary: (...args: unknown[]) => void
  }

  export function ErrorBoundary(props: {
    FallbackComponent: ComponentType<FallbackProps>
    children?: ReactNode
  }): ReactNode
}

declare module "@sentry/react" {
  export function captureException(
    exception: unknown,
    hint?: { tags?: Record<string, string> }
  ): string
}
