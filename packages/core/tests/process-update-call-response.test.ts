import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  Certificate,
  CertifiedRejectErrorCode,
  LookupPathStatus,
  MissingRootKeyErrorCode,
  RejectError,
  UncertifiedRejectUpdateErrorCode,
  UnexpectedErrorCode,
  UnknownError,
  ExternalError,
  pollForResponse,
} from "@icp-sdk/core/agent"
import type { Agent, RequestId, SubmitResponse } from "@icp-sdk/core/agent"
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity"
import { Principal } from "@icp-sdk/core/principal"
import { processUpdateCallResponse } from "../src/utils/agent.js"

vi.mock("@icp-sdk/core/agent", async () => {
  const actual = await vi.importActual<typeof import("@icp-sdk/core/agent")>(
    "@icp-sdk/core/agent"
  )
  return { ...actual, pollForResponse: vi.fn() }
})

/**
 * Every update call made through a Reactor flows through this function, a
 * re-implementation of the SDK Actor's response handling: the v4 certified
 * response, certified rejection, v2 uncertified rejection, and the 202 that
 * hands off to polling. The e2e suite covers the anonymous happy path against
 * a real replica; nothing exercised the other branches with real bodies. These
 * feed each branch a fixture and look at what comes out.
 */

const CANISTER_ID = Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai")
const REQUEST_ID = new Uint8Array(32).fill(7) as unknown as RequestId
const REPLY = new Uint8Array([0x44, 0x49, 0x44, 0x4c, 0x00, 0x00])
const target = { canisterId: CANISTER_ID }

const text = (s: string) => new TextEncoder().encode(s)

/** A verified certificate that answers only the request_status paths given. */
const certificateWith = (entries: Record<string, Uint8Array>) =>
  ({
    lookup_path: (path: Array<Uint8Array | string>) => {
      const last = path[path.length - 1]
      const key =
        typeof last === "string" ? last : new TextDecoder().decode(last)
      return key in entries
        ? { status: LookupPathStatus.Found, value: entries[key] }
        : { status: LookupPathStatus.Absent }
    },
  }) as unknown as Certificate

const submit = (
  status: number,
  body: SubmitResponse["response"]["body"]
): SubmitResponse => ({
  requestId: REQUEST_ID,
  response: { ok: status < 400, status, statusText: "", body, headers: [] },
})

const v4 = () => submit(200, { certificate: new Uint8Array([1, 2, 3]) })
const v2 = () =>
  submit(200, {
    reject_code: 4,
    reject_message: "canister says no",
    error_code: "IC0503",
  })
const accepted = () => submit(202, null)

const agent = {
  rootKey: new Uint8Array(96),
  readState: vi.fn(),
  createReadStateRequest: vi.fn(),
} as unknown as Agent

const run = (
  result: SubmitResponse,
  options: { agent?: Agent; identity?: Ed25519KeyIdentity } = {}
) =>
  processUpdateCallResponse(
    result,
    CANISTER_ID,
    "transfer",
    options.agent ?? agent,
    {},
    target,
    options.identity
  )

const rejection = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e
  )
  if (!(error instanceof RejectError)) throw new Error("expected RejectError")
  return error
}

describe("processUpdateCallResponse", () => {
  beforeEach(() => {
    vi.mocked(pollForResponse).mockReset()
  })

  describe("a v4 certified response", () => {
    it("returns the reply of a replied call", async () => {
      vi.spyOn(Certificate, "create").mockResolvedValueOnce(
        certificateWith({ status: text("replied"), reply: REPLY })
      )

      await expect(run(v4())).resolves.toEqual(REPLY)
      // Nothing to poll for.
      expect(pollForResponse).not.toHaveBeenCalled()
    })

    it("throws a certified RejectError carrying the rejection details", async () => {
      vi.spyOn(Certificate, "create").mockResolvedValueOnce(
        certificateWith({
          status: text("rejected"),
          reject_code: new Uint8Array([5]),
          reject_message: text("out of cycles"),
          error_code: text("IC0501"),
        })
      )

      const error = await rejection(run(v4()))
      const code = error.code as CertifiedRejectErrorCode
      expect(code).toBeInstanceOf(CertifiedRejectErrorCode)
      expect(code.rejectCode).toBe(5)
      expect(code.rejectMessage).toBe("out of cycles")
      expect(code.rejectErrorCode).toBe("IC0501")
      expect(code.requestId).toEqual(REQUEST_ID)
      expect(code.callContext).toMatchObject({
        canisterId: CANISTER_ID,
        methodName: "transfer",
        effectiveTarget: target,
      })
    })

    it("still throws a RejectError when the certificate omits the reject fields", async () => {
      // A certificate that says "rejected" and nothing else must not become a
      // TypeError: retry classification keys off the RejectError shape, and
      // its documented contract is that an unreadable reject code still retries.
      vi.spyOn(Certificate, "create").mockResolvedValueOnce(
        certificateWith({ status: text("rejected") })
      )

      const error = await rejection(run(v4()))
      const code = error.code as CertifiedRejectErrorCode
      expect(code).toBeInstanceOf(CertifiedRejectErrorCode)
      expect(code.rejectCode).toBeUndefined()
      expect(code.rejectMessage).toBe("")
      expect(code.rejectErrorCode).toBeUndefined()
    })

    it("refuses to verify without a root key", async () => {
      const noKey = { ...agent, rootKey: null } as unknown as Agent
      const error = await run(v4(), { agent: noKey }).then(
        () => undefined,
        (e: unknown) => e
      )
      expect(error).toBeInstanceOf(ExternalError)
      expect((error as ExternalError).code).toBeInstanceOf(
        MissingRootKeyErrorCode
      )
    })

    it("verifies the certificate against the effective target and root key", async () => {
      const create = vi
        .spyOn(Certificate, "create")
        .mockResolvedValueOnce(
          certificateWith({ status: text("replied"), reply: REPLY })
        )

      await run(v4())

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          certificate: new Uint8Array([1, 2, 3]),
          rootKey: agent.rootKey,
          principal: target,
          agent,
        })
      )
    })
  })

  describe("a v2 uncertified rejection", () => {
    it("throws an uncertified RejectError with the body's details", async () => {
      const error = await rejection(run(v2()))
      const code = error.code as UncertifiedRejectUpdateErrorCode
      expect(code).toBeInstanceOf(UncertifiedRejectUpdateErrorCode)
      expect(code.rejectCode).toBe(4)
      expect(code.rejectMessage).toBe("canister says no")
      expect(code.rejectErrorCode).toBe("IC0503")
      expect(code.callContext).toMatchObject({
        canisterId: CANISTER_ID,
        methodName: "transfer",
      })
    })
  })

  describe("a 202 that needs polling", () => {
    it("polls the request with the agent as-is when nothing is pinned", async () => {
      vi.mocked(pollForResponse).mockResolvedValueOnce({
        reply: REPLY,
        certificate: certificateWith({}),
        rawCertificate: new Uint8Array(),
      })

      await expect(run(accepted())).resolves.toEqual(REPLY)

      const [polledAgent, polledTarget, requestId, options] =
        vi.mocked(pollForResponse).mock.calls[0]
      expect(polledAgent).toBe(agent)
      expect(polledTarget).toBe(target)
      expect(requestId).toEqual(REQUEST_ID)
      expect(options).toEqual({})
    })

    it("polls through a delegate of the agent when an identity is pinned", async () => {
      vi.mocked(pollForResponse).mockResolvedValueOnce({
        reply: REPLY,
        certificate: certificateWith({}),
        rawCertificate: new Uint8Array(),
      })
      const identity = Ed25519KeyIdentity.generate()

      await expect(run(accepted(), { identity })).resolves.toEqual(REPLY)

      const [polledAgent] = vi.mocked(pollForResponse).mock.calls[0]
      // A prototype delegate: the agent underneath is the same object, with
      // readState and createReadStateRequest overridden on top.
      expect(polledAgent).not.toBe(agent)
      expect(Object.getPrototypeOf(polledAgent)).toBe(agent)
      const own = (key: string) =>
        Object.prototype.hasOwnProperty.call(polledAgent, key)
      expect(own("readState")).toBe(true)
      expect(own("createReadStateRequest")).toBe(true)
    })

    it("lets a polling rejection through untouched", async () => {
      const rejected = RejectError.fromCode(
        new CertifiedRejectErrorCode(REQUEST_ID, 5, "late reject", undefined)
      )
      vi.mocked(pollForResponse).mockRejectedValueOnce(rejected)

      await expect(run(accepted())).rejects.toBe(rejected)
    })
  })

  describe("anything else", () => {
    it("throws an UnknownError naming the undetermined outcome", async () => {
      // Neither a certificate, nor a rejection, nor a 202: the SDK's "call
      // was returned undefined" case.
      const error = await run(submit(200, null)).then(
        () => undefined,
        (e: unknown) => e
      )
      expect(error).toBeInstanceOf(UnknownError)
      const code = (error as UnknownError).code as UnexpectedErrorCode
      expect(code).toBeInstanceOf(UnexpectedErrorCode)
      expect(code.callContext).toMatchObject({
        canisterId: CANISTER_ID,
        methodName: "transfer",
      })
    })
  })
})
