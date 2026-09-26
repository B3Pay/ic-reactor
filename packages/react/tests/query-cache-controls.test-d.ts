/**
 * A query object's `optimisticUpdate` updater gets and returns the query's raw
 * (pre-`select`) data type, with no `any`, and its rollback reaches the
 * mutation's `onError` typed. `cancel()` and `reset()` return promises.
 *
 * Checked by `pnpm typecheck` (tests are in the typecheck project), not by
 * vitest.
 */
import { describe, it, expectTypeOf } from "vitest"
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { InfiniteData } from "@tanstack/react-query"
import type { DisplayReactor, Reactor } from "@ic-reactor/core"
import { createQuery, createQueryFactory } from "../src/createQuery.js"
import {
  createSuspenseQuery,
  createSuspenseQueryFactory,
} from "../src/createSuspenseQuery.js"
import { createInfiniteQuery } from "../src/createInfiniteQuery.js"
import { createSuspenseInfiniteQuery } from "../src/createSuspenseInfiniteQuery.js"
import { createMutation } from "../src/createMutation.js"
import type { OptimisticRollback } from "../src/types.js"

interface Post {
  title: string
  likes: bigint
}

interface Service {
  get_post: ActorMethod<[string], Post>
  get_titles: ActorMethod<[bigint], string[]>
  like_post: ActorMethod<[string], bigint>
}

declare const reactor: Reactor<Service>
declare const display: DisplayReactor<Service>

describe("optimisticUpdate", () => {
  it("types the updater with the raw data, even under select", () => {
    const titleQuery = createQuery(reactor, {
      functionName: "get_post",
      args: ["a"],
      select: (post) => post.title,
    })
    const update = titleQuery.optimisticUpdate((post) => {
      expectTypeOf(post).toEqualTypeOf<Post>()
      return { ...post, likes: post.likes + 1n }
    })
    expectTypeOf(update).toEqualTypeOf<Promise<OptimisticRollback>>()

    // @ts-expect-error the updater returns raw data, not the selected title
    void titleQuery.optimisticUpdate((post) => post.title)
  })

  it("is typed on suspense queries and factory instances", () => {
    const suspense = createSuspenseQuery(reactor, {
      functionName: "get_post",
      args: ["a"],
    })
    void suspense.optimisticUpdate((post) => {
      expectTypeOf(post).toEqualTypeOf<Post>()
      return post
    })

    const getPost = createQueryFactory(reactor, { functionName: "get_post" })
    const getPostSuspense = createSuspenseQueryFactory(reactor, {
      functionName: "get_post",
    })
    void getPost(["a"]).optimisticUpdate((post) => post)
    void getPostSuspense(["a"]).optimisticUpdate((post) => post)
    // @ts-expect-error likes is a bigint
    void getPost(["a"]).optimisticUpdate((post) => ({ ...post, likes: 1 }))
  })

  it("uses the display form of a DisplayReactor query", () => {
    const post = createQuery(display, { functionName: "get_post", args: ["a"] })
    void post.optimisticUpdate((old) => {
      expectTypeOf(old.likes).toEqualTypeOf<string>()
      return { ...old, likes: "11" }
    })
  })

  it("gets the pages of an infinite query", () => {
    const titles = createInfiniteQuery(reactor, {
      functionName: "get_titles",
      initialPageParam: 0n,
      getArgs: (page): [bigint] => [page],
      getNextPageParam: () => null,
    })
    void titles.optimisticUpdate((data) => {
      expectTypeOf(data).toEqualTypeOf<InfiniteData<string[], bigint>>()
      return data
    })

    const suspenseTitles = createSuspenseInfiniteQuery(reactor, {
      functionName: "get_titles",
      initialPageParam: 0n,
      getArgs: (page): [bigint] => [page],
      getNextPageParam: () => null,
    })
    void suspenseTitles.optimisticUpdate((data) => {
      expectTypeOf(data).toEqualTypeOf<InfiniteData<string[], bigint>>()
      return data
    })
    // @ts-expect-error an infinite query holds pages, not one page
    void suspenseTitles.optimisticUpdate((data) => data.pages[0])
  })

  it("hands the rollback to the mutation's onError", () => {
    const getPost = createQueryFactory(reactor, { functionName: "get_post" })
    const likePost = createMutation(reactor, { functionName: "like_post" })

    likePost.useMutation({
      onMutate: ([postId]) =>
        getPost([postId]).optimisticUpdate((post) => ({
          ...post,
          likes: post.likes + 1n,
        })),
      onError: (_error, _args, update) => {
        expectTypeOf(update).toEqualTypeOf<OptimisticRollback | undefined>()
        update?.rollback()
      },
      onSettled: (_data, _error, [postId]) => getPost([postId]).invalidate(),
    })
  })
})

describe("cancel and reset", () => {
  it("return promises on every query object", () => {
    const post = createQuery(reactor, { functionName: "get_post", args: ["a"] })
    const titles = createSuspenseInfiniteQuery(reactor, {
      functionName: "get_titles",
      initialPageParam: 0n,
      getArgs: (page): [bigint] => [page],
      getNextPageParam: () => null,
    })
    expectTypeOf(post.cancel()).toEqualTypeOf<Promise<void>>()
    expectTypeOf(post.reset()).toEqualTypeOf<Promise<void>>()
    expectTypeOf(titles.cancel()).toEqualTypeOf<Promise<void>>()
    expectTypeOf(titles.reset()).toEqualTypeOf<Promise<void>>()
  })
})
