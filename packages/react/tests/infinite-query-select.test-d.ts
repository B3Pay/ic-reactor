/**
 * `select` on an infinite query may return any shape. TanStack Query's
 * `useInfiniteQuery` allows it, and so do `createInfiniteQuery` and
 * `createSuspenseInfiniteQuery`. The infinite query hooks `createActorHooks`
 * returns had no type parameter for the selected data, so `select` had to
 * return `InfiniteData` again. Flattening the pages into one array failed with
 * "Type 'Item[]' is missing the following properties from type
 * 'InfiniteData<...>': pages, pageParams". The raw hooks behind them declared a
 * `Selected` type parameter in their parameters and never used it.
 *
 * Checked by `pnpm typecheck` (tests are in the typecheck project), not by
 * vitest.
 */
import { describe, it, expectTypeOf } from "vitest"
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { InfiniteData } from "@tanstack/react-query"
import type { Reactor } from "@ic-reactor/core"
import type { ActorHooks } from "../src/createActorHooks.js"
import type { DefineReactorResult } from "../src/defineReactor.js"
import { useActorInfiniteQuery } from "../src/hooks/useActorInfiniteQuery.js"
import { useActorSuspenseInfiniteQuery } from "../src/hooks/useActorSuspenseInfiniteQuery.js"

type Item = { id: string; name: string }
type Page = { items: Item[] }

interface Service {
  getItems: ActorMethod<[{ offset: number; limit: number }], Page>
}

declare const reactor: Reactor<Service, "candid">
declare const hooks: ActorHooks<Service, "candid">
declare const defined: DefineReactorResult<
  Service,
  "candid",
  Reactor<Service, "candid">
>

describe("infinite query select can change the data shape", () => {
  it("createActorHooks useActorSuspenseInfiniteQuery", () => {
    const { data } = hooks.useActorSuspenseInfiniteQuery({
      functionName: "getItems",
      getArgs: (offset) => [{ offset, limit: 20 }],
      initialPageParam: 0,
      getNextPageParam: (lastPage, allPages) =>
        lastPage.items.length < 20 ? undefined : allPages.length * 20,
      select: (data) => data.pages.flatMap((page) => page.items),
    })

    expectTypeOf(data).toEqualTypeOf<Item[]>()
    // @ts-expect-error a flat array has no pages
    const _pages = data.pages
  })

  it("createActorHooks useActorInfiniteQuery", () => {
    const { data } = hooks.useActorInfiniteQuery({
      functionName: "getItems",
      getArgs: (offset) => [{ offset, limit: 20 }],
      initialPageParam: 0,
      getNextPageParam: (lastPage, allPages) =>
        lastPage.items.length < 20 ? undefined : allPages.length * 20,
      select: (data) => data.pages.flatMap((page) => page.items),
    })

    expectTypeOf(data).toEqualTypeOf<Item[] | undefined>()
    // @ts-expect-error a flat array has no pages
    const _pages = data?.pages
  })

  it("the hooks defineReactor returns", () => {
    const { data } = defined.useActorSuspenseInfiniteQuery({
      functionName: "getItems",
      getArgs: (offset) => [{ offset, limit: 20 }],
      initialPageParam: 0,
      getNextPageParam: () => undefined,
      select: (data) => data.pages.length,
    })

    expectTypeOf(data).toEqualTypeOf<number>()
  })

  it("the raw hooks, exported as useReactor*InfiniteQuery", () => {
    // These take explicit type arguments, as their own tests do, because
    // `getArgs` cannot infer the argument tuple while `Service` is inferred.
    const { data: count } = useActorSuspenseInfiniteQuery<
      Service,
      "getItems",
      "candid",
      number,
      number
    >({
      reactor,
      functionName: "getItems",
      getArgs: (offset) => [{ offset, limit: 20 }],
      initialPageParam: 0,
      getNextPageParam: () => undefined,
      select: (data) => data.pages.length,
    })
    expectTypeOf(count).toEqualTypeOf<number>()

    const { data: items } = useActorInfiniteQuery<
      Service,
      "getItems",
      "candid",
      number,
      Item[]
    >({
      reactor,
      functionName: "getItems",
      getArgs: (offset) => [{ offset, limit: 20 }],
      initialPageParam: 0,
      getNextPageParam: () => undefined,
      select: (data) => data.pages.flatMap((page) => page.items),
    })
    expectTypeOf(items).toEqualTypeOf<Item[] | undefined>()
    // @ts-expect-error a flat array has no pageParams
    const _pageParams = items?.pageParams
  })

  it("keeps InfiniteData without select, and explicit generics still work", () => {
    const { data } = hooks.useActorSuspenseInfiniteQuery({
      functionName: "getItems",
      getArgs: (offset) => [{ offset, limit: 20 }],
      initialPageParam: 0,
      getNextPageParam: () => undefined,
    })
    expectTypeOf(data).toEqualTypeOf<InfiniteData<Page, number>>()

    const { data: explicit } = hooks.useActorInfiniteQuery<"getItems", number>({
      functionName: "getItems",
      getArgs: (offset) => [{ offset, limit: 20 }],
      initialPageParam: 0,
      getNextPageParam: () => undefined,
    })
    expectTypeOf(explicit).toEqualTypeOf<
      InfiniteData<Page, number> | undefined
    >()
  })
})
