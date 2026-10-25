/**
 * Tests of the fence rule `check-snippets.mjs` and `check-ai-context.js` share.
 *
 * Run by `pnpm test:scripts`.
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { closesFence, fenceOpening, fencedLines } from "./markdown-fences.mjs"

/** Which lines of `text` the reader puts in a block, by 1-based number. */
const fenced = (text) => {
  const read = fencedLines()
  return text.split("\n").flatMap((line, i) => (read(line) ? [i + 1] : []))
}

describe("fenceOpening", () => {
  it("reads the indent, the marker, the language and the rest of the info", () => {
    assert.deepEqual(fenceOpening("  ```TSX title=x.tsx skip"), {
      indent: 2,
      marker: "```",
      lang: "tsx",
      info: ["title=x.tsx", "skip"],
    })
    assert.deepEqual(fenceOpening("~~~~"), {
      indent: 0,
      marker: "~~~~",
      lang: "",
      info: [],
    })
  })

  it("is null for a line that opens no fence", () => {
    for (const line of ["``", "text ```ts", "~~", ""]) {
      assert.equal(fenceOpening(line), null, line)
    }
  })
})

describe("closesFence", () => {
  it("closes on the same character, at least as long, with no info string", () => {
    assert.equal(closesFence("```", "```"), true)
    assert.equal(closesFence("  `````  ", "```"), true)
    assert.equal(closesFence("```ts", "```"), false)
    assert.equal(closesFence("```", "````"), false)
    assert.equal(closesFence("~~~", "```"), false)
  })
})

describe("fencedLines", () => {
  it("puts the fence lines and the code between them in the block", () => {
    assert.deepEqual(fenced("# A\n```ts\n# not a heading\n```\n# B"), [2, 3, 4])
  })

  it("does not end a block on a line with an info string", () => {
    // `check-ai-context.js` read its headings by a rule of its own, under
    // which this ```ts ended the block and `## In code` was a heading.
    assert.deepEqual(
      fenced("```\n```ts\n## In code\n```\n# After"),
      [1, 2, 3, 4]
    )
  })

  it("does not end a block on a shorter or another fence", () => {
    assert.deepEqual(fenced("````md\n```\n~~~~\n````\nafter"), [1, 2, 3, 4])
  })

  it("runs a block that is never closed to the end", () => {
    assert.deepEqual(fenced("text\n```\ncode\n# code"), [2, 3, 4])
  })

  it("reads the lines of a file with CRLF line endings", () => {
    assert.deepEqual(
      fenced("```ts\r\n## In code\r\n```\r\n## After\r"),
      [1, 2, 3]
    )
  })

  it("reads an indented fence, as in a list or an MDX component", () => {
    assert.deepEqual(
      fenced("1. Step\n   ```sh\n   pnpm i\n   ```\n2. Next"),
      [2, 3, 4]
    )
  })
})
