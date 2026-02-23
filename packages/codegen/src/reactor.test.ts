import { describe, expect, it } from "vitest"
import { generateReactorFile, generateReactorWrapperFile } from "./generators"

describe("Reactor generator", () => {
  it("keeps default behavior as display mode", () => {
    const content = generateReactorFile({
      canisterName: "backend",
      didFile: "mock/backend.did",
      clientManagerPath: "../../clients",
    })

    expect(content).toMatchSnapshot("display-mode-index-generated")
    expect(content).toContain("new DisplayReactor<BackendService>")
    expect(content).toContain(
      'export const BackendReactorMode = "display" as const'
    )
  })

  it("supports raw mode generation", () => {
    const content = generateReactorFile({
      canisterName: "workflow_engine",
      didFile: "mock/workflow_engine.did",
      reactorMode: "raw",
    })

    expect(content).toMatchSnapshot("raw-mode-index-generated")
    expect(content).toContain("new Reactor<WorkflowEngineService>")
    expect(content).toContain(
      'export const WorkflowEngineReactorMode = "raw" as const'
    )
  })

  it("generates a stable wrapper file", () => {
    const content = generateReactorWrapperFile({
      canisterName: "backend",
      didFile: "mock/backend.did",
    })

    expect(content).toMatchSnapshot("stable-wrapper-index")
    expect(content).toContain('export * from "./index.generated"')
  })
})
