import { describe, it, expect } from "vitest"
import {
  toPascalCase,
  toCamelCase,
  getHookFileName,
  getHookExportName,
  getReactHookName,
  getReactorName,
  getServiceTypeName,
} from "./naming"

describe("Naming Utilities", () => {
  describe("Base Conversions", () => {
    it("converts to PascalCase", () => {
      expect(toPascalCase("get_user")).toBe("GetUser")
      expect(toPascalCase("my-canister")).toBe("MyCanister")
      expect(toPascalCase("list_items_v2")).toBe("ListItemsV2")
    })

    it("converts to camelCase", () => {
      expect(toCamelCase("get_user")).toBe("getUser")
      expect(toCamelCase("my-canister")).toBe("myCanister")
      expect(toCamelCase("ListItems")).toBe("listItems")
    })
  })

  describe("Domain-Specific Naming", () => {
    it("generates hook file names", () => {
      expect(getHookFileName("get_user", "query")).toBe("getUserQuery.ts")
      expect(getHookFileName("update_item", "mutation")).toBe(
        "updateItemMutation.ts"
      )
    })

    it("generates hook export names", () => {
      expect(getHookExportName("get_user", "query")).toBe("getUserQuery")
      expect(getHookExportName("update_item", "mutation")).toBe(
        "updateItemMutation"
      )
    })

    it("generates React hook names", () => {
      expect(getReactHookName("get_user", "query")).toBe("useGetUserQuery")
      expect(getReactHookName("update_item", "mutation")).toBe(
        "useUpdateItemMutation"
      )
    })

    it("generates reactor names", () => {
      expect(getReactorName("backend")).toBe("backendReactor")
      expect(getReactorName("my-canister")).toBe("myCanisterReactor")
    })

    it("generates service type names", () => {
      expect(getServiceTypeName("backend")).toBe("BackendService")
      expect(getServiceTypeName("my-canister")).toBe("MyCanisterService")
    })
  })
})
