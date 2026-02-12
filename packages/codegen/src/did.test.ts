import { describe, it, expect } from "vitest"
import { extractMethods, formatMethodForDisplay } from "./did"
import type { MethodInfo } from "./types"

describe("DID Utilities", () => {
  describe("extractMethods", () => {
    it("extracts query methods", () => {
      const didContent = `
      type User = record { name : text; age : nat };
      type Item = record { name : text; price : nat };

      service : {
        get_user: (nat) -> (opt User) query;
        list_items: () -> (vec Item) query;
      }`
      const methods = extractMethods(didContent)
      expect(methods).toHaveLength(2)
      expect(methods[0]).toMatchObject({
        name: "get_user",
        type: "query",
        hasArgs: true,
      })
      expect(methods[1]).toMatchObject({
        name: "list_items",
        type: "query",
        hasArgs: false,
      })
    })

    it("extracts mutation (update) methods", () => {
      const didContent = `service : {
        create_user: (User) -> (Result);
        update_item: (nat, Item) -> (Result);
      }`
      const methods = extractMethods(didContent)
      expect(methods).toHaveLength(2)
      expect(methods[0]).toMatchObject({
        name: "create_user",
        type: "mutation",
        hasArgs: true,
      })
      expect(methods[1]).toMatchObject({
        name: "update_item",
        type: "mutation",
        hasArgs: true,
      })
    })

    it("handles composite_query as query", () => {
      const didContent = `service : {
        search: (text) -> (vec Item) composite_query;
      }`
      const methods = extractMethods(didContent)
      expect(methods[0].type).toBe("query")
    })

    it("ignores comments", () => {
      const didContent = `service : {
        // This is a comment
        get_data: () -> (text) query;
        /* create_data: (text) -> (); */
      }`
      const methods = extractMethods(didContent)
      expect(methods).toHaveLength(1)
      expect(methods[0].name).toBe("get_data")
    })

    it("extracts argument and return types correctly", () => {
      const didContent = `service : {
        weird_method: (record { foo: text; bar: nat }) -> (variant { Ok: null; Err: text }) query;
      }`
      const methods = extractMethods(didContent)
      expect(methods[0].name).toBe("weird_method")
      expect(methods[0].argsDescription).toContain(
        "record { foo: text; bar: nat }"
      )
      expect(methods[0].returnDescription).toContain(
        "variant { Ok: null; Err: text }"
      )
    })
  })

  describe("formatMethodForDisplay", () => {
    it("formats query method with args", () => {
      const method: MethodInfo = {
        name: "search",
        type: "query",
        hasArgs: true,
      }
      expect(formatMethodForDisplay(method)).toBe("search (query, with args)")
    })

    it("formats update method without args", () => {
      const method: MethodInfo = {
        name: "init",
        type: "mutation",
        hasArgs: false,
      }
      expect(formatMethodForDisplay(method)).toBe("init (update, no args)")
    })
  })
})
