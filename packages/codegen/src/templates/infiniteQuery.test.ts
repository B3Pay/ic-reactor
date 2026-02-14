import { describe, it, expect } from "vitest"
import {
  generateInfiniteQueryHook,
  InfiniteQueryHookOptions,
} from "./infiniteQuery"
import type { MethodInfo } from "../types"

describe("Infinite Query Hook Generation", () => {
  const listItems: MethodInfo = {
    name: "list_items",
    type: "query",
    hasArgs: true,
  }

  it("generates infinite query hook correctly", () => {
    const options: InfiniteQueryHookOptions = {
      canisterName: "my_canister",
      method: listItems,
      type: "infiniteQuery",
    }
    const result = generateInfiniteQueryHook(options)
    expect(result).toMatchSnapshot()
    expect(result).toContain("createInfiniteQuery(myCanisterReactor, {")
    expect(result).toContain(
      "export const useListItemsInfiniteQuery = listItemsInfiniteQuery.useInfiniteQuery"
    )
    // Should contain default pagination logic placeholders
    expect(result).toContain("initialPageParam: 0 as PageCursor")
  })

  it("handles suspense infinite query type", () => {
    const options: InfiniteQueryHookOptions = {
      canisterName: "my_canister",
      method: listItems,
      type: "suspenseInfiniteQuery",
    }
    const result = generateInfiniteQueryHook(options)
    expect(result).toContain(
      "export const useListItemsSuspenseInfiniteQuery = listItemsSuspenseInfiniteQuery.useInfiniteQuery"
    )
  })
})
