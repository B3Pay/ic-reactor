#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { basename, join, posix } from "node:path"
import {
  AI_CONTEXT_FILES,
  CLAUDE_MARKETPLACE,
  RUNTIME_PLUGIN_MANIFESTS,
} from "./ai-context-files.js"

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

// Each of these ships `packages/<dir>/llms.txt` in its npm tarball, and the
// file must open with an "Applies to `@ic-reactor/<dir>` <version>." line.
const requiredPackageLlms = [
  "core",
  "react",
  "candid",
  "codegen",
  "cli",
  "vite-plugin",
  "parser",
]

/**
 * Files whose `https://ic-reactor.b3pay.net/...` links must resolve: the
 * AI-context files, plus the READMEs npm shows, the changelog and the
 * contributing guide. linkinator (`pnpm docs:check-links`) skips absolute
 * links to the site, so without this a renamed page left these dangling.
 */
const docsLinkFiles = [
  ...AI_CONTEXT_FILES,
  "README.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  ...requiredPackageLlms.map((dir) => `packages/${dir}/README.md`),
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
const aiContextFiles = AI_CONTEXT_FILES

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
const ALLOWED_EXTERNAL_VERSIONS = new Set([
  // `@icp-sdk/auth` peer majors named in llms-full.txt's install guidance.
  // v10 is the first to peer `@icp-sdk/core@^6`, which is what removes the
  // npm ERESOLVE; v8 is still supported. v9 is deliberately absent -- it peers
  // `@icp-sdk/core@^5` and is not a supported peer.
  "8.0.0",
  "10.0.0",
  // The `@tanstack/react-query` peer floor of @ic-reactor/react, named in
  // llms-full.txt's install section. `pnpm verify:peer-floors` tests it.
  "5.90.2",
])

const failures = []

// ── Current package versions ─────────────────────────────────────────────────
const currentVersions = new Map()
for (const { packageName, packageDir } of versionChecks) {
  const pkgPath = join(rootDir, "packages", packageDir, "package.json")
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
  currentVersions.set(packageName, pkg.version)
}
const validVersions = new Set(currentVersions.values())

// ── 1. The version lists of the root guides ──────────────────────────────────
// Both are published at the docs root and read by agents in consumer projects,
// so each states the exact versions it describes. release.js and
// release-tools.js rewrite these lines (they name the package).
for (const guide of ["llms.txt", "llms-full.txt"]) {
  const guideText = readFileSync(join(rootDir, guide), "utf8")
  for (const { packageName } of versionChecks) {
    const expectedLine = `- \`${packageName}\`: \`${currentVersions.get(packageName)}\``

    if (!guideText.includes(expectedLine)) {
      failures.push(
        `${guide} is missing or out of date for ${packageName}. Expected line: ${expectedLine}`
      )
    }
  }
}

// ── 2. Every package ships an AI guide stamped with its version ──────────────
// The stamp tells an agent reading node_modules/@ic-reactor/<dir>/llms.txt
// which release the guide describes. The generic version check below accepts
// any version some package is at, so it would not notice a stamp naming
// another lane's version; this compares against the package's own.
for (const packageDir of requiredPackageLlms) {
  const relPath = `packages/${packageDir}/llms.txt`
  const packageLlmsPath = join(rootDir, relPath)
  if (!existsSync(packageLlmsPath)) {
    failures.push(`Missing package AI guide: ${relPath}`)
    continue
  }
  const packageName = `@ic-reactor/${packageDir}`
  const version = currentVersions.get(packageName)
  const expectedStamp = `Applies to \`${packageName}\` ${version}.`
  const stamp = readFileSync(packageLlmsPath, "utf8")
    .split("\n")
    .find((line) => line.startsWith(`Applies to \`${packageName}\``))

  if (stamp === undefined) {
    failures.push(
      `${relPath} has no version stamp. Expected line: ${expectedStamp}`
    )
  } else if (stamp.trim() !== expectedStamp) {
    failures.push(
      `${relPath} is stamped "${stamp.trim()}" but ${packageName} is at ${version}. Expected line: ${expectedStamp}`
    )
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

// ── 5. Links to the docs site resolve ────────────────────────────────────────
// The site serves each page twice under DOCS_BASE: as a route, lowercased by
// Starlight (`/v3/reference/clientmanager/`), and as the Markdown companion
// starlight-page-actions writes at the SOURCE-cased path
// (`/v3/reference/ClientManager.md`, and `/v3/packages/candid.md` for
// `packages/candid/index.mdx`). The host is case-sensitive, so each form is
// matched exactly. A `#fragment` must name a heading of the page.
const DOCS_SITE = "https://ic-reactor.b3pay.net"
const DOCS_CONTENT = join(rootDir, "docs", "src", "content", "docs")
/** Published at the site root by .github/workflows/docs.yml. */
const SITE_ROOT_FILES = new Set(["", "llms.txt", "llms-full.txt"])

function* docsSources(dir, rel = "") {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryRel = rel ? `${rel}/${entry.name}` : entry.name
    // TypeDoc output, generated by docs:build and not in the repository.
    if (entry.isDirectory() && entryRel !== "libs") {
      yield* docsSources(join(dir, entry.name), entryRel)
    } else if (entry.isFile() && /\.mdx?$/.test(entry.name)) {
      yield entryRel
    }
  }
}

const sourcePages = new Set(docsSources(DOCS_CONTENT))
/** Route (lowercased, no trailing slash, "" for the home page) -> source file. */
const sourceByRoute = new Map()
for (const page of sourcePages) {
  const route = page
    .replace(/\.mdx?$/, "")
    .replace(/(^|\/)index$/, "")
    .toLowerCase()
  sourceByRoute.set(route, page)
}

/** The source page a /v3/ path names, or undefined. */
function resolveDocsPath(path) {
  if (path.endsWith(".md")) {
    const key = path.slice(0, -".md".length)
    // `packages/candid/index.md` is not published; `packages/candid.md` is.
    if (key.endsWith("/index")) return undefined
    return [
      `${key}.mdx`,
      `${key}.md`,
      `${key}/index.mdx`,
      `${key}/index.md`,
    ].find((candidate) => sourcePages.has(candidate))
  }
  const route = path.replace(/\/$/, "")
  const page = sourceByRoute.get(route.toLowerCase())
  // Starlight lowercases routes; a mixed-case route 404s on the host.
  return page !== undefined && route === route.toLowerCase() ? page : undefined
}

/** github-slugger's rule, which Starlight uses for heading ids. */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replace(/ /g, "-")
}

const headingIdsCache = new Map()
function headingIds(page) {
  if (headingIdsCache.has(page)) return headingIdsCache.get(page)
  const ids = new Set(["_top"])
  const seen = new Map()
  let fence = null
  for (const line of readFileSync(join(DOCS_CONTENT, page), "utf8").split(
    "\n"
  )) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/)
    if (fenceMatch) {
      if (fence === null) fence = fenceMatch[1]
      else if (fenceMatch[1].startsWith(fence)) fence = null
      continue
    }
    if (fence !== null) continue
    // A heading may open a list item, as the steps of a <Steps> block do.
    const heading = line.match(
      /^\s*(?:(?:\d+\.|[-*+])\s+)?#{1,6}\s+(.+?)\s*#*\s*$/
    )
    if (!heading) continue
    const text = heading[1]
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // [text](url) -> text
      .replace(/<[^>]+>/g, "") // inline HTML or JSX
      .replace(/</g, "") // a stray "<"; the slug drops it anyway
      .replace(/[`*]/g, "")
    const base = slugify(text)
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    ids.add(count === 0 ? base : `${base}-${count}`)
  }
  headingIdsCache.set(page, ids)
  return ids
}

const SITE_LINK = /https:\/\/ic-reactor\.b3pay\.net(\/[^\s)\]`>"'<]*)?/g

for (const relPath of docsLinkFiles) {
  const absPath = join(rootDir, relPath)
  if (!existsSync(absPath)) continue // a missing AI-context file is reported above
  readFileSync(absPath, "utf8")
    .split("\n")
    .forEach((line, i) => {
      for (const match of line.matchAll(SITE_LINK)) {
        const url = match[0].replace(/[.,;:]+$/, "")
        const [pathAndQuery, fragment] = url.slice(DOCS_SITE.length).split("#")
        const path = pathAndQuery.split("?")[0].replace(/^\//, "")
        const where = `${relPath}:${i + 1}`

        if (SITE_ROOT_FILES.has(path)) continue
        const base = DOCS_BASE.replace(/^\/|\/$/g, "") // "v3"
        if (path !== base && !path.startsWith(`${base}/`)) {
          failures.push(
            `${where} links ${url}, which is neither under ${DOCS_BASE} nor one of the files published at the site root`
          )
          continue
        }
        const docsPath = path === base ? "" : path.slice(base.length + 1)
        if (docsPath.startsWith("libs/")) continue // TypeDoc pages are generated

        const page = resolveDocsPath(docsPath)
        if (page === undefined) {
          failures.push(
            `${where} links ${url}, but no page in docs/src/content/docs serves it. ` +
              `Use the lowercase route (/v3/reference/clientmanager) or the source-cased ` +
              `Markdown path (/v3/reference/ClientManager.md).`
          )
        } else if (fragment && !headingIds(page).has(fragment)) {
          failures.push(
            `${where} links ${url}, but docs/src/content/docs/${page} has no heading with the id "${fragment}"`
          )
        }
      }
    })
}

// ── 6. Agent skills ──────────────────────────────────────────────────────────
// Every `skill-packages/<name>/SKILL.md`, and every skill a plugin in the
// marketplace installs, must load in the tools that read the Agent Skills
// format (https://agentskills.io/specification): YAML frontmatter with a
// `name` equal to its folder and a `description` of at most 1024 characters,
// and no key outside the spec, which claude.ai uploads and the Skills API
// reject.
const SKILLS_DIR = "skill-packages"
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SKILL_KEYS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
])

/**
 * The top-level keys of a SKILL.md's YAML frontmatter, or null when it has
 * none. Enough YAML for skill frontmatter: plain, quoted and multi-line plain
 * scalars, `>`/`|` block scalars (folded or kept), and one level of nested
 * mapping for `metadata`. Anything else is reported rather than guessed at.
 */
function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/)
  if (!match) return null
  const lines = match[1].split(/\r?\n/)
  const fields = {}
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      i++
      continue
    }
    const keyMatch = line.match(/^([A-Za-z][\w-]*):(?:[ \t]+(.*))?$/)
    if (!keyMatch) throw new Error(`cannot read frontmatter line "${line}"`)
    const key = keyMatch[1]
    const inline = (keyMatch[2] ?? "").trim()
    i++
    const block = []
    while (
      i < lines.length &&
      (lines[i].trim() === "" || /^\s/.test(lines[i]))
    ) {
      block.push(lines[i])
      i++
    }
    while (block.length > 0 && block[block.length - 1].trim() === "")
      block.pop()

    if (/^[>|][+-]?$/.test(inline)) {
      const indent = Math.min(
        ...block.filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length)
      )
      const body = block.map((l) => l.slice(indent))
      fields[key] =
        inline[0] === "|"
          ? body.join("\n")
          : body
              .join("\n")
              .replace(/([^\n])\n(?=[^\n])/g, "$1 ")
              .replace(/\n\n/g, "\n")
    } else if (inline === "" && block.length > 0) {
      fields[key] = Object.fromEntries(
        block
          .filter((l) => l.trim())
          .map((l) => {
            const entry = l.trim().match(/^([\w-]+):\s*(.*)$/)
            if (!entry) throw new Error(`cannot read "${l.trim()}" in ${key}`)
            return [entry[1], entry[2].replace(/^(["'])(.*)\1$/, "$2")]
          })
      )
    } else {
      const value = [inline, ...block.map((l) => l.trim())]
        .filter(Boolean)
        .join(" ")
      fields[key] = value.replace(/^(["'])(.*)\1$/s, "$2")
    }
  }
  return fields
}

function checkSkill(relSkillMd) {
  const absPath = join(rootDir, relSkillMd)
  let fields
  try {
    fields = parseFrontmatter(readFileSync(absPath, "utf8"))
  } catch (error) {
    failures.push(`${relSkillMd}: ${error.message}`)
    return
  }
  if (fields === null) {
    failures.push(
      `${relSkillMd} has no YAML frontmatter; it must open with ---, name: and description:`
    )
    return
  }
  const folder = basename(posix.dirname(relSkillMd))
  const { name, description } = fields
  if (typeof name !== "string" || !SKILL_NAME.test(name) || name.length > 64) {
    failures.push(
      `${relSkillMd}: name must be 1-64 lowercase letters, digits and single hyphens (got ${JSON.stringify(name)})`
    )
  } else if (name !== folder) {
    failures.push(
      `${relSkillMd}: name "${name}" must match its folder "${folder}"`
    )
  }
  if (typeof description !== "string" || description.trim() === "") {
    failures.push(`${relSkillMd}: description is missing`)
  } else if (description.length > 1024) {
    failures.push(
      `${relSkillMd}: description is ${description.length} characters; the limit is 1024`
    )
  }
  for (const key of Object.keys(fields)) {
    if (!SKILL_KEYS.has(key)) {
      failures.push(
        `${relSkillMd}: frontmatter key "${key}" is not in the Agent Skills spec (${[...SKILL_KEYS].join(", ")})`
      )
    }
  }
}

/** Markdown files of a skill folder, relative to the repository root. */
function* skillMarkdown(relDir) {
  for (const entry of readdirSync(join(rootDir, relDir), {
    withFileTypes: true,
  })) {
    const rel = `${relDir}/${entry.name}`
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      yield* skillMarkdown(rel)
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      yield rel
    }
  }
}

const checkedSkills = new Set()
for (const entry of readdirSync(join(rootDir, SKILLS_DIR), {
  withFileTypes: true,
})) {
  if (!entry.isDirectory()) continue
  const relSkillMd = `${SKILLS_DIR}/${entry.name}/SKILL.md`
  if (!existsSync(join(rootDir, relSkillMd))) {
    failures.push(`${SKILLS_DIR}/${entry.name}/ has no SKILL.md`)
    continue
  }
  checkSkill(relSkillMd)
  checkedSkills.add(relSkillMd)
  // What a skill tells an agent must be version- and link-checked like the
  // other AI files, so a new reference file cannot slip past this script.
  for (const relMd of skillMarkdown(`${SKILLS_DIR}/${entry.name}`)) {
    if (/\/(SKILL\.md|references\/[^/]+\.md)$/.test(relMd)) {
      if (!AI_CONTEXT_FILES.includes(relMd)) {
        failures.push(
          `${relMd} is not listed in scripts/ai-context-files.js, so its versions and links go unchecked and releases do not update it`
        )
      }
    }
  }
}

// ── 7. The Claude Code plugin marketplace ────────────────────────────────────
// `/plugin marketplace add B3Pay/ic-reactor` reads CLAUDE_MARKETPLACE from the
// default branch; each relative `source` is a plugin directory holding
// `.claude-plugin/plugin.json` and its skills. `claude plugin validate .`
// checks the same shape, but it is not installed in CI.
const currentReact = currentVersions.get("@ic-reactor/react")
/** Folders whose skills an app installs: every text an agent loads from them
 * must stand on the published packages alone. */
const consumerSkillDirs = []

function readJson(relPath) {
  try {
    return JSON.parse(readFileSync(join(rootDir, relPath), "utf8"))
  } catch (error) {
    failures.push(`${relPath} is not valid JSON: ${error.message}`)
    return undefined
  }
}

const isDirectory = (relPath) =>
  existsSync(join(rootDir, relPath)) &&
  statSync(join(rootDir, relPath)).isDirectory()

if (!existsSync(join(rootDir, CLAUDE_MARKETPLACE))) {
  failures.push(`Missing Claude Code marketplace: ${CLAUDE_MARKETPLACE}`)
} else {
  const marketplace = readJson(CLAUDE_MARKETPLACE)
  if (marketplace !== undefined) {
    if (
      typeof marketplace.name !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(marketplace.name)
    ) {
      failures.push(
        `${CLAUDE_MARKETPLACE}: name must be letters, digits, ".", "_" and "-", starting with a letter or digit`
      )
    }
    if (typeof marketplace.owner?.name !== "string") {
      failures.push(`${CLAUDE_MARKETPLACE}: owner.name is required`)
    }
    if (
      !Array.isArray(marketplace.plugins) ||
      marketplace.plugins.length === 0
    ) {
      failures.push(
        `${CLAUDE_MARKETPLACE}: plugins must list at least one plugin`
      )
    }
    for (const [i, entry] of (marketplace.plugins ?? []).entries()) {
      const where = `${CLAUDE_MARKETPLACE} plugins[${i}]`
      const { source } = entry
      if (typeof entry.name !== "string" || /\s/.test(entry.name)) {
        failures.push(`${where}: name is required and has no spaces`)
      }
      if (
        typeof source !== "string" ||
        !source.startsWith("./") ||
        source.split("/").includes("..")
      ) {
        failures.push(
          `${where}: source must be a "./" path inside the repository (got ${JSON.stringify(source)})`
        )
        continue
      }
      const pluginDir = posix.normalize(source).replace(/\/$/, "")
      if (!isDirectory(pluginDir)) {
        failures.push(`${where}: source ${source} is not a directory`)
        continue
      }
      if ("version" in entry) {
        failures.push(
          `${where}: set version in ${pluginDir}/.claude-plugin/plugin.json only; Claude Code ignores the entry's when both are set`
        )
      }
      const manifestPath = `${pluginDir}/.claude-plugin/plugin.json`
      if (!existsSync(join(rootDir, manifestPath))) {
        failures.push(`${where}: ${manifestPath} is missing`)
        continue
      }
      const manifest = readJson(manifestPath)
      if (manifest === undefined) continue
      if (manifest.name !== entry.name) {
        failures.push(
          `${manifestPath}: name "${manifest.name}" must equal the marketplace entry's "${entry.name}", or installing by one name fails`
        )
      }
      if (typeof manifest.description !== "string") {
        failures.push(`${manifestPath}: description is required`)
      }
      if (typeof manifest.author?.name !== "string") {
        failures.push(`${manifestPath}: author.name is required`)
      }
      if (manifest.version !== undefined) {
        if (!RUNTIME_PLUGIN_MANIFESTS.includes(manifestPath)) {
          failures.push(
            `${manifestPath} sets a version but is not in RUNTIME_PLUGIN_MANIFESTS (scripts/ai-context-files.js), so no release would update it`
          )
        } else if (manifest.version !== currentReact) {
          failures.push(
            `${manifestPath} is at version ${manifest.version} but @ic-reactor/react is at ${currentReact}; installed copies update only when it changes`
          )
        }
      }

      // Its skills: SKILL.md at the plugin root, or skills/<name>/SKILL.md.
      const skillFiles = []
      if (existsSync(join(rootDir, pluginDir, "SKILL.md"))) {
        skillFiles.push(`${pluginDir}/SKILL.md`)
      }
      if (isDirectory(`${pluginDir}/skills`)) {
        for (const dir of readdirSync(join(rootDir, pluginDir, "skills"))) {
          const rel = `${pluginDir}/skills/${dir}/SKILL.md`
          if (existsSync(join(rootDir, rel))) skillFiles.push(rel)
        }
      }
      if (skillFiles.length === 0) {
        failures.push(
          `${where}: ${pluginDir} holds no SKILL.md at its root or under skills/<name>/`
        )
      }
      for (const rel of skillFiles) {
        if (!checkedSkills.has(rel)) checkSkill(rel)
        consumerSkillDirs.push(posix.dirname(rel))
      }
    }
  }
}

for (const relPath of RUNTIME_PLUGIN_MANIFESTS) {
  if (!existsSync(join(rootDir, relPath))) {
    failures.push(
      `RUNTIME_PLUGIN_MANIFESTS names ${relPath}, which does not exist`
    )
  }
}

// ── 8. Consumer skills stand on the published packages ───────────────────────
// A consumer skill runs in an app's repository, where `packages/react/src` or
// `examples/...` do not exist; it may point only at the public API, the docs
// site and node_modules/@ic-reactor/*/llms.txt. It must also state the version
// of each package it describes, as `- \`@ic-reactor/<pkg>\`: \`<version>\``,
// the line shape the release scripts rewrite.
const REPO_PATH =
  /(?<![\w@/.-])(?:packages|examples|skill-packages|scripts|e2e|docs\/src)\/[\w.-][\w./-]*/
const VERSION_LINE = /^- `(@ic-reactor\/[\w-]+)`: `([^`]+)`\s*$/

for (const skillDir of consumerSkillDirs) {
  for (const relMd of skillMarkdown(skillDir)) {
    // What the agent loads: SKILL.md and its references. README.md is for
    // people browsing the repository.
    if (!/\/(SKILL\.md|references\/[^/]+\.md)$/.test(relMd)) continue
    readFileSync(join(rootDir, relMd), "utf8")
      .split("\n")
      .forEach((line, i) => {
        const found = line.match(REPO_PATH)
        if (found) {
          failures.push(
            `${relMd}:${i + 1} names the repository path "${found[0]}", which an app does not have; link the docs site or node_modules/@ic-reactor/<package>/llms.txt instead`
          )
        }
      })
  }

  const skillMd = `${skillDir}/SKILL.md`
  const listed = readFileSync(join(rootDir, skillMd), "utf8")
    .split("\n")
    .map((line) => line.match(VERSION_LINE))
    .filter(Boolean)
  if (!listed.some(([, name]) => name === "@ic-reactor/react")) {
    failures.push(
      `${skillMd} must list the versions it describes, one line per package, such as: - \`@ic-reactor/react\`: \`${currentReact}\``
    )
  }
  for (const [line, name, version] of listed) {
    const current = currentVersions.get(name)
    if (current === undefined) {
      failures.push(`${skillMd}: "${line.trim()}" names no @ic-reactor package`)
    } else if (version !== current) {
      failures.push(`${skillMd}: "${line.trim()}" but ${name} is at ${current}`)
    }
  }
}

if (failures.length > 0) {
  console.error("AI context check failed:\n")
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log(
  `AI context check passed (${aiContextFiles.length} files, ${requiredPackageLlms.length} package guides, ` +
    `${checkedSkills.size} skills, ${consumerSkillDirs.length} plugin skill(s), ` +
    `docs links in ${docsLinkFiles.length} files, versions: ${[...validVersions].join(", ")}).`
)
