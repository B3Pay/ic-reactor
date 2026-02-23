import { describe, expect, it } from "vitest"
import { generateReactorFile } from "./generators"

describe("Reactor generator", () => {
  it("keeps default behavior as DisplayReactor", () => {
    const content = generateReactorFile({
      canisterName: "backend",
      didFile: "mock/backend.did",
      clientManagerPath: "../../clients",
    })

    expect(content).toMatchSnapshot("display-reactor-index")
    expect(content).toContain("new DisplayReactor<BackendService>")
    expect(content).not.toContain("export const BackendReactorMode")
  })

  it("supports Reactor mode generation", () => {
    const content = generateReactorFile({
      canisterName: "workflow_engine",
      didFile: "mock/workflow_engine.did",
      reactorClass: "Reactor",
    })

    expect(content).toMatchSnapshot("reactor-index")
    expect(content).toContain("new Reactor<WorkflowEngineService>")
    expect(content).not.toContain("createWorkflowEngineDisplayReactor")
  })
})
