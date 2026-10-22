/**
 * Fenced code blocks in Markdown (and MDX), by the one rule the scripts share:
 * `check-snippets.mjs` takes the code out of them, and `check-ai-context.js`
 * skips them when it reads headings. Following CommonMark, a fence closes on a
 * line of the same character, at least as long, with no info string, so a
 * ```ts inside a ````markdown block is content, not a fence. Fences may be
 * indented, as they are in lists and MDX components.
 */

/**
 * The fence `line` opens, or null: its indentation, its marker (``` or ~~~,
 * three or more), its language in lower case, and the rest of its info string
 * split at whitespace.
 *
 * @returns {{ indent: number, marker: string, lang: string, info: string[] } | null}
 */
export function fenceOpening(line) {
  // `.*` would stop at the `\r` that ends a CRLF line and match nothing, so
  // the rest of the line is `[^\n]*`.
  const match = /^(\s*)(`{3,}|~{3,})\s*([^\s`]*)([^\n]*)$/.exec(line)
  if (match === null) return null
  return {
    indent: match[1].length,
    marker: match[2],
    lang: match[3].toLowerCase(),
    info: match[4].trim().split(/\s+/).filter(Boolean),
  }
}

/** Whether `line` closes the block that `marker` opened. */
export function closesFence(line, marker) {
  const close = /^\s*(`{3,}|~{3,})\s*$/.exec(line)
  return (
    close !== null &&
    close[1][0] === marker[0] &&
    close[1].length >= marker.length
  )
}

/**
 * A reader of a text's lines in order, which says for each whether it belongs
 * to a fenced code block: a fence line, or a line of code inside one.
 *
 * @returns {(line: string) => boolean}
 */
export function fencedLines() {
  let marker = null
  return (line) => {
    if (marker === null) {
      marker = fenceOpening(line)?.marker ?? null
      return marker !== null
    }
    if (closesFence(line, marker)) marker = null
    return true
  }
}
