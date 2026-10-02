/**
 * A generator that never exits is killed at the timeout, and costs the
 * canister it hung on and the dev server nothing but the wait.
 *
 * The timeout is 60 s. These tests shorten it by replacing the constant the
 * plugin reads from its generator module, which is not an option of the
 * plugin.
 */
import fs from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createApp, get, runBuild, startDev, type App } from "./support.js"

vi.mock("../src/generate.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/generate.js")>()),
  GENERATE_TIMEOUT_MS: 1000,
}))

const closers: Array<() => Promise<unknown>> = []
let app: App | undefined

afterEach(async () => {
  for (const close of closers.splice(0).reverse()) await close()
  app?.cleanup()
  app = undefined
})

/** Whether any process that the stand-in CLI hung in is still running. */
function hungProcessIsAlive(root: string): boolean {
  const pids = fs
    .readFileSync(
      path.join(root, "node_modules/@candid-core/cli/hang.pids"),
      "utf-8"
    )
    .trim()
    .split("\n")
    .map(Number)
  expect(pids.length).toBeGreaterThan(0)
  return pids.some((pid) => {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  })
}

describe("a generator that never exits", () => {
  it("is killed at the timeout, and the build fails with that", async () => {
    app = createApp({ "did/hang.did": "HANG\n" }, "fake")
    const { result } = runBuild(app.root, {
      canisters: { hang: { didFile: "did/hang.did" } },
    })

    await expect(result).rejects.toThrow(
      /hang \(did\/hang\.did\): candid-core-cli did not finish within 1s and was killed/
    )
    expect(hungProcessIsAlive(app.root)).toBe(false)
  })

  // The hang is one .did's, and the canisters that were generated with it are
  // not its victims: each is run alone once the group has been killed.
  it("costs only the canister that hung, and the build fails with that one", async () => {
    app = createApp({ "did/hang.did": "HANG\n", "did/ok.did": "ok\n" }, "fake")
    const { result, lines } = runBuild(app.root, {
      canisters: {
        hang: { didFile: "did/hang.did" },
        ok: { didFile: "did/ok.did" },
      },
    })

    await expect(result).rejects.toThrow(
      /could not generate 1 of 2 canisters:\n {2}- hang \(did\/hang\.did\): candid-core-cli did not finish within 1s and was killed/
    )
    expect(lines).toContain(
      "info: ic-reactor: generated ok into src/canisters/ok.ts"
    )
    expect(hungProcessIsAlive(app.root)).toBe(false)
  })

  it("is killed at the timeout, and the dev server serves the canister that did not hang", async () => {
    app = createApp({ "did/hang.did": "HANG\n", "did/ok.did": "ok\n" }, "fake")
    const running = await startDev(app.root, {
      canisters: {
        hang: { didFile: "did/hang.did" },
        ok: { didFile: "did/ok.did" },
      },
    })
    closers.push(running.close)

    expect(hungProcessIsAlive(app.root)).toBe(false)
    expect((await get(running.port, "/")).status).toBe(200)
    const errors = running.lines.filter((line) => line.startsWith("error:"))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("could not generate 1 of 2 canisters")
    expect(errors[0]).toContain("hang (did/hang.did)")
    expect(errors[0]).toContain("did not finish within 1s and was killed")
    expect(errors[0]).not.toContain("ok (")
    expect(running.lines).toContain(
      "info: ic-reactor: generated ok into src/canisters/ok.ts"
    )
    // The group, then each of its two canisters alone. The one that hung is
    // not tried a third time.
    expect(app.runs().map((args) => args.length)).toEqual([6, 5, 5])
  })
})
