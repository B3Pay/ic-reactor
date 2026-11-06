// The projections `methodDid` reuses, and the refusal of a .did that ran
// past the deadline, over the real compiler in its worker (offline).
import { readFile } from "node:fs/promises"
import { afterAll, describe, expect, it, vi } from "vitest"
import { cachingCli } from "./cli-cache.ts"
import { compileInterface, projectionOf, type CandidCli } from "./compile.ts"
import { CompileDeadlineError, createWorkerCli } from "./compile-worker.ts"

const icrc1Did = await readFile(
  new URL("./fixtures/icrc1.did", import.meta.url),
  "utf8"
)
const OTHER_DID = "service : { ping : () -> (text) query }"

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

  it("shares a projection in flight, and keeps one that names an unknown method", async () => {
    const { cli, calls } = counted()
    const cached = cachingCli(cli)
    const [a, b] = await Promise.all([
      projectionOf(cached, icrc1Did, ["nope"]),
      projectionOf(cached, icrc1Did, ["nope"]),
    ])
    await projectionOf(cached, icrc1Did, ["nope"])
    expect(a).toMatchObject({
      ok: false,
      message: expect.stringMatching(/unknown_method/),
    })
    expect(b).toEqual(a)
    expect(calls.projectDid).toBe(1)
  })

  it("compiles and generates on every call: the loader keeps those", async () => {
    const { cli, calls } = counted()
    const cached = cachingCli(cli)
    await compileInterface(cached, `${OTHER_DID}\n// a comment`)
    await compileInterface(cached, `${OTHER_DID}\n// a comment`)
    expect(calls).toMatchObject({ didToContract: 2, didToModule: 2 })
  })

  it("keeps no answer that threw", async () => {
    let fail = true
    const projectDid = vi.fn<CandidCli["projectDid"]>(
      async (sources, methods) => {
        if (fail) throw new Error("the WASM trapped")
        return worker.projectDid(sources, methods)
      }
    )
    const cached = cachingCli({ ...worker, projectDid })
    await expect(cached.projectDid(icrc1Did, ["icrc1_fee"])).rejects.toThrow(
      /trapped/
    )
    fail = false
    expect(await cached.projectDid(icrc1Did, ["icrc1_fee"])).toMatchObject({
      ok: true,
    })
    expect(projectDid).toHaveBeenCalledTimes(2)
  })

  it("refuses a .did whose compile ran past the deadline, whatever the call, for a while", async () => {
    let time = 0
    const projectDid = vi.fn<CandidCli["projectDid"]>(async () => {
      throw new CompileDeadlineError("stopped")
    })
    const cached = cachingCli(
      { ...worker, projectDid },
      { now: () => time, slowTtlMs: 15_000 }
    )
    expect(await projectionOf(cached, icrc1Did, ["icrc1_fee"])).toEqual({
      ok: false,
      message: "stopped",
    })
    // Another method list, the contract: neither reaches the worker.
    expect(
      await projectionOf(cached, icrc1Did, ["icrc1_symbol"])
    ).toMatchObject({ ok: false, message: expect.stringMatching(/deadline/) })
    expect(await compileInterface(cached, icrc1Did)).toMatchObject({
      ok: false,
      code: "timeout",
    })
    expect(projectDid).toHaveBeenCalledTimes(1)
    // Another .did is not held up.
    expect(await compileInterface(cached, OTHER_DID)).toMatchObject({
      ok: true,
    })

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
