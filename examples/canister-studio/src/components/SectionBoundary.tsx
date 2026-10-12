import { QueryErrorResetBoundary } from "@tanstack/react-query"
import { CatchBoundary } from "@tanstack/react-router"
import { Suspense, type ReactElement, type ReactNode } from "react"

export interface SectionBoundaryProps {
  /** What failed, for the message: "ICP ledger stats". */
  label: string
  /** Shown while a `useSuspenseQuery` inside is loading (streamed on SSR). */
  fallback: ReactNode
  /** Remounts the boundary (and so retries) when it changes. */
  resetKey?: unknown
  children: ReactNode
}

/**
 * A Suspense boundary with its own error boundary, so one failed read
 * shows an inline message with a retry instead of failing the whole page.
 *
 * On the server, a read that fails inside, or that the router cancels at its
 * deadline, leaves the section to the browser: React sends the fallback and
 * renders the section there, where the read runs again (only successful
 * reads are dehydrated). The error shows only if that read fails too, as the
 * real ReactorError.
 */
export function SectionBoundary({
  label,
  fallback,
  resetKey,
  children,
}: SectionBoundaryProps): ReactElement {
  return (
    <QueryErrorResetBoundary>
      {({ reset: resetQueries }) => (
        <CatchBoundary
          getResetKey={() => resetKey}
          errorComponent={({ error, reset }) => (
            <SectionError
              label={label}
              error={error}
              onRetry={() => {
                // Lets the failed queries fetch again, then remounts.
                resetQueries()
                reset()
              }}
            />
          )}
        >
          <Suspense fallback={fallback}>{children}</Suspense>
        </CatchBoundary>
      )}
    </QueryErrorResetBoundary>
  )
}

function SectionError({
  label,
  error,
  onRetry,
}: {
  label: string
  error: unknown
  onRetry(): void
}): ReactElement {
  const message = error instanceof Error ? error.message : String(error)
  return (
    <div className="ui-section-error" role="alert">
      <p className="text-sm">
        <strong>{label} did not load.</strong>{" "}
        <span className="muted break-all">{message}</span>
      </p>
      <button type="button" className="btn btn-sm" onClick={onRetry}>
        Retry
      </button>
    </div>
  )
}
