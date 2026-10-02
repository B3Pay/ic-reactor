/**
 * What the package entry is: exactly the three bindings, in a module that
 * carries the `'use client'` directive. The export budget gate
 * (`pnpm check:exports`) reads the built declarations; this reads what a
 * bundler or Node would load.
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import * as entry from "../src/index.js"

const packageFile = (name: string) => resolve(import.meta.dirname, "..", name)

describe("the package entry", () => {
  it("exports exactly ReactorProvider, useClient and useAuth at runtime", () => {
    // Pinned whole, as a list, so that a re-export of core, or a hook added
    // without a decision, is a red test rather than a quiet extra name.
    expect(Object.keys(entry).sort()).toEqual([
      "ReactorProvider",
      "useAuth",
      "useClient",
    ])
    for (const name of Object.keys(entry)) {
      expect(typeof (entry as Record<string, unknown>)[name]).toBe("function")
    }
  })

  it("starts its emitted module with the 'use client' directive", () => {
    // Compiled with the package's own tsconfig, which is what `pnpm build`
    // compiles it with: a compiler or a configuration that dropped the
    // directive would turn the entry into a server module, and a Next.js or
    // other RSC build would then reject the hooks it imports.
    const config = ts.readConfigFile(
      packageFile("tsconfig.json"),
      ts.sys.readFile
    )
    const { options } = ts.parseJsonConfigFileContent(
      config.config,
      ts.sys,
      packageFile(".")
    )
    const source = packageFile("src/index.tsx")

    const { outputText } = ts.transpileModule(readFileSync(source, "utf8"), {
      compilerOptions: options,
      fileName: source,
    })

    expect(outputText.trimStart()).toMatch(/^(["'])use client\1;?\r?\n/)
  })
})
