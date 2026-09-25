#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { AI_CONTEXT_FILES } from "./ai-context-files.js"

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

if (failures.length > 0) {
  console.error("AI context check failed:\n")
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log(
  `AI context check passed (${aiContextFiles.length} files, ${requiredPackageLlms.length} package guides, ` +
    `docs links in ${docsLinkFiles.length} files, versions: ${[...validVersions].join(", ")}).`
)
