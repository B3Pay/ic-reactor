// @vitest-environment node
import type { QueryKey } from "@tanstack/react-query"
import { describe, expect, it } from "vitest"
import { getRouter, shouldDehydrateRead } from "./router.tsx"

const key = (name: string): QueryKey => [name]

describe("getRouter", () => {
  it("makes one ic-reactor client per router, owning the query client", () => {
    const a = getRouter()
    const b = getRouter()
    try {
      expect(a.options.context.reactor).not.toBe(b.options.context.reactor)
      expect(a.options.context.queryClient).toBe(
        a.options.context.reactor.queryClient
      )
      expect(a.options.context.reactor.network).toBe("ic")
    } finally {
      a.options.context.reactor.dispose()
      b.options.context.reactor.dispose()
    }
  })

  it("prefetches on intent and leaves freshness to TanStack Query", () => {
    const router = getRouter()
    try {
      expect(router.options.defaultPreload).toBe("intent")
      expect(router.options.defaultPreloadStaleTime).toBe(0)
      expect(router.options.scrollRestoration).toBe(true)
      expect(router.options.defaultNotFoundComponent).toBeTypeOf("function")
      expect(router.options.defaultErrorComponent).toBeTypeOf("function")
    } finally {
      router.options.context.reactor.dispose()
    }
  })

  it("never dehydrates a failed read", () => {
    const router = getRouter()
    const { queryClient } = router.options.context
    try {
      const cache = queryClient.getQueryCache()
      const ok = cache.build(queryClient, { queryKey: key("ok") })
      ok.setData(1n)
      const inFlight = cache.build(queryClient, { queryKey: key("in-flight") })
      inFlight.setState({ fetchStatus: "fetching" })
      const idle = cache.build(queryClient, { queryKey: key("idle") })
      const failed = cache.build(queryClient, { queryKey: key("failed") })
      failed.setState({ status: "error", error: new Error("rejected") })
      expect(shouldDehydrateRead(ok)).toBe(true)
      expect(shouldDehydrateRead(inFlight)).toBe(true)
      expect(shouldDehydrateRead(idle)).toBe(false)
      expect(shouldDehydrateRead(failed)).toBe(false)
    } finally {
      router.options.context.reactor.dispose()
    }
  })
})
