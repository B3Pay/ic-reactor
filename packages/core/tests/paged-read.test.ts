/**
 * A read walked through its pages: `client.queryOptions(canister, method,
 * firstVars, { pages })`, driven on the client's own `QueryClient` against a
 * fake replica.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import {
  MutationObserver,
  QueryObserver,
  isCancelledError,
  skipToken,
} from "@tanstack/query-core"
import { createTestAuth } from "../src/testing/test-auth.js"
import {
  ARCHIVE,
  SHAPES,
  canisterRequests,
  clientAs,
  clientWithAuth,
  deferred,
  replicaWith,
  requestsFor,
  serve,
} from "./canister-helpers.js"
import * as archive from "./fixtures/archive.js"
import * as shapes from "./fixtures/shapes.js"

afterEach(() => {
  vi.unstubAllGlobals()
})

const alice = Ed25519KeyIdentity.generate()

/** A ledger of `count` blocks, served `length` at a time from `start`. */
function blocksCanister(count: number, hold?: () => Promise<void> | undefined) {
  return serve<archive.Actor>(archive.actor, {
    get_blocks: async ([{ start, length }]) => {
      await hold?.()
      const blocks = []
      for (let i = start; i < start + length && i < BigInt(count); i++) {
        blocks.push({ index: i, memo: new Uint8Array([Number(i)]) })
      }
      return { first_index: start, blocks, archived_blocks: [] }
    },
  })
}

/** The next range after a full one, and none after a short one. */
const nextRange = (
  page: { blocks: readonly unknown[] },
  { start, length }: { start: bigint; length: bigint }
) =>
  BigInt(page.blocks.length) < length
    ? undefined
    : { start: start + length, length }

describe("a read walked through its pages", () => {
  it("asks for every page in order, one call each, and gives them all", async () => {
    const replica = replicaWith({ [ARCHIVE]: blocksCanister(5) })
    const client = clientAs(replica, alice)
    const ledger = client.canister<archive.Actor>(archive.actor, {
      id: ARCHIVE,
    })
    const seen: bigint[] = []
    const options = client.queryOptions(
      ledger,
      "get_blocks",
      { start: 0n, length: 2n },
      {
        pages: (page, vars) => {
          seen.push(vars.start)
          return nextRange(page, vars)
        },
      }
    )
    const pages = await client.queryClient.fetchQuery(options)
    expect(
      pages.map((page) => page.blocks.map((block) => block.index))
    ).toEqual([[0n, 1n], [2n, 3n], [4n]])
    // `pages` was given each page with the variables it was asked for with.
    expect(seen).toEqual([0n, 2n, 4n])
    expect(requestsFor(replica, "get_blocks")).toHaveLength(3)
  })

  it("keeps the walk under the first page's key and the tag, apart from the first page alone", async () => {
    const replica = replicaWith({ [ARCHIVE]: blocksCanister(3) })
    const client = clientAs(replica, alice)
    const ledger = client.canister<archive.Actor>(archive.actor, {
      id: ARCHIVE,
    })
    const first = { start: 0n, length: 2n }
    const walk = client.queryOptions(ledger, "get_blocks", first, {
      pages: nextRange,
    })
    const alone = client.queryOptions(ledger, "get_blocks", first)
    expect(walk.queryKey).toEqual([...alone.queryKey, "$pages"])
    expect(walk.queryKey).toEqual([
      ...client.queryKey(ledger, "get_blocks", first),
      "$pages",
    ])
    await client.queryClient.fetchQuery(walk)
    // The first page alone is not in the cache: the walk is another read.
    expect(client.queryClient.getQueryData(alone.queryKey)).toBeUndefined()
    expect(client.queryClient.getQueryData(walk.queryKey)).toHaveLength(2)

    // On a certified canister the tag comes before `certified`.
    const certified = client.canister<archive.Actor>(archive.actor, {
      id: ARCHIVE,
      certified: true,
    })
    expect(
      client
        .queryOptions(certified, "get_blocks", first, { pages: nextRange })
        .queryKey.slice(-2)
    ).toEqual(["$pages", "certified"])
  })

  it("takes the tuple of a method with several arguments, and one page is the whole list", async () => {
    const replica = replicaWith({
      [SHAPES]: serve<shapes.Actor>(shapes.actor, {
        pair: ([left, right]) => ({ left, right }),
      }),
    })
    const client = clientAs(replica, alice)
    const canister = client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    const walk = client.queryOptions(canister, "pair", [1n, "a"], {
      pages: (page, [left, right]) =>
        left < 3n ? [page.left + 1n, `${right}a`] : undefined,
    })
    await expect(client.queryClient.fetchQuery(walk)).resolves.toEqual([
      { left: 1n, right: "a" },
      { left: 2n, right: "aa" },
      { left: 3n, right: "aaa" },
    ])
    const once = client.queryOptions(canister, "pair", [9n, "z"], {
      pages: () => undefined,
    })
    await expect(client.queryClient.fetchQuery(once)).resolves.toEqual([
      { left: 9n, right: "z" },
    ])
    expect(requestsFor(replica, "pair")).toHaveLength(4)
  })

  it("sends every page as the caller it was built for, and gives the walk up when someone else signs in", async () => {
    const gate = deferred()
    let held = false
    const replica = replicaWith({
      // The second page waits, so the account changes while the walk is out.
      [ARCHIVE]: blocksCanister(6, () => {
        if (requestsFor(replica, "get_blocks").length < 2 || held) return
        held = true
        return gate.promise
      }),
    })
    const auth = createTestAuth({ seed: 1 })
    const client = clientWithAuth(replica, auth)
    const ledger = client.canister<archive.Actor>(archive.actor, {
      id: ARCHIVE,
    })
    const built = client.caller()
    const walk = client.queryClient.fetchQuery({
      ...client.queryOptions(
        ledger,
        "get_blocks",
        { start: 0n, length: 2n },
        { pages: nextRange }
      ),
      retry: false,
    })
    const failed = walk.catch((error: unknown) => error)
    await vi.waitFor(() =>
      expect(requestsFor(replica, "get_blocks")).toHaveLength(2)
    )
    auth.switchTo(2)
    gate.resolve()
    // The client drops the reads of a caller who is no longer current.
    expect(isCancelledError(await failed)).toBe(true)
    // The third page was never asked for, and the two that were went out as
    // the caller the options were built for.
    const sent = requestsFor(replica, "get_blocks")
    expect(sent).toHaveLength(2)
    expect(sent.map((request) => request.caller)).toEqual([built, built])
  })

  it("fails as a whole with the error of the page that failed", async () => {
    const replica = replicaWith({
      [SHAPES]: serve<shapes.Actor>(shapes.actor, {
        outcome: ([n]) =>
          n < 2n ? { tag: "ok", value: n } : { tag: "err", value: "no page 2" },
      }),
    })
    const client = clientAs(replica, alice)
    const canister = client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    const walk = client.queryOptions(canister, "outcome", 0n, {
      // A page is the `ok` value, as a read of it alone gives it.
      pages: (page) => page + 1n,
    })
    await expect(
      client.queryClient.fetchQuery({ ...walk, retry: false })
    ).rejects.toMatchObject({ kind: "canister_err", err: "no page 2" })
    expect(requestsFor(replica, "outcome")).toHaveLength(3)
    expect(client.queryClient.getQueryData(walk.queryKey)).toBeUndefined()
  })

  it("rejects page_repeated, and sends nothing more, when pages names a page it has asked for", async () => {
    const replica = replicaWith({ [ARCHIVE]: blocksCanister(6) })
    const client = clientAs(replica, alice)
    const ledger = client.canister<archive.Actor>(archive.actor, {
      id: ARCHIVE,
    })
    const walk = client.queryOptions(
      ledger,
      "get_blocks",
      { start: 0n, length: 2n },
      {
        // 0, 2, and back to 0: a cursor that goes round.
        pages: (_page, { start, length }) => ({
          start: start === 0n ? 2n : 0n,
          length,
        }),
      }
    )
    await expect(
      client.queryClient.fetchQuery({ ...walk, retry: false })
    ).rejects.toMatchObject({
      kind: "invalid_args",
      code: "page_repeated",
      method: "get_blocks",
      canisterId: ARCHIVE,
      mayHaveExecuted: false,
    })
    expect(requestsFor(replica, "get_blocks")).toHaveLength(2)
    // The same variables as the page before are a repeat as well.
    const still = client.queryOptions(
      ledger,
      "get_blocks",
      { start: 4n, length: 2n },
      { pages: (_page, vars) => vars }
    )
    await expect(
      client.queryClient.fetchQuery({ ...still, retry: false })
    ).rejects.toMatchObject({ code: "page_repeated" })
    expect(requestsFor(replica, "get_blocks")).toHaveLength(3)
  })

  it("rejects with what pages throws, and invalid_args for variables that do not encode", async () => {
    const replica = replicaWith({ [ARCHIVE]: blocksCanister(6) })
    const client = clientAs(replica, alice)
    const ledger = client.canister<archive.Actor>(archive.actor, {
      id: ARCHIVE,
    })
    const first = { start: 0n, length: 2n }
    const thrown = new Error("no next page")
    await expect(
      client.queryClient.fetchQuery({
        ...client.queryOptions(ledger, "get_blocks", first, {
          pages: () => {
            throw thrown
          },
        }),
        retry: false,
      })
    ).rejects.toBe(thrown)
    await expect(
      client.queryClient.fetchQuery({
        ...client.queryOptions(
          ledger,
          "get_blocks",
          { start: 2n, length: 2n },
          { pages: () => ({ start: -1n, length: 2n }) }
        ),
        retry: false,
      })
    ).rejects.toMatchObject({ kind: "invalid_args" })
    // One request each: the first page, and nothing after it.
    expect(requestsFor(replica, "get_blocks")).toHaveLength(2)
  })

  it("stops asking for pages once the read is cancelled", async () => {
    const gate = deferred()
    const replica = replicaWith({
      [ARCHIVE]: blocksCanister(6, () => gate.promise),
    })
    const client = clientAs(replica, alice)
    const ledger = client.canister<archive.Actor>(archive.actor, {
      id: ARCHIVE,
    })
    const walk = client.queryOptions(
      ledger,
      "get_blocks",
      { start: 0n, length: 2n },
      { pages: nextRange }
    )
    const failed = client.queryClient
      .fetchQuery({ ...walk, retry: false })
      .catch((error: unknown) => error)
    await vi.waitFor(() =>
      expect(requestsFor(replica, "get_blocks")).toHaveLength(1)
    )
    await client.queryClient.cancelQueries({ queryKey: walk.queryKey })
    gate.resolve()
    await failed
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(requestsFor(replica, "get_blocks")).toHaveLength(1)
  })

  it("is read again, from the first page, after a write to its canister", async () => {
    let from = 0n
    const replica = replicaWith({
      [SHAPES]: serve<shapes.Actor>(shapes.actor, {
        one: ([n]) => n + from,
        bump: ([n]) => {
          from += n
          return { tag: "ok", value: from }
        },
      }),
    })
    const client = clientAs(replica, alice)
    const canister = client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    const walk = client.queryOptions(canister, "one", 0n, {
      pages: (_page, n) => (n < 2n ? n + 1n : undefined),
    })
    const observer = new QueryObserver(client.queryClient, walk)
    const unsubscribe = observer.subscribe(() => undefined)
    await vi.waitFor(() =>
      expect(observer.getCurrentResult().data).toEqual([0n, 1n, 2n])
    )
    const mutation = new MutationObserver(
      client.queryClient,
      client.mutationOptions(canister, "bump")
    )
    await mutation.mutate(10n)
    await vi.waitFor(() =>
      expect(observer.getCurrentResult().data).toEqual([10n, 11n, 12n])
    )
    unsubscribe()
    expect(requestsFor(replica, "one")).toHaveLength(6)
  })

  it("is skipped with skipToken, and sends nothing", () => {
    const replica = replicaWith({ [ARCHIVE]: blocksCanister(1) })
    const client = clientAs(replica, alice)
    const ledger = client.canister<archive.Actor>(archive.actor, {
      id: ARCHIVE,
    })
    const range = undefined as { start: bigint; length: bigint } | undefined
    const options = client.queryOptions(
      ledger,
      "get_blocks",
      range ?? skipToken,
      { pages: nextRange }
    )
    expect(options.queryFn).toBe(skipToken)
    expect(canisterRequests(replica)).toEqual([])
  })

  it("throws a TypeError for pages that is no function or does not come alone, a method without arguments, and an update", () => {
    const replica = replicaWith({})
    const client = clientAs(replica, alice)
    const canister = client.canister<shapes.Actor>(shapes.actor, { id: SHAPES })
    const pages = () => undefined
    expect(() =>
      // @ts-expect-error pages is a function
      client.queryOptions(canister, "one", 1n, { pages: 2 })
    ).toThrow(/pages comes alone, and is a function/)
    expect(() =>
      // @ts-expect-error pages comes alone
      client.queryOptions(canister, "one", 1n, { pages, update: "idempotent" })
    ).toThrow(/pages comes alone, and is a function/)
    expect(() =>
      // @ts-expect-error a method without arguments has no second page
      client.queryOptions(canister, "who", undefined, { pages })
    ).toThrow(/who takes no arguments, so it has no page after its first/)
    expect(() =>
      // @ts-expect-error an update is no read
      client.queryOptions(canister, "bump", 1n, { pages })
    ).toThrow(/bump is an update method/)
  })
})
