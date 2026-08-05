#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const rootDir = process.cwd()

const versionChecks = [
  { packageName: "@ic-reactor/core", packageDir: "core" },
  { packageName: "@ic-reactor/react", packageDir: "react" },
  { packageName: "@ic-reactor/candid", packageDir: "candid" },
  { packageName: "@ic-reactor/codegen", packageDir: "codegen" },
  { packageName: "@ic-reactor/cli", packageDir: "cli" },
  { packageName: "@ic-reactor/vite-plugin", packageDir: "vite-plugin" },
  { packageName: "@ic-reactor/parser", packageDir: "parser" },
]

const requiredPackageLlms = [
  "core",
  "react",
  "candid",
  "codegen",
  "cli",
  "vite-plugin",
]

/**
 * Files whose whole purpose is to orient an AI agent. They are the "package
 * surface" source of truth, so a stale version here steers agents (and the
 * humans reading their output) at a release that is no longer current.
 *
 * Until this check covered them, only the version table in the root llms.txt was
 * validated, so a release could bump every manifest and leave all of these
 * claiming the previous version with the gate still green.
 */
const aiContextFiles = [
  "llms.txt",
  "llms-full.txt",
  "AGENTS.md",
  "CLAUDE.md",
  ".cursorrules",
  ".github/copilot-instructions.md",
  "skill-packages/README.md",
  "skill-packages/ic-reactor-hooks/SKILL.md",
  "skill-packages/ic-reactor-packages/SKILL.md",
  "skill-packages/ic-reactor-packages/references/package-map.md",
  ...requiredPackageLlms.map((dir) => `packages/${dir}/llms.txt`),
]

/** The docs site is served under this base; see docs/astro.config.mjs. */
const DOCS_BASE = "/v3/"

/**
 * Versions that legitimately appear in the AI-context files without belonging to
 * an @ic-reactor package (a documented Node or pnpm version, for example).
 *
 * Deliberately starts empty: every version-like token in these files today is an
 * @ic-reactor version, so anything else is drift until someone says otherwise.
 * Adding an entry here is the explicit way to say "this one is not ours".
 */
const ALLOWED_EXTERNAL_VERSIONS = new Set([])

const llmsPath = join(rootDir, "llms.txt")
const llmsText = readFileSync(llmsPath, "utf8")

const failures = []

// ── Current package versions ─────────────────────────────────────────────────
const currentVersions = new Map()
for (const { packageName, packageDir } of versionChecks) {
  const pkgPath = join(rootDir, "packages", packageDir, "package.json")
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
  currentVersions.set(packageName, pkg.version)
}
const validVersions = new Set(currentVersions.values())

// ── 1. The root llms.txt version table ───────────────────────────────────────
for (const { packageName } of versionChecks) {
  const expectedLine = `- \`${packageName}\`: \`${currentVersions.get(packageName)}\``

  if (!llmsText.includes(expectedLine)) {
    failures.push(
      `llms.txt is missing or out of date for ${packageName}. Expected line: ${expectedLine}`
    )
  }
}

// ── 2. Every package ships an AI guide ───────────────────────────────────────
for (const packageDir of requiredPackageLlms) {
  const packageLlmsPath = join(rootDir, "packages", packageDir, "llms.txt")
  if (!existsSync(packageLlmsPath)) {
    failures.push(`Missing package AI guide: packages/${packageDir}/llms.txt`)
  }
}

// ── 3. No stale version anywhere in the AI-context files ─────────────────────
// Matches every semver-shaped token regardless of how it is written: backticked,
// `v`-prefixed, or bare in prose. An earlier version of this check only matched
// the first two forms, so a stale bare "3.7.0" in a sentence passed silently --
// which defeats the point, since prose is exactly where these versions rot.
//
// The lookarounds keep it from matching a fragment of a longer dotted number
// (1.2.3.4) while still allowing a version at the end of a sentence ("v3.8.0.").
const SEMVER = /(?<![\d.])v?(\d+\.\d+\.\d+)(?![\d.]\d)/g

// Any /vN/ path segment, not just one inside markdown link syntax -- the same
// narrowness bug as above.
const VERSIONED_DOC_PATH = /\/v\d+\//g

for (const relPath of aiContextFiles) {
  const absPath = join(rootDir, relPath)
  if (!existsSync(absPath)) {
    failures.push(`Missing AI-context file: ${relPath}`)
    continue
  }
  const text = readFileSync(absPath, "utf8")

  text.split("\n").forEach((line, i) => {
    for (const [, version] of line.matchAll(SEMVER)) {
      if (validVersions.has(version)) continue
      if (ALLOWED_EXTERNAL_VERSIONS.has(version)) continue

      failures.push(
        `${relPath}:${i + 1} refers to version ${version}, which no @ic-reactor package is at. ` +
          `Current: ${[...currentVersions].map(([n, v]) => `${n}@${v}`).join(", ")}. ` +
          `If this version is not an @ic-reactor package, add it to ` +
          `ALLOWED_EXTERNAL_VERSIONS in scripts/check-ai-context.js.`
      )
    }

    // 4. Doc links must use the served base. /v4/ was never published and the
    //    docs workflow deletes it on every deploy, so such links 404.
    for (const seg of line.match(VERSIONED_DOC_PATH) ?? []) {
      if (seg !== DOCS_BASE) {
        failures.push(
          `${relPath}:${i + 1} references ${seg} but the docs site is served under ${DOCS_BASE}`
        )
      }
    }
  })
}

if (failures.length > 0) {
  console.error("AI context check failed:\n")
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log(
  `AI context check passed (${aiContextFiles.length} files, versions: ${[...validVersions].join(", ")}).`
)
