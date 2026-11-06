// Method docs come from the module `didToModule` writes (the compiled
// envelope has none): the comment lines just above a service method, `///`
// or `//`, become the JSDoc above its `Actor` member. The generator writes
// one member per line, indented two spaces, which is what this reads. It
// keeps a comment only when the method name is not quoted in the .did, so
// other methods have no docs to read.

const ACTOR_START = "export type Actor = {"
const ACTOR_END = "\n};"

// A member's name: an identifier, a quoted name ("hello world"), or a
// computed one (["__proto__"], which a plain key would turn into a prototype).
const MEMBER =
  /^ {2}(?:([A-Za-z_$][\w$]*)|("(?:[^"\\]|\\.)*")|\[("(?:[^"\\]|\\.)*")\]): /

/**
 * The doc text of each `Actor` method in a generated module, by Candid
 * method name. Methods without a doc comment are absent. The generator's
 * `@param` lines (argument names only) are dropped, and its escapes of `*\/`
 * and `\@` in the original comment are undone. A Map: the names are canister
 * text, `__proto__` included.
 */
export function methodDocsFromModule(moduleText: string): Map<string, string> {
  const docs = new Map<string, string>()
  const start = moduleText.indexOf(ACTOR_START)
  if (start === -1) return docs
  const end = moduleText.indexOf(ACTOR_END, start)
  const block = moduleText.slice(
    start + ACTOR_START.length,
    end === -1 ? undefined : end
  )

  let pending: string[] | undefined
  let inComment = false
  for (const line of block.split("\n")) {
    if (inComment) {
      if (/^ {3}\*\/\s*$/.test(line)) {
        inComment = false
      } else {
        pending?.push(line.replace(/^ {3}\* ?/, ""))
      }
      continue
    }
    if (/^ {2}\/\*\*\s*$/.test(line)) {
      inComment = true
      pending = []
      continue
    }
    // A one-line doc is written on one line: `/** Text. */`.
    const oneLine = /^ {2}\/\*\* (.*) \*\/\s*$/.exec(line)
    if (oneLine !== null) {
      pending = [oneLine[1] ?? ""]
      continue
    }
    const member = MEMBER.exec(line)
    if (member !== null) {
      const name = memberName(member)
      const text = pending === undefined ? "" : docText(pending)
      if (name !== undefined && text !== "") docs.set(name, text)
    }
    pending = undefined
  }
  return docs
}

function memberName(match: RegExpExecArray): string | undefined {
  const [, identifier, quoted, computed] = match
  if (identifier !== undefined) return identifier
  const literal = quoted ?? computed
  if (literal === undefined) return undefined
  try {
    const name: unknown = JSON.parse(literal)
    return typeof name === "string" ? name : undefined
  } catch {
    return undefined
  }
}

function docText(lines: readonly string[]): string {
  const kept = lines
    .filter((line) => !line.startsWith("@param"))
    .map((line) => line.replaceAll("*\\/", "*/").replaceAll("\\@", "@"))
  while (kept.length > 0 && kept[0]?.trim() === "") kept.shift()
  while (kept.length > 0 && kept[kept.length - 1]?.trim() === "") kept.pop()
  return kept.join("\n")
}
