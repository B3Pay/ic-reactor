// @vitest-environment node
// The compiler answers the server functions reuse: the TypeScript module, a
// projection and a compatibility report each compile once per .did (and
// method set), not once per request.
import { afterAll, describe, expect, it, vi } from "vitest"
import icpLedgerDid from "../../did/icp_ledger.did?raw"
import icrc1Did from "../../did/icrc1.did?raw"
import { cachingCli } from "./cli-cache.ts"
import {
  CompileDeadlineError,
  compatibilityOf,
  compileInterface,
  moduleOf,
  projectionOf,
  type CandidCli,
} from "./compile.ts"
import { createWorkerCli } from "./compile.server.ts"

const worker = createWorkerCli()

afterAll(() => worker.close())

/** The real compiler (in its worker), with a count of every call. */
function counted() {
  const calls = {
    didToContract: 0,
    didToModule: 0,
    projectDid: 0,
    checkCompatible: 0,
  }
  const cli: CandidCli = {
    didToContract: (sources) => {
      calls.didToContract++
      return worker.didToContract(sources)
    },
    didToModule: (sources) => {
      calls.didToModule++
      return worker.didToModule(sources)
    },
    projectDid: (sources, methods) => {
      calls.projectDid++
      return worker.projectDid(sources, methods)
    },
    checkCompatible: (written, live) => {
      calls.checkCompatible++
      return worker.checkCompatible(written, live)
    },
  }
  return { cli, calls }
}

describe("cachingCli", () => {
  it("generates a .did's module once, docs and TypeScript tab alike", async () => {
    const { cli, calls } = counted()
    const cached = cachingCli(cli)
    const did = "service : {\n  /// Says hi.\n  hi : () -> (text) query;\n}"
    const compiled = await compileInterface(cached, did)
    expect(compiled).toMatchObject({ ok: true, docs: { hi: "Says hi." } })
    const first = await moduleOf(cached, did)
    const again = await moduleOf(cached, did)
    expect(first).toMatchObject({ ok: true })
    expect(again).toEqual(first)
    expect(calls.didToModule).toBe(1)
    await moduleOf(cached, icrc1Did)
    expect(calls.didToModule).toBe(2)
  })

  it("projects a .did once per set of methods, in any order", async () => {
    const { cli, calls } = counted()
    const cached = cachingCli(cli)
    const first = await projectionOf(cached, icrc1Did, [
      "icrc1_transfer",
      "icrc1_fee",
    ])
    const same = await projectionOf(cached, icrc1Did, [
      "icrc1_fee",
      "icrc1_transfer",
      "icrc1_fee",
    ])
    expect(same).toEqual(first)
    expect(calls.projectDid).toBe(1)
    await projectionOf(cached, icrc1Did, ["icrc1_fee"])
    expect(calls.projectDid).toBe(2)
  })

  it("checks a pair of .did texts once, and shares a call in flight", async () => {
    const { cli, calls } = counted()
    const cached = cachingCli(cli)
    const [a, b] = await Promise.all([
      compatibilityOf(cached, icrc1Did, icpLedgerDid),
      compatibilityOf(cached, icrc1Did, icpLedgerDid),
    ])
    await compatibilityOf(cached, icrc1Did, icpLedgerDid)
    expect(a).toMatchObject({ ok: true, compatible: true })
    expect(b).toEqual(a)
    expect(calls.checkCompatible).toBe(1)
  })

  it("keeps no answer that threw", async () => {
    let fail = true
    const didToModule = vi.fn(
      async (sources: Parameters<CandidCli["didToModule"]>[0]) => {
        if (fail) throw new Error("the WASM trapped")
        return worker.didToModule(sources)
      }
    )
    const cached = cachingCli({ ...worker, didToModule })
    await expect(cached.didToModule(icrc1Did)).rejects.toThrow(/trapped/)
    fail = false
    expect(await cached.didToModule(icrc1Did)).toMatchObject({ ok: true })
    expect(didToModule).toHaveBeenCalledTimes(2)
  })

  it("refuses a .did whose compile ran past the deadline, whatever the method list, for a while", async () => {
    let time = 0
    const stopped = new CompileDeadlineError("stopped")
    const projectDid = vi.fn<CandidCli["projectDid"]>(async () => {
      throw stopped
    })
    const cached = cachingCli(
      { ...worker, projectDid },
      { now: () => time, slowTtlMs: 15_000 }
    )
    expect(await projectionOf(cached, icrc1Did, ["icrc1_fee"])).toEqual({
      ok: false,
      message: "stopped",
    })
    // Another method list, the module, the contract: none reach the worker.
    expect(
      await projectionOf(cached, icrc1Did, ["icrc1_symbol"])
    ).toMatchObject({ ok: false, message: expect.stringMatching(/deadline/) })
    expect(await moduleOf(cached, icrc1Did)).toMatchObject({ ok: false })
    expect(await compileInterface(cached, icrc1Did)).toMatchObject({
      ok: false,
      code: "timeout",
    })
    expect(projectDid).toHaveBeenCalledTimes(1)
    // Another .did is not held up.
    expect(await moduleOf(cached, icpLedgerDid)).toMatchObject({ ok: true })

    time += 15_000
    await projectionOf(cached, icrc1Did, ["icrc1_symbol"])
    expect(projectDid).toHaveBeenCalledTimes(2)
  })

  it("does not hold a .did against it when the queue was only full", async () => {
    const projectDid = vi.fn<CandidCli["projectDid"]>(async () => {
      throw new CompileDeadlineError("busy", { busy: true })
    })
    const cached = cachingCli({ ...worker, projectDid })
    await projectionOf(cached, icrc1Did, ["icrc1_fee"])
    await projectionOf(cached, icrc1Did, ["icrc1_fee"])
    expect(projectDid).toHaveBeenCalledTimes(2)
  })
})
