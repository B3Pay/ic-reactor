// The part of React's Flight server (`react-server-dom-turbopack`, which ships
// no types) that src/server/request-client.rsc.test.tsx renders with.
declare module "react-server-dom-turbopack/server" {
  import type { ReactNode } from "react"

  /**
   * Renders a Server Component tree to the RSC payload, as Next does for a
   * request: React's `cache()` memoizes for the length of this render.
   */
  export function renderToReadableStream(
    model: ReactNode,
    turbopackMap?: Record<string, never>,
    options?: { onError?: (error: unknown) => void }
  ): ReadableStream<Uint8Array>
}
