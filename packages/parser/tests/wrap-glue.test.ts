import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { describe, it, expect } from "vitest"

// scripts/wrap-glue.js rebuilds the entries from wasm-bindgen's bundler output.
// When a wasm-bindgen upgrade changes that output in a way the script does not
// handle, the build has to stop with a message, not ship a broken entry.

const { wrapGlue } = createRequire(import.meta.url)(
  "../scripts/wrap-glue.js"
) as {
  wrapGlue: (sources: { entry: string; glue: string }) => Record<string, string>
}

const entry = readFileSync(
  new URL("../dist/bundler/index.js", import.meta.url),
  "utf-8"
)
const glue = readFileSync(
  new URL("../dist/bundler/index_bg.js", import.meta.url),
  "utf-8"
)

describe("wrap-glue", () => {
  it("wraps every function the bundler entry exports", () => {
    const names = entry
      .match(/export \{([^}]*)\}/)?.[1]
      .split(",")
      .map((name) => name.trim())
    expect(names).toContain("didToJs")

    const files = wrapGlue({ entry, glue })
    for (const name of names ?? []) {
      expect(files["web/index.js"]).toContain(`export function ${name}(`)
      expect(files["nodejs/index.js"]).toContain(`exports.${name} = ${name};`)
    }
  })

  it("stops when the glue starts importing other modules", () => {
    expect(() =>
      wrapGlue({ entry, glue: `import { f } from "./snippets/f.js";\n${glue}` })
    ).toThrow(/imports other modules/)
  })

  it("stops when the glue exports something other than a function", () => {
    expect(() =>
      wrapGlue({ entry, glue: `${glue}\nexport const memory = null;\n` })
    ).toThrow(/has an export scripts\/wrap-glue\.js cannot wrap/)
  })

  it("stops when the bundler entry starts the instance differently", () => {
    expect(() =>
      wrapGlue({ entry: entry.replace("wasm.__wbindgen_start();", ""), glue })
    ).toThrow(/no longer starts the instance/)
  })
})
