import { describe, it, expect } from "vitest"
import {
  toPascalCase,
  toCamelCase,
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
    it("generates reactor names", () => {
      expect(getReactorName("backend")).toBe("backendReactor")
      expect(getReactorName("my-canister")).toBe("myCanisterReactor")
    })

    it("generates service type names", () => {
      expect(getServiceTypeName("backend")).toBe("BackendService")
      expect(getServiceTypeName("update_item")).toBe("UpdateItemService")
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
