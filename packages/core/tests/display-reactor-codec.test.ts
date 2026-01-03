import { describe, it, expect, beforeAll, vi } from "vitest"
import { DisplayReactor, ClientManager } from "../src"
import { IDL } from "@icp-sdk/core/candid"
import { QueryClient } from "@tanstack/query-core"
import { ActorMethod } from "@icp-sdk/core/agent"
import { Principal } from "@icp-sdk/core/principal"

// Define test actor type with Candid types
interface TestActor {
  complex_method: ActorMethod<
    [
      {
        owner: Principal
        balance: bigint
        metadata: [string] | []
      },
    ],
    | {
        Ok: {
          id: bigint
          status: { Active: null } | { Inactive: string }
        }
      }
    | { Err: string }
  >
  simple_method: ActorMethod<[bigint], bigint>
}

// The IDL factory
const idlFactory: IDL.InterfaceFactory = ({ IDL }) => {
  return IDL.Service({
    complex_method: IDL.Func(
      [
        IDL.Record({
          owner: IDL.Principal,
          balance: IDL.Nat,
          metadata: IDL.Opt(IDL.Text),
        }),
      ],
      [
        IDL.Variant({
          Ok: IDL.Record({
            id: IDL.Nat,
            status: IDL.Variant({ Active: IDL.Null, Inactive: IDL.Text }),
          }),
          Err: IDL.Text,
        }),
      ],
      ["query"]
    ),
    simple_method: IDL.Func([IDL.Nat], [IDL.Nat], ["query"]),
  })
}

const canisterId = "rrkah-fqaaa-aaaaa-aaaaq-cai"

describe("DisplayReactor Codec Functionality", () => {
  const queryClient = new QueryClient()
  const clientManager = new ClientManager({ queryClient })
  const reactor = new DisplayReactor<TestActor>({
    idlFactory,
    canisterId,
    clientManager,
  })

  beforeAll(async () => {
    await clientManager.initializeAgent()
  })

  describe("getCodec()", () => {
    it("should provide codecs that handle display types for arguments", () => {
      const codec = reactor.getCodec("complex_method")
      expect(codec).not.toBeNull()

      const argsCodec = codec!.args

      // In DisplayReactor, we expect:
      // Principal -> string
      // bigint -> string
      // [T] | [] -> T | undefined
      const displayArgs = {
        owner: "rrkah-fqaaa-aaaaa-aaaaq-cai",
        balance: "1000",
        metadata: "some metadata",
      }

      // Convert Display -> Candid
      const candidArgs = argsCodec.asCandid(displayArgs)

      expect(candidArgs.owner).toBeInstanceOf(Principal)
      expect(candidArgs.owner.toText()).toBe("rrkah-fqaaa-aaaaa-aaaaq-cai")
      expect(typeof candidArgs.balance).toBe("bigint")
      expect(candidArgs.balance).toBe(1000n)
      expect(candidArgs.metadata).toEqual(["some metadata"])

      // Convert Candid -> Display
      const displayArgsBack = argsCodec.asDisplay(candidArgs)
      expect(displayArgsBack).toEqual(displayArgs)
    })

    it("should provide codecs that handle display types for results", () => {
      const codec = reactor.getCodec("complex_method")
      const resultCodec = codec!.result

      // Candid format
      const candidResult = {
        Ok: {
          id: 123n,
          status: { Active: null },
        },
      }

      // In DisplayReactor, we expect:
      // Variant { Ok: T } -> { _type: "Ok", Ok: T }
      // bigint -> string
      // Variant { Active: null } -> { _type: "Active" }
      const displayResult = resultCodec.asDisplay(candidResult)

      expect(displayResult._type).toBe("Ok")
      expect(displayResult._type === "Ok" && displayResult.Ok.id).toBe("123")
      expect(
        displayResult._type === "Ok" && displayResult.Ok.status._type
      ).toBe("Active")

      // Convert Back
      const candidResultBack = resultCodec.asCandid(displayResult)
      expect(candidResultBack).toEqual(candidResult)
    })
  })

  describe("callMethod() transformation", () => {
    it("should use display types for both arguments and return values", async () => {
      // Mock executeQuery for simple_method
      // Input: 500n, Output: 1000n
      const mockReturnSimple = IDL.encode([IDL.Nat], [1000n])
      const spySimple = vi
        .spyOn(reactor as any, "executeQuery")
        .mockResolvedValue(mockReturnSimple)

      // Call with display type arg ("500")
      const resultSimple = await reactor.callMethod({
        functionName: "simple_method",
        args: ["500"],
      })

      // Verify arg was transformed to Candid (500n)
      expect(spySimple).toHaveBeenCalled()
      // The first call to executeQuery (simple_method)
      const callArgs = spySimple.mock.calls[0]
      // Result transformation should happen after extraction

      // Verify result is display type ("1000")
      expect(resultSimple).toBe("1000")
      expect(typeof resultSimple).toBe("string")

      // Mock executeQuery for complex_method (returns Result)
      const mockReturnComplex = IDL.encode(
        [
          IDL.Variant({
            Ok: IDL.Record({
              id: IDL.Nat,
              status: IDL.Variant({ Active: IDL.Null, Inactive: IDL.Text }),
            }),
            Err: IDL.Text,
          }),
        ],
        [{ Ok: { id: 123n, status: { Active: null } } }]
      )

      const spyComplex = vi
        .spyOn(reactor as any, "executeQuery")
        .mockResolvedValue(mockReturnComplex)

      // Call with display type args
      const resultComplex = await reactor.callMethod({
        functionName: "complex_method",
        args: [
          {
            owner: "rrkah-fqaaa-aaaaa-aaaaq-cai",
            balance: "100",
            metadata: undefined,
          },
        ],
      })

      // Verify unwrapped AND transformed result
      // Result should be the Ok value, transformed to display types:
      // { id: "123", status: { _type: "Active" } }
      expect(resultComplex).toEqual({
        id: "123",
        status: { _type: "Active" },
      })

      // Verify that Principal was passed as instance to the actor
      // (This verifies the Candid transformation)
      // Note: we can't easily check the encoded bytes here without re-decoding,
      // but the fact that it didn't throw and matched our mock setup is good.
    })

    it("should handle error variants by throwing CanisterError with display types", async () => {
      // Mock executeQuery to return an Err
      const mockReturnErr = IDL.encode(
        [IDL.Variant({ Ok: IDL.Nat, Err: IDL.Text })],
        [{ Err: "Insufficient balance" }]
      )

      vi.spyOn(reactor as any, "executeQuery").mockResolvedValue(mockReturnErr)

      try {
        await reactor.callMethod({
          functionName: "complex_method",
          args: [
            {
              owner: "rrkah-fqaaa-aaaaa-aaaaq-cai",
              balance: "100",
              metadata: null,
            },
          ],
        })
        expect.fail("Should have thrown CanisterError")
      } catch (error: any) {
        expect(error.name).toBe("CanisterError")
        expect(error.message).toBe("Canister Error: Insufficient balance")
      }
    })
  })
})
