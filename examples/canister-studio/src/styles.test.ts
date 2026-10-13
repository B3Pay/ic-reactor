// The stylesheet holds no rule for a class nothing renders: a dead rule
// reads as part of the design system, and the next person keeps it.
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const SRC = import.meta.dirname

function sourceText(dir: string): string {
  let text = ""
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) text += sourceText(path)
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      text += `${readFileSync(path, "utf8")}\n`
    }
  }
  return text
}

/** Class names the components build from a prefix and a value. */
const COMPOSED = [
  // Badge.tsx: `badge-${tone}`, the mode tones among them.
  /^badge-(query|update|composite|oneway)$/,
  // ScenarioCard.tsx: `safety-step-${step.status}`.
  /^safety-step-(pass|fail|info)$/,
]

describe("styles.css", () => {
  it("styles only classes the source names", () => {
    const css = readFileSync(join(SRC, "styles.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      ""
    )
    const classes = new Set(
      [...css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]!)
    )
    const source = sourceText(SRC)
    const unused = [...classes].filter(
      (name) =>
        !COMPOSED.some((pattern) => pattern.test(name)) &&
        !new RegExp(`(?<![\\w-])${name}(?![\\w-])`).test(source)
    )
    expect(unused.sort()).toEqual([])
  })
})
