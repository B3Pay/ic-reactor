import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { runCanisterPipeline } from "./pipeline.js"

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

  it("uses per-canister mode to generate Reactor-based hooks", async () => {
    const projectRoot = createTempProject()
    writeDid(projectRoot, "workflow_engine.did")

    const result = await runCanisterPipeline({
      canisterConfig: {
        name: "workflow_engine",
        didFile: "workflow_engine.did",
        mode: "Reactor",
      },
      projectRoot,
      globalConfig: {
        outDir: "src/declarations",
        clientManagerPath: "../../clients",
      },
    })

    expect(result.success).toBe(true)

    const indexPath = path.join(
      projectRoot,
      "src/declarations/workflow_engine/index.generated.ts"
    )
    const generated = fs.readFileSync(indexPath, "utf-8")

    expect(generated).toContain("new Reactor<WorkflowEngineService>")
    expect(generated).not.toContain("new DisplayReactor<WorkflowEngineService>")
    expect(
      fs.readFileSync(
        path.join(projectRoot, "src/declarations/workflow_engine/index.ts"),
        "utf-8"
      )
    ).toContain('export * from "./index.generated"')
  })

  it("writes a configured canisterId into the generated reactor", async () => {
    const projectRoot = createTempProject()
    writeDid(projectRoot, "workflow.did")

    const result = await runCanisterPipeline({
      canisterConfig: {
        name: "workflow",
        didFile: "workflow.did",
        canisterId: "yq4ns-hyaaa-aaaap-akbna-cai",
      },
      projectRoot,
      globalConfig: {
        outDir: "src/declarations",
        clientManagerPath: "../../clients",
      },
    })

    expect(result.success).toBe(true)

    const indexPath = path.join(
      projectRoot,
      "src/declarations/workflow/index.generated.ts"
    )
    const generated = fs.readFileSync(indexPath, "utf-8")

    expect(generated).toContain('canisterId: "yq4ns-hyaaa-aaaap-akbna-cai"')
    expect(generated).toContain('name: "workflow"')
  })

  it("can generate declarations without creating reactor files", async () => {
    const projectRoot = createTempProject()
    writeDid(projectRoot, "backend.did")

    const result = await runCanisterPipeline({
      canisterConfig: {
        name: "backend",
        didFile: "backend.did",
      },
      projectRoot,
      globalConfig: {
        outDir: "src/declarations",
        clientManagerPath: "../../clients",
      },
      generateReactor: false,
    })

    expect(result.success).toBe(true)
    expect(
      fs.existsSync(
        path.join(
          projectRoot,
          "src/declarations/backend/declarations/backend.js"
        )
      )
    ).toBe(true)
    expect(
      fs.existsSync(
        path.join(
          projectRoot,
          "src/declarations/backend/declarations/backend.d.ts"
        )
      )
    ).toBe(true)
    expect(
      fs.existsSync(
        path.join(
          projectRoot,
          "src/declarations/backend/declarations/backend.did"
        )
      )
    ).toBe(true)
    expect(
      fs.existsSync(
        path.join(projectRoot, "src/declarations/backend/index.generated.ts")
      )
    ).toBe(false)
    expect(
      fs.existsSync(path.join(projectRoot, "src/declarations/backend/index.ts"))
    ).toBe(false)
    expect(
      result.files.some((file) => file.filePath.endsWith("index.generated.ts"))
    ).toBe(false)
    expect(
      result.files.some((file) => file.filePath.endsWith("index.ts"))
    ).toBe(false)
  })

  it("leaves existing reactor files untouched when reactor generation is disabled", async () => {
    const projectRoot = createTempProject()
    writeDid(projectRoot, "backend.did")

    const canisterOutDir = path.join(projectRoot, "src/declarations/backend")
    fs.mkdirSync(canisterOutDir, { recursive: true })

    const existingGenerated = "// existing generated reactor"
    const existingEntry = "// existing entry wrapper"

    fs.writeFileSync(
      path.join(canisterOutDir, "index.generated.ts"),
      existingGenerated
    )
    fs.writeFileSync(path.join(canisterOutDir, "index.ts"), existingEntry)

    const result = await runCanisterPipeline({
      canisterConfig: {
        name: "backend",
        didFile: "backend.did",
      },
      projectRoot,
      globalConfig: {
        outDir: "src/declarations",
        clientManagerPath: "../../clients",
      },
      generateReactor: false,
    })

    expect(result.success).toBe(true)
    expect(
      fs.readFileSync(path.join(canisterOutDir, "index.generated.ts"), "utf-8")
    ).toBe(existingGenerated)
    expect(
      fs.readFileSync(path.join(canisterOutDir, "index.ts"), "utf-8")
    ).toBe(existingEntry)
  })

  it("supports a core target without generating React hooks", async () => {
    const projectRoot = createTempProject()
    writeDid(projectRoot, "backend.did")

    const result = await runCanisterPipeline({
      canisterConfig: {
        name: "backend",
        didFile: "backend.did",
      },
      projectRoot,
      globalConfig: {
        outDir: "src/declarations",
        clientManagerPath: "../../clients",
        target: "core",
      },
    })

    expect(result.success).toBe(true)

    const indexPath = path.join(
      projectRoot,
      "src/declarations/backend/index.generated.ts"
    )
    const generated = fs.readFileSync(indexPath, "utf-8")

    expect(generated).toContain(
      'import { DisplayReactor } from "@ic-reactor/core"'
    )
    expect(generated).not.toContain(
      'import { createActorHooks } from "@ic-reactor/react"'
    )
    expect(generated).not.toContain("useBackendQuery")
  })

  it("does not overwrite user-modified index.ts on regenerate", async () => {
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

    const indexPath = path.join(
      projectRoot,
      "src/declarations/backend/index.ts"
    )
    fs.writeFileSync(
      indexPath,
      `// user custom canister file
export const customBackendIndex = true
`
    )

    const second = await runCanisterPipeline({
      ...options,
      canisterConfig: {
        ...options.canisterConfig,
        canisterId: "yq4ns-hyaaa-aaaap-akbna-cai",
      },
    })
    expect(second.success).toBe(true)

    const wrapper = fs.readFileSync(indexPath, "utf-8")
    expect(wrapper).toContain("customBackendIndex = true")
    const generatedImpl = fs.readFileSync(
      path.join(projectRoot, "src/declarations/backend/index.generated.ts"),
      "utf-8"
    )
    expect(generatedImpl).toContain('canisterId: "yq4ns-hyaaa-aaaap-akbna-cai"')
    expect(second.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: indexPath,
          skipped: true,
          success: true,
        }),
      ])
    )
  })

  it("fails when the .did declares no service instead of emitting a broken import", async () => {
    const projectRoot = createTempProject()
    fs.writeFileSync(
      path.join(projectRoot, "shared_types.did"),
      "type Foo = record { a : nat };"
    )

    const result = await runCanisterPipeline({
      canisterConfig: {
        name: "backend",
        didFile: "shared_types.did",
      },
      projectRoot,
      globalConfig: {
        outDir: "src/declarations",
        clientManagerPath: "../../clients",
      },
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain("backend")
    expect(result.error).toContain(path.join(projectRoot, "shared_types.did"))
    // The reactor would otherwise import idlFactory and _SERVICE from a module
    // that exports neither.
    expect(
      fs.existsSync(
        path.join(projectRoot, "src/declarations/backend/index.generated.ts")
      )
    ).toBe(false)
  })

  it("fails when the didFile basename is a directory reference", async () => {
    const projectRoot = createTempProject()
    fs.mkdirSync(path.join(projectRoot, "canisters"))

    const result = await runCanisterPipeline({
      canisterConfig: {
        name: "backend",
        // Absolute, so it reaches the pipeline unnormalized and its basename is
        // "..", which would become `import … from "./declarations/.."`.
        didFile: `${projectRoot}/canisters/..`,
      },
      projectRoot,
      globalConfig: {
        outDir: "src/declarations",
        clientManagerPath: "../../clients",
      },
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain("refers to a directory")
  })

  it("refuses to generate into an outDir another canister already owns", async () => {
    const projectRoot = createTempProject()
    writeDid(projectRoot, "backend.did")
    writeDid(projectRoot, "ledger.did")

    const sharedOutDir = "src/declarations/shared"
    const globalConfig = {
      outDir: "src/declarations",
      clientManagerPath: "../../clients",
    }

    const first = await runCanisterPipeline({
      canisterConfig: {
        name: "backend",
        didFile: "backend.did",
        outDir: sharedOutDir,
      },
      projectRoot,
      globalConfig,
    })
    expect(first.success).toBe(true)

    const declarationsDir = path.join(projectRoot, sharedOutDir, "declarations")
    const before = fs.readdirSync(declarationsDir).sort()

    const second = await runCanisterPipeline({
      canisterConfig: {
        name: "ledger",
        didFile: "ledger.did",
        outDir: sharedOutDir,
      },
      projectRoot,
      globalConfig,
    })

    expect(second.success).toBe(false)
    expect(second.error).toContain("backend")
    expect(second.error).toContain("ledger")
    // The first canister's output survives untouched.
    expect(fs.readdirSync(declarationsDir).sort()).toEqual(before)
    expect(
      fs.readFileSync(
        path.join(projectRoot, sharedOutDir, "index.generated.ts"),
        "utf-8"
      )
    ).toContain('name: "backend"')
  })

  it("preserves an index.ts that kept the generated header but grew its own exports", async () => {
    const projectRoot = createTempProject()
    writeDid(projectRoot, "backend.did")

    const canisterOutDir = path.join(projectRoot, "src/declarations/backend")
    fs.mkdirSync(canisterOutDir, { recursive: true })

    // Started life as generated output, then the user added a factory to it.
    const userOwned = `import { DisplayReactor, createActorHooks } from "@ic-reactor/react"
import { createQuery } from "@ic-reactor/react"
import { clientManager } from "../../clients"
import { idlFactory, type _SERVICE } from "./declarations/backend"

export type BackendService = _SERVICE

/**
 * Backend Reactor
 *
 * Auto-generated by @ic-reactor/codegen — do not edit.
 */
export const backendReactor = new DisplayReactor<BackendService>({
  clientManager,
  idlFactory,
  name: "backend",
})

export const {
  useActorQuery: useBackendQuery,
} = createActorHooks(backendReactor)

export const greetQuery = createQuery(backendReactor, "greet")
`
    const indexPath = path.join(canisterOutDir, "index.ts")
    fs.writeFileSync(indexPath, userOwned)

    const result = await runCanisterPipeline({
      canisterConfig: {
        name: "backend",
        didFile: "backend.did",
      },
      projectRoot,
      globalConfig: {
        outDir: "src/declarations",
        clientManagerPath: "../../clients",
      },
    })

    expect(result.success).toBe(true)
    expect(fs.readFileSync(indexPath, "utf-8")).toBe(userOwned)
    expect(result.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filePath: indexPath, skipped: true }),
      ])
    )
  })

  it("migrates a legacy generated index.ts to the managed wrapper", async () => {
    const projectRoot = createTempProject()
    writeDid(projectRoot, "backend.did")

    const canisterOutDir = path.join(projectRoot, "src/declarations/backend")
    fs.mkdirSync(canisterOutDir, { recursive: true })

    const existingGeneratedIndex = `import { DisplayReactor, createActorHooks } from "@ic-reactor/react"
import { clientManager } from "../../clients"
import { idlFactory, type _SERVICE } from "./declarations/backend"

export type BackendService = _SERVICE

/**
 * Backend Reactor
 *
 * Auto-generated by @ic-reactor/codegen — do not edit.
 */
export const backendReactor = new DisplayReactor<BackendService>({
  clientManager,
  idlFactory,
  name: "backend",
})

export const {
  useActorQuery: useBackendQuery,
} = createActorHooks(backendReactor)
`
    fs.writeFileSync(
      path.join(canisterOutDir, "index.ts"),
      existingGeneratedIndex
    )

    const result = await runCanisterPipeline({
      canisterConfig: {
        name: "backend",
        didFile: "backend.did",
      },
      projectRoot,
      globalConfig: {
        outDir: "src/declarations",
        clientManagerPath: "../../clients",
      },
    })

    expect(result.success).toBe(true)

    const indexPath = path.join(canisterOutDir, "index.ts")
    const entry = fs.readFileSync(indexPath, "utf-8")
    const generated = fs.readFileSync(
      path.join(canisterOutDir, "index.generated.ts"),
      "utf-8"
    )
    expect(entry).toContain('export * from "./index.generated"')
    expect(entry).not.toBe(existingGeneratedIndex)
    expect(generated).toContain("new DisplayReactor<BackendService>")
    expect(generated).toContain("useBackendMutation")

    // Migration replaces a file the user owns on the strength of a content
    // match, so the original is kept next to it.
    const backupPath = `${indexPath}.bak`
    expect(fs.readFileSync(backupPath, "utf-8")).toBe(existingGeneratedIndex)

    expect(result.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filePath: path.join(canisterOutDir, "index.generated.ts"),
          success: true,
        }),
        expect.objectContaining({
          filePath: backupPath,
          success: true,
        }),
        expect.objectContaining({
          filePath: indexPath,
          success: true,
        }),
      ])
    )
  })
})
