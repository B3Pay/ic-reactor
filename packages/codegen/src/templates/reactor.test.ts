import { describe, it, expect } from "vitest"
import { generateReactorFile } from "./reactor"
import type { ReactorGeneratorOptions } from "../types"

describe("Reactor File Generation", () => {
  const baseOptions: ReactorGeneratorOptions = {
    canisterName: "my_canister",
    canisterConfig: {
      didFile: "path/to/my_canister.did",
      outDir: "src/declarations/my_canister",
      clientManagerPath: "../../client",
    },
    hasDeclarations: true,
  }

  describe("Simple Mode", () => {
    it("generates correctly", () => {
      const result = generateReactorFile(baseOptions)
      expect(result).toMatchSnapshot()
    })

    it("uses default client path if not provided", () => {
      const options = { ...baseOptions, canisterConfig: { didFile: "foo.did" } }
      const result = generateReactorFile(options)
      expect(result).toContain(
        'import { clientManager } from "../../lib/client"'
      )
    })
  })

  describe("Advanced Mode", () => {
    it("generates per-method hooks correctly", () => {
      const didContent = `service : {
        get_user: (nat) -> (opt User) query;
        list_items: () -> (vec Item) query;
        create_item: (Item) -> (Result);
        update_status: () -> (Result); // No args mutation
      }`

      const options: ReactorGeneratorOptions = {
        ...baseOptions,
        advanced: true,
        didContent,
      }

      const result = generateReactorFile(options)
      expect(result).toMatchSnapshot()
      // Should include static query creation for no-arg method
      expect(result).toContain(
        "export const listItemsQuery = createQuery(myCanisterReactor, {"
      )
      // Should handle mutation
      expect(result).toContain(
        "export const updateStatusMutation = createMutation(myCanisterReactor, {"
      )
      // Should NOT handle methods with args
      expect(result).not.toContain("export const getUserQuery = createQuery")
      expect(result).not.toContain(
        "export const createItemMutation = createMutation"
      )
    })
  })

  describe("Fallback Mode", () => {
    it("generates correctly without declarations", () => {
      const options: ReactorGeneratorOptions = {
        ...baseOptions,
        hasDeclarations: false,
      }
      const result = generateReactorFile(options)
      expect(result).toMatchSnapshot()

      expect(result).toContain(
        "type MyCanisterService = Record<string, (...args: unknown[]) => Promise<unknown>>"
      )
    })
  })
})
