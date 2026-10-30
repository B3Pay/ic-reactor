#!/usr/bin/env node
/**
 * Writes the static files of IC Reactor's module on b3pay.net
 * (b3pay-module.json): the consumer guide, packages/core/llms.txt, which
 * b3pay.net serves at /docs/ic-reactor/llms.txt as this site serves it at
 * /llms.txt.
 *
 *   node docs/scripts/b3pay-static.mjs <out folder>
 */
import { copyFileSync, mkdirSync } from "node:fs"
import { join, resolve } from "node:path"

const out = process.argv[2]
if (!out) {
  console.error("usage: node docs/scripts/b3pay-static.mjs <out folder>")
  process.exit(1)
}
mkdirSync(out, { recursive: true })
copyFileSync(
  resolve(import.meta.dirname, "../../packages/core/llms.txt"),
  join(out, "llms.txt")
)
