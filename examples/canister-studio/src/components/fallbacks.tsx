import { Link, type ErrorComponentProps } from "@tanstack/react-router"
import type { ReactElement } from "react"
import { EmptyState } from "./EmptyState.tsx"
import { RouteError } from "./RouteError.tsx"

/**
 * The router's `defaultNotFoundComponent`: an unknown path, or a route that
 * threw `notFound()` without a `notFoundComponent` of its own.
 */
export function DefaultNotFound(): ReactElement {
  return (
    <EmptyState
      code="404"
      headingLevel={1}
      title="Page not found"
      actions={
        <Link to="/" className="btn btn-primary">
          Back to the studio
        </Link>
      }
    >
      <p>Nothing lives at this address.</p>
    </EmptyState>
  )
}

/**
 * The router's `defaultErrorComponent`: a loader or render error that the
 * route did not handle itself.
 */
export function DefaultError(props: ErrorComponentProps): ReactElement {
  return <RouteError {...props} />
}
