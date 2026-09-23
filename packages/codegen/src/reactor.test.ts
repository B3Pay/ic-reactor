import { describe, expect, it } from "vitest"
import {
  generateReactorEntryFile,
  generateReactorFile,
} from "./generators/index.js"

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

  it("supports candid reactor subclasses", () => {
    const content = generateReactorFile({
      canisterName: "ledger",
      didFile: "mock/ledger.did",
      reactorClass: "MetadataDisplayReactor",
    })

    expect(content).toMatchSnapshot("metadata-display-reactor-index")
    expect(content).toContain(
      'import { createActorHooks } from "@ic-reactor/react"'
    )
    expect(content).toContain(
      'import { MetadataDisplayReactor } from "@ic-reactor/candid"'
    )
    expect(content).toContain("new MetadataDisplayReactor<LedgerService>")
  })

  // The @ic-reactor/candid classes extend the core ones, so TypeScript could
  // only infer createActorHooks' type arguments by comparing every member, and
  // for a large or recursive service that fails with TS2589.
  // generated-types.test.ts compiles the output.
  it.each([
    ["CandidReactor", "candid"],
    ["CandidDisplayReactor", "display"],
    ["MetadataDisplayReactor", "metadataDisplay"],
  ] as const)(
    "passes createActorHooks its type arguments for %s",
    (reactorClass, transform) => {
      const content = generateReactorFile({
        canisterName: "ledger",
        didFile: "mock/ledger.did",
        reactorClass,
      })

      expect(content).toContain(
        `} = createActorHooks<LedgerService, "${transform}">(ledgerReactor)`
      )
    }
  )

  it.each(["Reactor", "DisplayReactor"] as const)(
    "leaves createActorHooks to infer its type arguments for %s",
    (reactorClass) => {
      const content = generateReactorFile({
        canisterName: "ledger",
        didFile: "mock/ledger.did",
        reactorClass,
      })

      expect(content).toContain("} = createActorHooks(ledgerReactor)")
    }
  )

  it("supports core target generation without React hooks", () => {
    const content = generateReactorFile({
      canisterName: "backend",
      didFile: "mock/backend.did",
      runtimeTarget: "core",
      reactorClass: "DisplayReactor",
    })

    expect(content).toMatchSnapshot("core-display-reactor-index")
    expect(content).toContain(
      'import { DisplayReactor } from "@ic-reactor/core"'
    )
    expect(content).not.toContain(
      'import { createActorHooks } from "@ic-reactor/react"'
    )
    expect(content).not.toContain("useBackendQuery")
  })

  it("writes a fixed canisterId when configured", () => {
    const content = generateReactorFile({
      canisterName: "workflow",
      didFile: "mock/workflow.did",
      canisterId: "yq4ns-hyaaa-aaaap-akbna-cai",
    })

    expect(content).toContain('canisterId: "yq4ns-hyaaa-aaaap-akbna-cai"')
    expect(content).toContain('name: "workflow"')
  })

  it("generates a stable entry wrapper", () => {
    const content = generateReactorEntryFile()

    expect(content).toContain('export * from "./index.generated"')
    expect(content).toContain("safe to customize")
  })
})
