#!/usr/bin/env node
// Checks that condition docs do not leak the hidden tests: no test name (as
// written, or with spaces for underscores), and no distinctive literal from a
// hidden test file that the task prompts do not already make public.
//
//   node harness/check-docs.mjs [doc files...]   (default: the three guides: v4-proto, thin-guide, v4)
//
// "Distinctive" = a string or numeric literal from a hidden test that holds a
// digit, `_` or `.`, is at least 4 characters, is not an import specifier, and
// does not appear in the task prompts of EVERY prompt variant (a literal only
// the explicit prompt states is still a needle: the docs are the same under
// the minimal prompt, where it is not public). Paraphrase cannot be checked
// mechanically; README records the manual review.
import { readFileSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"
import {
  EVALS,
  PROMPT_VARIANTS,
  TASKS,
  promptFile,
  taskSpec,
  taskTests,
} from "./assemble.mjs"

const DEFAULT_DOCS = [
  "conditions/v4-proto/docs/llms.txt",
  "conditions/thin-guide/docs/llms.txt",
  // Copied from the packed @ic-reactor/core by setup.mjs, which refuses it on
  // a hit before copying; listed here so the default run covers it too.
  "conditions/v4/docs/llms.txt",
]

export function hiddenNeedles() {
  // One text per variant: all tasks' prompts of that variant.
  const promptsByVariant = PROMPT_VARIANTS.map((variant) =>
    TASKS.map((t) => readFileSync(promptFile(t, variant), "utf8")).join("\n")
  )
  const isPublic = (text) =>
    promptsByVariant.every((prompts) => prompts.includes(text))
  const needles = new Map() // needle → where it came from
  for (const task of TASKS) {
    // Test names from task.json, the authoritative list (the files build
    // some names from templates).
    for (const name of taskTests(taskSpec(task))) {
      needles.set(name, `${task}/task.json (test name)`)
      needles.set(
        name.replaceAll("_", " "),
        `${task}/task.json (test name, spaced)`
      )
    }
    const dir = join(EVALS, "tasks", task, "hidden")
    for (const file of readdirSync(dir)) {
      const source = readFileSync(join(dir, file), "utf8")
      const where = `${task}/hidden/${file}`

      const code = source
        .split("\n")
        .filter((line) => !/^\s*(import|\}\s*from)\b/.test(line))
        .join("\n")
        // Test-runner timeouts are not assertions: `}, 30_000)`, `timeout: 20_000`.
        .replace(/\}\s*,\s*[\d_]+\s*\)/g, "})")
        .replace(/timeout:\s*[\d_]+/g, "timeout: 0")
        .replace(/timeout\s*=\s*[\d_]+/g, "timeout = 0")
        // Nor are waits: `await sleep(1_000)`.
        .replace(/sleep\(\s*[\d_]+\s*\)/g, "sleep(0)")
      const literals = [
        ...[...code.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map((m) => m[1]),
        ...[...code.matchAll(/`([^`$\n]*)`/g)].map((m) => m[1]),
        ...[...code.matchAll(/\b\d[\d_]{3,}n?\b/g)].map((m) => m[0]),
      ]
      for (const literal of literals) {
        const numeric = /^\d[\d_]*n?$/.test(literal)
        const plain = numeric
          ? literal.replace(/_/g, "").replace(/n$/, "")
          : literal
        if (literal.length < 4 || !/[\d_.]/.test(literal)) continue
        if (/^[@#.]/.test(literal)) continue
        if (isPublic(literal) || isPublic(plain)) continue
        needles.set(literal, `${where} (literal)`)
        if (plain !== literal && plain.length >= 4)
          needles.set(plain, `${where} (literal)`)
      }
    }
  }
  return needles
}

export function checkDocs(files) {
  const needles = hiddenNeedles()
  const hits = []
  for (const file of files) {
    const text = readFileSync(file, "utf8").toLowerCase()
    for (const [needle, where] of needles) {
      if (text.includes(needle.toLowerCase())) {
        hits.push({ file: relative(EVALS, file), needle, from: where })
      }
    }
  }
  return { needles: needles.size, hits }
}

/**
 * Every hidden-test name, from task.json (the authoritative list), as
 * written and with spaces for underscores. Taken from task.json rather than
 * from hiddenNeedles(), where a name that is also a string literal in a test
 * file is recorded under the file it was last seen in.
 */
export function hiddenTestNames() {
  return TASKS.flatMap((task) =>
    taskTests(taskSpec(task)).flatMap((name) => [
      { needle: name, from: `${task}/task.json (test name)` },
      {
        needle: name.replaceAll("_", " "),
        from: `${task}/task.json (test name, spaced)`,
      },
    ])
  )
}

/**
 * The prompts of every variant: no hidden-test name (as written or spaced).
 * Literals are not checked here: the prompts are what makes a literal public.
 */
export function checkPrompts() {
  const names = hiddenTestNames()
  const hits = []
  for (const task of TASKS) {
    for (const variant of PROMPT_VARIANTS) {
      const file = promptFile(task, variant)
      const text = readFileSync(file, "utf8").toLowerCase()
      for (const { needle, from } of names) {
        if (text.includes(needle.toLowerCase())) {
          hits.push({ file: relative(EVALS, file), needle, from })
        }
      }
    }
  }
  return { prompts: TASKS.length * PROMPT_VARIANTS.length, hits }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = (
    process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_DOCS
  ).map((f) => (f.startsWith("/") ? f : join(EVALS, f)))
  const { needles, hits } = checkDocs(files)
  const prompts = checkPrompts()
  process.stdout.write(
    `check-docs: ${files.length} file(s), ${needles} hidden-test needles, ${hits.length} hit(s); ` +
      `${prompts.prompts} prompt(s) (${PROMPT_VARIANTS.join(", ")}), ${prompts.hits.length} test-name hit(s)\n`
  )
  for (const hit of [...hits, ...prompts.hits]) {
    process.stdout.write(
      `  ${hit.file}: ${JSON.stringify(hit.needle)} from ${hit.from}\n`
    )
  }
  process.exit(hits.length + prompts.hits.length === 0 ? 0 : 1)
}
