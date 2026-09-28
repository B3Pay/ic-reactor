// Third-party modules the createActorHooks pages' examples import, which no
// workspace package installs, so the shared `ambient.d.ts` has no stub for
// them. Only what the snippets use is declared. `globals.ts` pulls this file in.

declare module "react-error-boundary" {
  import type { ComponentType, ReactNode } from "react"

  export function ErrorBoundary(props: {
    FallbackComponent: ComponentType<{
      error: Error
      resetErrorBoundary: () => void
    }>
    children?: ReactNode
  }): ReactNode
}

declare module "react-intersection-observer" {
  export function useInView(): {
    ref: (node?: Element | null) => void
    inView: boolean
  }
}
