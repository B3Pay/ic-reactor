/**
 * A generator that never exits is killed at the timeout, and costs the dev
 * server nothing but the wait.
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

/** Whether the process the stand-in CLI recorded is still running. */
function hungProcessIsAlive(root: string): boolean {
  const pid = Number(
    fs.readFileSync(
      path.join(root, "node_modules/@candid-core/cli/hang.pid"),
      "utf-8"
    )
  )
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
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

  it("is killed at the timeout, and the dev server serves once it is", async () => {
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
    expect(errors[0]).toContain("did not finish within 1s and was killed")
    // The group that hung was not tried again canister by canister.
    expect(app.runs()).toHaveLength(1)
  })
})
