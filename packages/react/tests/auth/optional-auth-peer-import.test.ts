import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * Guards the mechanism that keeps `@icp-sdk/auth` genuinely optional on
 * webpack-based toolchains (webpack, `next build --webpack`, Rspack).
 *
 * webpack marks a dynamic import that sits lexically inside a `try` block as an
 * optional dependency (`ImportParserPlugin`: `dep.optional = inTry`), and
 * `Compilation` downgrades an unresolvable optional dependency from a fatal
 * "Module not found" error to a build warning plus a module that rejects at
 * runtime. Hoisting the import out of the `try`, or moving it into a nested
 * function (webpack resets `inTry` at every function boundary), silently breaks
 * every consumer that did not install the optional peer — which is the default,
 * because npm and pnpm never install optional peers.
 */
const source = readFileSync(
  resolve(process.cwd(), "src/auth/authentication-manager.ts"),
  "utf8"
)

/**
 * Is the single `import("@icp-sdk/auth/client")` lexically inside a `try`?
 *
 * Tracked structurally by brace depth rather than by matching exact source
 * text, so reformatting or renaming the caught error cannot fail this test for
 * reasons unrelated to the invariant it guards.
 */
function importSitsInsideTryBlock(code: string): boolean {
  const importIndex = code.indexOf('import("@icp-sdk/auth/client")')
  if (importIndex === -1) return false

  const before = code.slice(0, importIndex)
  const openTryDepths: number[] = []
  let depth = 0

  for (let i = 0; i < before.length; i++) {
    const char = before[i]
    if (char === "{") {
      // `try` immediately precedes the brace that opens its block.
      if (/\btry\s*$/.test(before.slice(Math.max(0, i - 12), i))) {
        openTryDepths.push(depth)
      }
      depth++
    } else if (char === "}") {
      depth--
      // Leaving a block closes any `try` that opened at this depth.
      while (
        openTryDepths.length > 0 &&
        openTryDepths[openTryDepths.length - 1] >= depth
      ) {
        openTryDepths.pop()
      }
    }
  }

  return openTryDepths.length > 0
}

describe("optional @icp-sdk/auth peer import", () => {
  it("keeps the dynamic import lexically inside a try block", () => {
    expect(importSitsInsideTryBlock(source)).toBe(true)
  })

  it("detects a hoisted import, which would silently make the peer mandatory", () => {
    // Sanity-check the guard itself: the same import outside any `try` fails.
    expect(
      importSitsInsideTryBlock(
        `function load() { return import("@icp-sdk/auth/client") }`
      )
    ).toBe(false)
  })

  it("imports the peer exactly once, as a literal specifier", () => {
    const matches = source.match(/import\("@icp-sdk\/auth\/client"\)/g) ?? []
    expect(matches).toHaveLength(1)
  })

  it("never references the peer through a static import", () => {
    expect(source).not.toMatch(/^\s*import\s.*from\s+"@icp-sdk\/auth/m)
  })
})
