import { describe, it, expect } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { generateDeclarations } from "./generators"

describe("Bindgen", () => {
  const mockCanisterName = "test_canister"
  const validDidContent = `service : {
    greet: (text) -> (text) query;
}`

  it("generateDeclarations creates correct files", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ic-reactor-bindgen-"))
    try {
      const didFile = path.join(tmpDir, "test.did")
      const outDir = path.join(tmpDir, "output")
      fs.writeFileSync(didFile, validDidContent)

      const result = await generateDeclarations({
        didFile,
        outDir,
        canisterName: mockCanisterName,
      })

      if (!result.success) {
        console.error(result.error)
      }

      expect(result.success).toBe(true)
      expect(result.declarationsDir).toBe(path.join(outDir, "declarations"))

      const declarationsDir = path.join(outDir, "declarations")
      const jsPath = path.join(declarationsDir, "test.js")
      const dtsPath = path.join(declarationsDir, "test.d.ts")
      const didCopyPath = path.join(declarationsDir, "test.did")

      expect(fs.existsSync(jsPath)).toBe(true)
      expect(fs.existsSync(dtsPath)).toBe(true)
      expect(fs.existsSync(didCopyPath)).toBe(true)

      expect(fs.readFileSync(jsPath, "utf-8")).toMatchSnapshot(
        "js-declarations"
      )
      expect(fs.readFileSync(dtsPath, "utf-8")).toMatchSnapshot(
        "ts-declarations"
      )
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it("returns error if DID file missing", async () => {
    const result = await generateDeclarations({
      didFile: path.join(os.tmpdir(), "missing-ic-reactor.did"),
      outDir: path.join(os.tmpdir(), "ic-reactor-missing-output"),
      canisterName: mockCanisterName,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain("DID file not found")
  })
})
