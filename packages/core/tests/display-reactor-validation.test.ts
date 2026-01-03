import { describe, it, expect, beforeAll, vi } from "vitest"
import {
  DisplayReactor,
  ClientManager,
  ValidationError,
  fromZodSchema,
  ValidationResult,
} from "../src"
import { IDL } from "@icp-sdk/core/candid"
import { QueryClient } from "@tanstack/query-core"
import { ActorMethod } from "@icp-sdk/core/agent"
import { Principal } from "@icp-sdk/core/principal"

// Define test actor type - these are CANDID types
interface TestActor {
  get_balance: ActorMethod<[{ owner: Principal }], bigint>
  transfer: ActorMethod<
    [{ to: Principal; amount: bigint }],
    { Ok: bigint } | { Err: string }
  >
  greet: ActorMethod<[string], string>
}

// The IDL factory
const idlFactory: IDL.InterfaceFactory = ({ IDL }) => {
  return IDL.Service({
    get_balance: IDL.Func(
      [IDL.Record({ owner: IDL.Principal })],
      [IDL.Nat],
      ["query"]
    ),
    transfer: IDL.Func(
      [IDL.Record({ to: IDL.Principal, amount: IDL.Nat })],
      [IDL.Variant({ Ok: IDL.Nat, Err: IDL.Text })],
      ["update"]
    ),
    greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]),
  })
}

const canisterId = "rrkah-fqaaa-aaaaa-aaaaq-cai"

describe("DisplayReactor with Validation", () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  const clientManager = new ClientManager({ queryClient })

  beforeAll(async () => {
    await clientManager.initializeAgent()
  })

  describe("basic validation functionality", () => {
    it("should register and check validators", () => {
      const reactor = new DisplayReactor<TestActor>({
        idlFactory,
        canisterId,
        clientManager,
      })

      expect(reactor.hasValidator("transfer")).toBe(false)

      reactor.registerValidator("transfer", () => ({ success: true }))

      expect(reactor.hasValidator("transfer")).toBe(true)

      reactor.unregisterValidator("transfer")

      expect(reactor.hasValidator("transfer")).toBe(false)
    })

    it("should accept initial validators in config", () => {
      const reactor = new DisplayReactor<TestActor>({
        idlFactory,
        canisterId,
        clientManager,
        validators: {
          transfer: () => ({ success: true }),
          greet: () => ({ success: true }),
        },
      })

      expect(reactor.hasValidator("transfer")).toBe(true)
      expect(reactor.hasValidator("greet")).toBe(true)
      expect(reactor.hasValidator("get_balance")).toBe(false)
    })
  })

  describe("validation with display types", () => {
    it("should validate display types (strings, not Principal/bigint)", async () => {
      const reactor = new DisplayReactor<TestActor>({
        idlFactory,
        canisterId,
        clientManager,
      })

      // Validator receives display types
      // input.to is string (not Principal)
      // input.amount is string (not bigint)
      reactor.registerValidator("transfer", ([input]) => {
        const issues: { path: string[]; message: string }[] = []

        // Validate as string
        if (!input.to || input.to.length === 0) {
          issues.push({ path: ["to"], message: "Recipient is required" })
        }

        // Validate as string (display type for bigint)
        if (!input.amount || !/^\d+$/.test(input.amount as string)) {
          issues.push({
            path: ["amount"],
            message: "Amount must be a valid number",
          })
        }

        return issues.length > 0
          ? { success: false, issues }
          : { success: true }
      })

      // Test with display types (strings)
      const validResult = await reactor.validate("transfer", [
        { to: "rrkah-fqaaa-aaaaa-aaaaq-cai", amount: "100" }, // strings!
      ])
      expect(validResult.success).toBe(true)

      // Test with invalid display types
      const invalidResult = await reactor.validate("transfer", [
        { to: "", amount: "not-a-number" },
      ])
      expect(invalidResult.success).toBe(false)
      if (!invalidResult.success) {
        expect(invalidResult.issues).toHaveLength(2)
      }
    })

    it("should throw ValidationError when validation fails in callMethod", async () => {
      const reactor = new DisplayReactor<TestActor>({
        idlFactory,
        canisterId,
        clientManager,
      })

      reactor.registerValidator("transfer", ([input]) => {
        if (!/^\d+$/.test(input.amount as string)) {
          return {
            success: false,
            issues: [{ path: ["amount"], message: "Must be a valid number" }],
          }
        }
        return { success: true }
      })

      // Mock the executeCall
      vi.spyOn(reactor as any, "executeCall").mockResolvedValue(
        new Uint8Array()
      )

      await expect(
        reactor.callMethod({
          functionName: "transfer",
          args: [{ to: "rrkah-fqaaa-aaaaa-aaaaq-cai", amount: "invalid" }],
        })
      ).rejects.toThrow(ValidationError)
    })

    it("should pass valid arguments through transformation and call", async () => {
      const reactor = new DisplayReactor<TestActor>({
        idlFactory,
        canisterId,
        clientManager,
      })

      reactor.registerValidator("greet", ([name]) => {
        if (!name || name.length === 0) {
          return {
            success: false,
            issues: [{ path: ["name"], message: "Name is required" }],
          }
        }
        return { success: true }
      })

      // Mock the executeQuery
      const mockExecuteQuery = vi
        .spyOn(reactor as any, "executeQuery")
        .mockResolvedValue(IDL.encode([IDL.Text], ["Hello, World!"]))

      const result = await reactor.callMethod({
        functionName: "greet",
        args: ["World"],
      })

      expect(mockExecuteQuery).toHaveBeenCalled()
      expect(result).toBe("Hello, World!")
    })
  })

  describe("async validation support", () => {
    it("should support async validators with callMethodWithValidation", async () => {
      const reactor = new DisplayReactor<TestActor>({
        idlFactory,
        canisterId,
        clientManager,
      })

      let asyncCheckCalled = false
      reactor.registerValidator("transfer", async ([input]) => {
        asyncCheckCalled = true
        await new Promise((resolve) => setTimeout(resolve, 10))

        if (input.to === "blocked-address") {
          return {
            success: false,
            issues: [{ path: ["to"], message: "This address is blocked" }],
          }
        }
        return { success: true }
      })

      await expect(
        reactor.callMethodWithValidation({
          functionName: "transfer",
          args: [{ to: "blocked-address", amount: "100" }],
        })
      ).rejects.toThrow(ValidationError)

      expect(asyncCheckCalled).toBe(true)
    })
  })

  describe("form validation pattern", () => {
    it("should validate Principal format using display types", async () => {
      const reactor = new DisplayReactor<TestActor>({
        idlFactory,
        canisterId,
        clientManager,
      })

      const isValidPrincipal = (str: string) => {
        try {
          Principal.fromText(str)
          return true
        } catch {
          return false
        }
      }

      reactor.registerValidator("transfer", ([input]) => {
        const issues: { path: string[]; message: string }[] = []

        if (!input.to) {
          issues.push({ path: ["to"], message: "Recipient is required" })
        } else if (!isValidPrincipal(input.to)) {
          issues.push({ path: ["to"], message: "Invalid Principal format" })
        }

        const amount = input.amount as string
        if (!amount || !/^\d+$/.test(amount)) {
          issues.push({
            path: ["amount"],
            message: "Amount must be a positive number",
          })
        }

        return issues.length > 0
          ? { success: false, issues }
          : { success: true }
      })

      // Test with invalid Principal format
      const invalidResult = await reactor.validate("transfer", [
        { to: "not-a-valid-principal", amount: "100" },
      ])
      expect(invalidResult.success).toBe(false)
      if (!invalidResult.success) {
        expect(invalidResult.issues[0].message).toContain("Principal")
      }

      // Test with valid inputs
      const validResult = await reactor.validate("transfer", [
        { to: "rrkah-fqaaa-aaaaa-aaaaq-cai", amount: "100" },
      ])
      expect(validResult.success).toBe(true)
    })
  })

  describe("fromZodSchema helper", () => {
    it("should create a validator from a Zod-like schema", () => {
      const mockSchema = {
        safeParse: (data: unknown) => {
          const input = data as { to: string; amount: string }
          const issues: Array<{ path: (string | number)[]; message: string }> =
            []

          if (!input.to) {
            issues.push({ path: ["to"], message: "Recipient is required" })
          }
          if (!/^\d+$/.test(input.amount)) {
            issues.push({
              path: ["amount"],
              message: "Amount must be a number",
            })
          }

          return issues.length > 0
            ? { success: false, error: { issues } }
            : { success: true }
        },
      }

      const validator = fromZodSchema(mockSchema)

      const validResult = validator([
        { to: "someone", amount: "100" },
      ]) as ValidationResult
      expect(validResult.success).toBe(true)

      const invalidResult = validator([
        { to: "", amount: "invalid" },
      ]) as ValidationResult
      expect(invalidResult.success).toBe(false)
      if (!invalidResult.success) {
        expect(invalidResult.issues).toHaveLength(2)
      }
    })
  })

  describe("ValidationError", () => {
    it("should have correct properties", () => {
      const error = new ValidationError("transfer", [
        { path: ["to"], message: "Recipient is required" },
        { path: ["amount"], message: "Amount must be positive" },
      ])

      expect(error.name).toBe("ValidationError")
      expect(error.methodName).toBe("transfer")
      expect(error.issues).toHaveLength(2)
      expect(error.message).toContain("transfer")
    })

    it("should support getIssuesForPath and hasErrorForPath", () => {
      const error = new ValidationError("transfer", [
        { path: ["to"], message: "Recipient is required" },
        { path: ["amount"], message: "Amount must be positive" },
        { path: ["amount"], message: "Amount must be a number" },
      ])

      expect(error.getIssuesForPath("to")).toHaveLength(1)
      expect(error.getIssuesForPath("amount")).toHaveLength(2)
      expect(error.hasErrorForPath("to")).toBe(true)
      expect(error.hasErrorForPath("unknown")).toBe(false)
    })
  })
})
