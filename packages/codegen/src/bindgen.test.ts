import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { generateDeclarations } from "./generators"

describe("Bindgen", () => {
  const mockDidFile = "mock/test.did"
  const mockOutDir = "mock/output"
  const mockCanisterName = "test_canister"
  const validDidContent = `service : {
    greet: (text) -> (text) query;
}`

  beforeEach(() => {
    // Mock fs methods
    vi.spyOn(fs, "existsSync").mockImplementation((p) => {
      // Pretend the source DID file exists
      if (p.toString() === mockDidFile) return true
      return false
    })

    vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined as any)
    vi.spyOn(fs, "rmSync").mockImplementation(() => undefined)
    vi.spyOn(fs, "readFileSync").mockImplementation(() => validDidContent)
    vi.spyOn(fs, "writeFileSync").mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("generateDeclarations creates correct files", async () => {
    const result = await generateDeclarations({
      didFile: mockDidFile,
      outDir: mockOutDir,
      canisterName: mockCanisterName,
    })

    if (!result.success) {
      console.error(result.error)
    }

    expect(result.success).toBe(true)
    expect(result.declarationsDir).toBe(path.join(mockOutDir, "declarations"))

    // Verify file writes
    const declarationsDir = path.join(mockOutDir, "declarations")
    const jsPath = path.join(declarationsDir, "test.js")
    const dtsPath = path.join(declarationsDir, "test.d.ts")

    // Should create directory
    expect(fs.mkdirSync).toHaveBeenCalledWith(mockOutDir, { recursive: true })
    expect(fs.mkdirSync).toHaveBeenCalledWith(declarationsDir, {
      recursive: true,
    })

    // Validate exact content using snapshots
    expect(fs.writeFileSync).toHaveBeenCalledWith(jsPath, expect.any(String))
    expect(fs.writeFileSync).toHaveBeenCalledWith(dtsPath, expect.any(String))

    // Get the arguments of the calls to check content
    const jsCall = vi
      .mocked(fs.writeFileSync)
      .mock.calls.find((call) => call[0] === jsPath)
    const dtsCall = vi
      .mocked(fs.writeFileSync)
      .mock.calls.find((call) => call[0] === dtsPath)

    expect(jsCall?.[1]).toMatchSnapshot("js-declarations")
    expect(dtsCall?.[1]).toMatchSnapshot("ts-declarations")
  })

  it("returns error if DID file missing", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false)

    const result = await generateDeclarations({
      didFile: "missing.did",
      outDir: mockOutDir,
      canisterName: mockCanisterName,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain("DID file not found")
  })
})
