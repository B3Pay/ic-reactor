import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { createApp, isValidAppName } from "./createApp"
import { buildScaffoldFiles } from "./templates"

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "icr-start-"))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe("isValidAppName", () => {
  it("accepts valid npm-style names", () => {
    expect(isValidAppName("my-app")).toBe(true)
    expect(isValidAppName("app123")).toBe(true)
    expect(isValidAppName("@scope/app")).toBe(true)
    expect(isValidAppName("a1")).toBe(true)
  })

  it("rejects invalid names", () => {
    expect(isValidAppName("MyApp")).toBe(false)
    expect(isValidAppName("has space")).toBe(false)
    expect(isValidAppName("")).toBe(false)
    expect(isValidAppName("1leading")).toBe(false)
  })
})

describe("createApp", () => {
  it("writes the expected V0 file set", () => {
    const target = path.join(tmpDir, "my-app")
    const result = createApp({ targetDir: target, appName: "my-app" })

    const expected = [
      "icp.yaml",
      "ic-reactor.json",
      ".gitignore",
      "README.md",
      "backend/canister.yaml",
      "backend/main.mo",
      "backend/backend.did",
      "frontend/canister.yaml",
      "frontend/package.json",
      "frontend/vite.config.ts",
      "frontend/tsconfig.json",
      "frontend/index.html",
      "frontend/src/main.tsx",
      "frontend/src/styles.css",
      "frontend/src/routeTree.gen.ts",
      "frontend/src/routes/__root.tsx",
      "frontend/src/routes/index.tsx",
      "frontend/src/lib/client.ts",
      "frontend/src/lib/auth.ts",
    ]
    expect(result.writtenFiles.sort()).toEqual(expected.sort())

    for (const rel of expected) {
      expect(fs.existsSync(path.join(target, rel))).toBe(true)
    }
  })

  it("derives appName from targetDir basename when not provided", () => {
    const target = path.join(tmpDir, "derived-name")
    const result = createApp({ targetDir: target })
    expect(result.appName).toBe("derived-name")
    expect(fs.existsSync(path.join(target, "icp.yaml"))).toBe(true)
  })

  it("generates package scripts matching the supported icp-cli flow", () => {
    const target = path.join(tmpDir, "my-app")
    createApp({ targetDir: target, appName: "my-app" })

    const pkg = JSON.parse(
      fs.readFileSync(path.join(target, "frontend/package.json"), "utf8")
    ) as { scripts: Record<string, string> }

    expect(pkg.scripts.dev).toBe("vite")
    expect(pkg.scripts.build).toBe("tsc && vite build")
    expect(pkg.scripts["deploy:local"]).toBe("icp deploy")
    expect(pkg.scripts["deploy:ic"]).toBe("icp deploy -e ic")
    expect(pkg.scripts.network).toBe("icp network start -d")
    expect(pkg.scripts.sync).toBe("icp sync")
  })

  it("references the icReactorStart preset in vite.config.ts", () => {
    const target = path.join(tmpDir, "my-app")
    createApp({ targetDir: target, appName: "my-app" })

    const viteConfig = fs.readFileSync(
      path.join(target, "frontend/vite.config.ts"),
      "utf8"
    )
    expect(viteConfig).toContain('from "@ic-reactor/start/plugin/vite"')
    expect(viteConfig).toContain("icReactorStart")
    // No .env / canister ID literal should be baked in.
    expect(viteConfig).not.toMatch(/canisterId\s*:/)
  })

  it("configures icp.yaml with backend + frontend canisters and a managed local network", () => {
    const target = path.join(tmpDir, "my-app")
    createApp({ targetDir: target, appName: "my-app" })

    const icpYaml = fs.readFileSync(path.join(target, "icp.yaml"), "utf8")
    expect(icpYaml).toMatch(/- backend/)
    expect(icpYaml).toMatch(/- frontend/)
    expect(icpYaml).toMatch(/mode: managed/)
    expect(icpYaml).toMatch(/ii: true/)
  })

  it("configures ic-reactor.json with the backend canister and its .did", () => {
    const target = path.join(tmpDir, "my-app")
    createApp({ targetDir: target, appName: "my-app" })

    const cfg = JSON.parse(
      fs.readFileSync(path.join(target, "ic-reactor.json"), "utf8")
    )
    expect(cfg.canisters.backend.didFile).toBe("./backend/backend.did")
    expect(cfg.canisters.backend.name).toBe("backend")
  })

  it("includes an II auth client and a backend hook consumer", () => {
    const target = path.join(tmpDir, "my-app")
    createApp({ targetDir: target, appName: "my-app" })

    const auth = fs.readFileSync(
      path.join(target, "frontend/src/lib/auth.ts"),
      "utf8"
    )
    expect(auth).toContain("AuthenticationManager")
    expect(auth).toContain("createAuthHooks")

    const indexRoute = fs.readFileSync(
      path.join(target, "frontend/src/routes/index.tsx"),
      "utf8"
    )
    expect(indexRoute).toContain("useBackendQuery")
    expect(indexRoute).toContain("useBackendMutation")
  })

  it("fails clearly on an invalid app name", () => {
    const target = path.join(tmpDir, "MyApp")
    expect(() => createApp({ targetDir: target, appName: "MyApp" })).toThrow(
      /invalid app name/
    )
  })

  it("fails clearly on a non-empty directory unless force is set", () => {
    const target = path.join(tmpDir, "occupied")
    fs.mkdirSync(target, { recursive: true })
    fs.writeFileSync(path.join(target, "preexisting.txt"), "x")

    expect(() => createApp({ targetDir: target, appName: "occupied" })).toThrow(
      /not empty/
    )

    expect(() =>
      createApp({ targetDir: target, appName: "occupied", force: true })
    ).not.toThrow()
  })

  it("claims a directory that only contains .git (git init)", () => {
    const target = path.join(tmpDir, "gitonly")
    fs.mkdirSync(path.join(target, ".git"), { recursive: true })
    expect(() =>
      createApp({ targetDir: target, appName: "gitonly" })
    ).not.toThrow()
  })

  it("rejects an absolute path requirement", () => {
    expect(() =>
      createApp({ targetDir: "relative/path", appName: "my-app" })
    ).toThrow(/absolute path/)
  })

  it("refuses path-traversing file entries", () => {
    const target = path.join(tmpDir, "my-app")
    expect(() =>
      createApp({
        targetDir: target,
        appName: "my-app",
        files: [{ relativePath: "../escape.txt", content: "x" }],
      })
    ).toThrow(/outside target directory/)
  })
})

describe("buildScaffoldFiles", () => {
  it("substitutes appName into package.json, index.html, and README", () => {
    const files = buildScaffoldFiles({ appName: "custom-name" })
    const pkg = JSON.parse(
      files.find((f) => f.relativePath === "frontend/package.json")!.content
    )
    expect(pkg.name).toBe("custom-name")

    const html = files.find(
      (f) => f.relativePath === "frontend/index.html"
    )!.content
    expect(html).toContain("<title>custom-name</title>")

    const readme = files.find((f) => f.relativePath === "README.md")!.content
    expect(readme).toMatch(/# custom-name/)
  })
})
