import { describe, expect, it } from "vitest"
import { generateClientFile } from "./generators/index.js"
import { CodegenConfigError } from "./validate.js"

/**
 * `generateClientFile` is re-exported from the package root, so it is reachable
 * without going through the pipeline that validates config. Its
 * `queryClientPath` lands inside an `import` statement in a file written into
 * the consumer's bundle, which makes it the same class of input as
 * `clientManagerPath` and subject to the same rule the reactor generator states:
 * every interpolation into emitted source is validated and JSON.stringify'd.
 */
describe("Client generator — queryClientPath is untrusted input", () => {
  it("rejects a specifier that would close the string literal and append statements", () => {
    const payload =
      './q"; import("node:child_process").then(m=>m.execSync("id")); //'

    expect(() => generateClientFile({ queryClientPath: payload })).toThrow(
      CodegenConfigError
    )
  })

  it("rejects a URL specifier, so generated code cannot import from a remote host", () => {
    expect(() =>
      generateClientFile({ queryClientPath: "https://evil.example/x.js" })
    ).toThrow(CodegenConfigError)
  })

  it("rejects newlines, which would emit a second top-level statement", () => {
    expect(() =>
      generateClientFile({
        queryClientPath: "./q\nexport const pwned = 1",
      })
    ).toThrow(CodegenConfigError)
  })

  it("quotes an accepted specifier with JSON.stringify rather than bare quotes", () => {
    const content = generateClientFile({ queryClientPath: "../lib/query" })

    expect(content).toContain(
      `import { queryClient } from ${JSON.stringify("../lib/query")}`
    )
  })

  it("still emits a default QueryClient when no path is given", () => {
    const content = generateClientFile()

    expect(content).toContain(
      `import { QueryClient } from "@tanstack/react-query"`
    )
    expect(content).toContain("export const queryClient = new QueryClient()")
  })
})
