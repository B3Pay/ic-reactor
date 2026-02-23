import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { runCanisterPipeline } from "./pipeline"

describe("Codegen pipeline", () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
    tempDirs.length = 0
  })

  function createTempProject() {
    const projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "ic-reactor-codegen-pipeline-")
    )
    tempDirs.push(projectRoot)
    return projectRoot
  }

  function writeDid(projectRoot: string, fileName: string) {
    fs.writeFileSync(
      path.join(projectRoot, fileName),
      `service : {
  greet: (text) -> (text) query;
}`
    )
  }

  it("applies per-canister reactor mode overrides over the global default", async () => {
    const projectRoot = createTempProject()
    writeDid(projectRoot, "workflow_engine.did")

    const result = await runCanisterPipeline({
      canisterConfig: {
        name: "workflow_engine",
        didFile: "workflow_engine.did",
      },
      projectRoot,
      globalConfig: {
        outDir: "src/declarations",
        clientManagerPath: "../../clients",
        reactor: {
          defaultMode: "display",
          canisters: {
            workflow_engine: "raw",
          },
        },
      },
    })

    expect(result.success).toBe(true)

    const generatedPath = path.join(
      projectRoot,
      "src/declarations/workflow_engine/index.generated.ts"
    )
    const generated = fs.readFileSync(generatedPath, "utf-8")

    expect(generated).toContain("new Reactor<WorkflowEngineService>")
    expect(generated).toContain(
      'export const WorkflowEngineReactorMode = "raw" as const'
    )
  })

  it("does not overwrite the wrapper file on regenerate", async () => {
    const projectRoot = createTempProject()
    writeDid(projectRoot, "backend.did")

    const options = {
      canisterConfig: {
        name: "backend",
        didFile: "backend.did",
      },
      projectRoot,
      globalConfig: {
        outDir: "src/declarations",
        clientManagerPath: "../../clients",
      },
    } as const

    const first = await runCanisterPipeline(options)
    expect(first.success).toBe(true)

    const wrapperPath = path.join(
      projectRoot,
      "src/declarations/backend/index.ts"
    )
    fs.writeFileSync(
      wrapperPath,
      `// user wrapper
export const customBackendWrapper = true
`
    )

    const second = await runCanisterPipeline(options)
    expect(second.success).toBe(true)

    const wrapper = fs.readFileSync(wrapperPath, "utf-8")
    expect(wrapper).toContain("customBackendWrapper = true")
    expect(second.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: wrapperPath,
          skipped: true,
          success: true,
        }),
      ])
    )
  })
})
