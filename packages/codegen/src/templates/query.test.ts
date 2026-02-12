import { describe, it, expect } from "vitest"
import { generateQueryHook, QueryHookOptions } from "./query"
import type { MethodInfo } from "../types"

describe("Query Hook Generation", () => {
  const methodWithArgs: MethodInfo = {
    name: "get_user",
    type: "query",
    hasArgs: true,
  }

  const methodNoArgs: MethodInfo = {
    name: "list_items",
    type: "query",
    hasArgs: false,
  }

  it("generates hook for query with arguments (factory)", () => {
    const options: QueryHookOptions = {
      canisterName: "my_canister",
      method: methodWithArgs,
    }
    expect(generateQueryHook(options)).toMatchSnapshot()
  })

  it("generates hook for query without arguments (static)", () => {
    const options: QueryHookOptions = {
      canisterName: "my_canister",
      method: methodNoArgs,
    }
    expect(generateQueryHook(options)).toMatchSnapshot()
  })

  it("generates suspense hooks correctly", () => {
    const options: QueryHookOptions = {
      canisterName: "my_canister",
      method: methodWithArgs,
      type: "suspenseQuery",
    }
    const result = generateQueryHook(options)
    expect(result).toMatchSnapshot()
    expect(result).toContain("createSuspenseQueryFactory")
  })
})
