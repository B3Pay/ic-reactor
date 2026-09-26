import fs from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { runCanisterPipeline } from "./pipeline.js"

/** The part of esbuild's API these tests call. */
interface Esbuild {
  build(options: {
    stdin: { contents: string; resolveDir: string; loader: "ts" }
    bundle: true
    write: false
    format: "esm"
    platform: "neutral"
    logLevel: "silent"
    external: string[]
    plugins: {
      name: string
      setup(build: {
        onResolve(
          options: { filter: RegExp },
          callback: (args: { path: string }) => {
            path: string
            external: true
          }
        ): void
      }): void
    }[]
  }): Promise<{ outputFiles: { text: string }[] }>
}

const requireHere = createRequire(import.meta.url)
// esbuild, the bundler tsup builds this package with. It drops an unused
// top-level call only when the call is annotated `@__PURE__`, as Rollup,
// Rolldown and terser do.
const esbuild = createRequire(requireHere.resolve("tsup/package.json"))(
  "esbuild"
) as Esbuild

/**
 * A query without arguments, a query with arguments, an update method and a
 * oneway method: one factory of each kind.
 */
const COUNTER_DID = `service : {
  get : () -> (nat) query;
  get_owner : (nat) -> (opt principal) composite_query;
  add : (nat) -> (nat);
  reset : () -> () oneway;
}
`

describe("generated factories in an app bundle", () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  /**
   * A project whose `counter` canister generates factories, formatted with
   * Prettier as a project that has it is, which splits a call that passes
   * type arguments over several lines.
   */
  async function generateCounter(
    mode: "DisplayReactor" | "CandidDisplayReactor"
  ): Promise<string> {
    const root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "ic-reactor-codegen-bundle-"))
    )
    roots.push(root)
    fs.mkdirSync(path.join(root, "node_modules"))
    fs.symlinkSync(
      path.dirname(requireHere.resolve("prettier/package.json")),
      path.join(root, "node_modules", "prettier"),
      "junction"
    )
    fs.writeFileSync(path.join(root, "counter.did"), COUNTER_DID)

    const result = await runCanisterPipeline({
      canisterConfig: {
        name: "counter",
        didFile: "counter.did",
        mode,
        factories: true,
      },
      projectRoot: root,
      globalConfig: { outDir: "src", clientManagerPath: "../clients" },
    })
    expect(result.error).toBeUndefined()
    return root
  }

  /**
   * The `functionName` of every factory left in the bundle of `entry`, with
   * the runtime packages and the app's client manager left out of it.
   */
  async function bundledMethods(root: string, entry: string) {
    const { outputFiles } = await esbuild.build({
      stdin: {
        contents: entry,
        resolveDir: path.join(root, "src"),
        loader: "ts",
      },
      bundle: true,
      write: false,
      format: "esm",
      platform: "neutral",
      logLevel: "silent",
      external: ["@ic-reactor/*", "@icp-sdk/*"],
      plugins: [
        {
          name: "clients",
          setup(build) {
            build.onResolve({ filter: /\/clients$/ }, (args) => ({
              path: args.path,
              external: true,
            }))
          },
        },
      ],
    })
    const code = outputFiles.map((file) => file.text).join("\n")
    return [...code.matchAll(/functionName: "([^"]*)"/g)].map(
      (match) => match[1]
    )
  }

  // Without the annotation a bundler keeps every top-level call it cannot
  // prove free of side effects, so importing one factory, or only a hook
  // through the wrapper's `export *`, shipped a factory for every method.
  it.each(["DisplayReactor", "CandidDisplayReactor"] as const)(
    "keep only the %s factories the app imports",
    async (mode) => {
      const root = await generateCounter(mode)

      expect(
        await bundledMethods(root, `export { getQuery } from "./counter"`)
      ).toEqual(["get"])
      expect(
        await bundledMethods(
          root,
          `export { addMutation, getOwnerQuery } from "./counter"`
        )
      ).toEqual(["add", "get_owner"])
      expect(
        await bundledMethods(
          root,
          `export { useCounterQuery } from "./counter"`
        )
      ).toEqual([])
      // Every factory is still there for an app that imports them all.
      expect(
        (await bundledMethods(root, `export * from "./counter"`)).sort()
      ).toEqual(["add", "get", "get_owner", "reset"])
    },
    120_000
  )
})
