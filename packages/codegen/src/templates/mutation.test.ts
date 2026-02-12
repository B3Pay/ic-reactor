import { describe, it, expect } from "vitest"
import { generateMutationHook, MutationHookOptions } from "./mutation"
import type { MethodInfo } from "../types"

describe("Mutation Hook Generation", () => {
  const methodWithArgs: MethodInfo = {
    name: "create_item",
    type: "mutation",
    hasArgs: true,
  }

  const methodNoArgs: MethodInfo = {
    name: "init_system",
    type: "mutation",
    hasArgs: false,
  }

  it("generates hook correctly for mutation with args", () => {
    const options: MutationHookOptions = {
      canisterName: "my_canister",
      method: methodWithArgs,
    }
    const result = generateMutationHook(options)
    expect(result).toMatchSnapshot()
    expect(result).toContain("createMutation(myCanisterReactor, {")
    expect(result).toContain(
      "export const useCreateItemMutation = createItemMutation.useMutation"
    )
  })

  it("generates hook correctly for mutation without args", () => {
    const options: MutationHookOptions = {
      canisterName: "my_canister",
      method: methodNoArgs,
    }
    const result = generateMutationHook(options)
    expect(result).toMatchSnapshot()
    expect(result).toContain("createMutation(myCanisterReactor, {")
    expect(result).toContain(
      "export const executeInitSystem = initSystemMutation.execute"
    )
  })
})
