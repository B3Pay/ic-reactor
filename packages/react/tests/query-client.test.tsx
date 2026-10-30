/**
 * An app that already uses TanStack Query, under `ReactorProvider` (#903).
 *
 * The provider renders a `QueryClientProvider` with the client's
 * `QueryClient`, so an app's own queries (REST calls) run on it: they retry as
 * they would on a plain `QueryClient`. An app that nests its own
 * `QueryClientProvider` inside keeps its reads and runs its writes there, and
 * a write invalidates the reads on the `QueryClient` it ran on.
 */
import { c } from "@meantjs/schema"
import { createTestClient } from "@ic-reactor/core/testing"
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
} from "@tanstack/react-query"
import { act, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ReactorProvider, useClient } from "../src/index.js"

const CANISTER = "rdmx6-jaaaa-aaaaa-aaadq-cai"

/** A counter: one read of its total, one write that adds to it. */
const COUNTER = c.service({
  total: c.func([], [c.nat], "query"),
  add: c.func([c.nat], [c.nat], "update"),
})
type Counter = {
  total: () => Promise<bigint>
  add: (n: bigint) => Promise<bigint>
}

const tests: ReturnType<typeof createTestClient>[] = []

afterEach(() => {
  for (const test of tests.splice(0)) test.client.dispose()
})

function counter() {
  let total = 0n
  const test = createTestClient()
  test.mock<Counter>(COUNTER, CANISTER, {
    total: () => total,
    add: (n) => (total += n),
  })
  tests.push(test)
  return test
}

describe("an app's own TanStack Query setup under ReactorProvider", () => {
  it("retries a REST query as a plain QueryClient does", async () => {
    const { client } = counter()
    const rest = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue("rest data")
    function Rest() {
      const read = useQuery({
        queryKey: ["rest"],
        queryFn: rest,
        retryDelay: 0,
      })
      return <p>{read.isError ? "ERROR" : (read.data ?? "loading")}</p>
    }

    render(
      <ReactorProvider client={() => client}>
        <Rest />
      </ReactorProvider>
    )

    await screen.findByText("rest data")
    expect(rest).toHaveBeenCalledTimes(2)
  })

  it("refreshes the reads of a nested QueryClientProvider after a write", async () => {
    const { client } = counter()
    const app = new QueryClient()
    function Total() {
      const view = useClient()
      const canister = view.canister<Counter>(COUNTER, { id: CANISTER })
      const total = useQuery(view.queryOptions(canister, "total"))
      const add = useMutation(view.mutationOptions(canister, "add"))
      return (
        <>
          <p>total {String(total.data ?? "loading")}</p>
          <button onClick={() => add.mutate(5n)}>add</button>
        </>
      )
    }

    render(
      <ReactorProvider client={() => client}>
        <QueryClientProvider client={app}>
          <Total />
        </QueryClientProvider>
      </ReactorProvider>
    )
    await screen.findByText("total 0")

    act(() => screen.getByText("add").click())

    await waitFor(() => expect(screen.getByText("total 5")).toBeTruthy())
    app.clear()
  })
})
