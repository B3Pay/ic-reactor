/**
 * `invalidateQueries` takes a query key, a query object or query factory, or
 * a `{ functionName, args? }` method of the mutation's own reactor, with the
 * method name and its args checked against the service. The four query
 * factories are still plain callables and also carry `getQueryKey()` and
 * `invalidate()`.
 *
 * Checked by `pnpm typecheck` (tests are in the typecheck project), not by
 * vitest.
 */
import { describe, it, expectTypeOf } from "vitest"
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { QueryKey } from "@tanstack/react-query"
import type { DisplayReactor, Reactor } from "@ic-reactor/core"
import type { ActorHooks } from "../src/createActorHooks.js"
import { createQuery, createQueryFactory } from "../src/createQuery.js"
import {
  createSuspenseQuery,
  createSuspenseQueryFactory,
} from "../src/createSuspenseQuery.js"
import {
  createInfiniteQuery,
  createInfiniteQueryFactory,
} from "../src/createInfiniteQuery.js"
import { createSuspenseInfiniteQueryFactory } from "../src/createSuspenseInfiniteQuery.js"
import { createMutation } from "../src/createMutation.js"
import { useActorMutation } from "../src/hooks/useActorMutation.js"
import { useActorMethod } from "../src/hooks/useActorMethod.js"
import type {
  InvalidationTarget,
  QueryDescriptor,
  QueryError,
  QueryResult,
} from "../src/types.js"

interface Service {
  get_post: ActorMethod<[string], string>
  get_posts: ActorMethod<[bigint, bigint], string[]>
  get_count: ActorMethod<[], bigint>
  create_post: ActorMethod<[string], boolean>
}

declare const reactor: Reactor<Service>
declare const display: DisplayReactor<Service>
declare const hooks: ActorHooks<Service, "candid">

const countQuery = createQuery(reactor, { functionName: "get_count" })
const countSuspenseQuery = createSuspenseQuery(reactor, {
  functionName: "get_count",
})
const postsQuery = createInfiniteQuery(reactor, {
  functionName: "get_posts",
  initialPageParam: 0n,
  getArgs: (offset): [bigint, bigint] => [offset, 10n],
  getNextPageParam: () => null,
})
const getPost = createQueryFactory(reactor, { functionName: "get_post" })
const getPostSuspense = createSuspenseQueryFactory(reactor, {
  functionName: "get_post",
})
const getPosts = createInfiniteQueryFactory(reactor, {
  functionName: "get_posts",
  initialPageParam: 0n,
  getNextPageParam: () => null,
})
const getPostsSuspense = createSuspenseInfiniteQueryFactory(reactor, {
  functionName: "get_posts",
  initialPageParam: 0n,
  getNextPageParam: () => null,
})

describe("invalidateQueries entries", () => {
  it("takes keys, query objects, factories, descriptors and undefined", () => {
    createMutation(reactor, {
      functionName: "create_post",
      invalidateQueries: [
        countQuery.getQueryKey(),
        countQuery,
        countSuspenseQuery,
        postsQuery,
        getPost,
        getPost(["a"]),
        getPostSuspense,
        getPosts,
        getPostsSuspense,
        { functionName: "get_count" },
        { functionName: "get_post", args: ["a"] },
        { functionName: "get_posts", args: [0n, 10n] },
        undefined,
      ],
    })
  })

  it("checks a descriptor's method name against the service", () => {
    createMutation(reactor, {
      functionName: "create_post",
      // @ts-expect-error no such method
      invalidateQueries: [{ functionName: "get_postz" }],
    })
  })

  it("checks a descriptor's args against its method", () => {
    createMutation(reactor, {
      functionName: "create_post",
      // @ts-expect-error get_post takes a string
      invalidateQueries: [{ functionName: "get_post", args: [1n] }],
    })
    createMutation(reactor, {
      functionName: "create_post",
      // @ts-expect-error get_posts takes two nats, not get_post's string
      invalidateQueries: [{ functionName: "get_posts", args: ["a"] }],
    })
  })

  it("rejects an object that is neither a key source nor a descriptor", () => {
    createMutation(reactor, {
      functionName: "create_post",
      // @ts-expect-error not a query key, query object or descriptor
      invalidateQueries: [{ queryKey: ["get_posts"] }],
    })
  })

  it("types a DisplayReactor descriptor's args in display form", () => {
    createMutation(display, {
      functionName: "create_post",
      invalidateQueries: [{ functionName: "get_posts", args: ["0", "10"] }],
    })
    createMutation(display, {
      functionName: "create_post",
      // @ts-expect-error display args of a nat are strings
      invalidateQueries: [{ functionName: "get_posts", args: [0n, 10n] }],
    })
  })

  it("is typed the same on useMutation(), the hooks and the bound hooks", () => {
    const mutation = createMutation(reactor, { functionName: "create_post" })
    mutation.useMutation({
      invalidateQueries: [getPost, { functionName: "get_count" }],
    })
    mutation.useMutation({
      // @ts-expect-error no such method
      invalidateQueries: [{ functionName: "nope" }],
    })

    useActorMutation({
      reactor,
      functionName: "create_post",
      invalidateQueries: [getPost, { functionName: "get_post", args: ["a"] }],
    })
    useActorMutation({
      reactor,
      functionName: "create_post",
      // @ts-expect-error get_post takes a string
      invalidateQueries: [{ functionName: "get_post", args: [1] }],
    })

    useActorMethod({
      reactor,
      functionName: "create_post",
      invalidateQueries: [countQuery, { functionName: "get_count" }],
    })

    hooks.useActorMutation({
      functionName: "create_post",
      invalidateQueries: [{ functionName: "get_posts" }, postsQuery],
    })
    hooks.useActorMethod({
      functionName: "create_post",
      // @ts-expect-error no such method
      invalidateQueries: [{ functionName: "nope" }],
    })
  })

  it("resolves the descriptor union per method", () => {
    expectTypeOf<QueryDescriptor<Service>>().toEqualTypeOf<
      | { functionName: "get_post"; args?: [string] }
      | { functionName: "get_posts"; args?: [bigint, bigint] }
      | { functionName: "get_count"; args?: [] }
      | { functionName: "create_post"; args?: [string] }
    >()
    expectTypeOf<undefined>().toMatchTypeOf<InvalidationTarget<Service>>()
  })
})

describe("query factory functions", () => {
  it("carry getQueryKey() and invalidate()", () => {
    for (const factory of [
      getPost,
      getPostSuspense,
      getPosts,
      getPostsSuspense,
    ]) {
      expectTypeOf(factory.getQueryKey()).toEqualTypeOf<QueryKey>()
      expectTypeOf(factory.invalidate()).toEqualTypeOf<Promise<void>>()
    }
  })

  it("stay assignable to the bare function type they had", () => {
    // What createQueryFactory was declared to return before.
    const bare: (
      args: [string]
    ) => QueryResult<string, string, QueryError<Service, "get_post">> = getPost
    void bare
    expectTypeOf(getPost(["a"]).getCacheData()).toEqualTypeOf<
      string | undefined
    >()
  })
})
