// Tool names for the methods of listed canisters: `<name>_<method>`.
//
// A Candid method name can be any text, and MCP clients put the server's name
// in front of a tool's (`mcp__<server>__<tool>`) under a 64-character limit,
// so a name that is not plain or is long gets a short hash of the method in
// place of its tail. The same canisters and methods always give the same names.
import { createHash } from "node:crypto"

/** The longest tool name written, leaving room for a client's prefix. */
export const MAX_TOOL_NAME = 40

const PLAIN = /^[A-Za-z0-9_-]+$/

/**
 * A tool name for each (canister name, method) pair, unique among them and
 * against `taken`, in the order given.
 */
export function toolNames(
  pairs: readonly { readonly canister: string; readonly method: string }[],
  taken: Iterable<string>
): string[] {
  const used = new Set(taken)
  return pairs.map(({ canister, method }) => {
    const raw = `${canister}_${method}`
    const safe = raw.replace(/[^A-Za-z0-9_-]/g, "_")
    let name =
      PLAIN.test(raw) && raw.length <= MAX_TOOL_NAME && !used.has(raw)
        ? raw
        : hashed(safe, `${canister}\0${method}`)
    // A hashed name that is still taken (a method named like another's hash)
    // gets another hash until it is free.
    for (let extra = 0; used.has(name); extra += 1) {
      name = hashed(safe, `${canister}\0${method}\0${extra}`)
    }
    used.add(name)
    return name
  })
}

function hashed(base: string, key: string): string {
  const digest = createHash("sha256").update(key, "utf8").digest("hex")
  return `${base.slice(0, MAX_TOOL_NAME - 9)}_${digest.slice(0, 8)}`
}
