#!/usr/bin/env node
/**
 * Post-`astro build` repairs to the built site, for two things neither Astro
 * nor the plugins get right on their own.
 *
 * 1. PAGE-ACTION MARKDOWN LINKS. `starlight-page-actions` writes each page's
 *    `.md` companion at the SOURCE-cased path but builds the href from the
 *    RENDERED ROUTE, which Starlight lowercases. TypeDoc filenames are
 *    PascalCase, so every such link on a mixed-case page 404s:
 *
 *      href  /v3/libs/classes/authenticationmanager.md
 *      file  dist/libs/classes/AuthenticationManager.md
 *
 *    This is invisible on macOS, whose filesystem is case-insensitive, and a
 *    hard 404 on the Linux host. The home page has a second variant of the same
 *    bug: its href is `${base}.md`, but the file is served at `${base}/index.md`.
 *
 *    We repoint the hrefs at the files that exist rather than emitting
 *    lowercase duplicates, so the already-deployed source-cased URLs keep
 *    working and nothing is published twice.
 *
 * 2. llms.txt. The plugin builds it from the site origin and drops the base
 *    path, so every entry points one level above the real page. Setting
 *    `baseUrl` in astro.config.mjs does not help: the plugin reduces the URL to
 *    `urlObj.origin`.
 */
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  existsSync,
} from "node:fs"
import { join, resolve } from "node:path"

const docsRoot = resolve(import.meta.dirname, "..")
const DIST = join(docsRoot, "dist")

const astroConfig = readFileSync(join(docsRoot, "astro.config.mjs"), "utf8")
const base =
  "/" +
  (astroConfig.match(/^\s*base:\s*["'](.+?)["']/m)?.[1] ?? "").replace(
    /^\/|\/$/g,
    ""
  )
const site = astroConfig
  .match(/^\s*site:\s*["'](.+?)["']/m)?.[1]
  ?.replace(/\/$/, "")
if (base === "/" || !site) {
  console.error(
    "fix-dist-links: could not read `base`/`site` from astro.config.mjs"
  )
  process.exit(1)
}

function* files(dir, rel = "") {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const r = rel ? `${rel}/${name}` : name
    if (statSync(full).isDirectory()) yield* files(full, r)
    else yield [full, r]
  }
}

// Two exact sets. `real` is compared by STRING, never with existsSync: macOS
// resolves paths case-insensitively, so existsSync reports every lowercase
// page-action href as already valid and this script silently fixes nothing --
// while the same href is a hard 404 on the Linux host that serves the site.
const real = new Set()
const byLower = new Map()
for (const [, rel] of files(DIST)) {
  if (!rel.endsWith(".md")) continue
  real.add(rel)
  byLower.set(rel.toLowerCase(), rel)
}

let hrefsFixed = 0
let pagesTouched = 0
for (const [full, rel] of files(DIST)) {
  if (!rel.endsWith(".html")) continue
  const src = readFileSync(full, "utf8")
  const out = src.replace(/href="([^"]+\.md)"/g, (whole, href) => {
    // `${base}.md` on the home page -> the real `${base}/index.md`
    if (href === `${base}.md`) {
      if (!real.has("index.md")) return whole
      hrefsFixed++
      return `href="${base}/index.md"`
    }
    if (!href.startsWith(`${base}/`)) return whole
    const wanted = href.slice(base.length + 1)
    if (real.has(wanted)) return whole // exact match; already correct
    const actual = byLower.get(wanted.toLowerCase())
    if (!actual) return whole // genuinely missing; leave it for the link gate
    hrefsFixed++
    return `href="${base}/${actual}"`
  })
  if (out !== src) {
    writeFileSync(full, out)
    pagesTouched++
  }
}

// llms.txt: `https://host/foo/` -> `https://host/v3/foo/`
let llmsFixed = 0
for (const name of ["llms.txt", "llms-full.txt"]) {
  const p = join(DIST, name)
  if (!existsSync(p)) continue
  const src = readFileSync(p, "utf8")
  const out = src.replace(
    new RegExp(
      `${site.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!${base}/)/`,
      "g"
    ),
    () => {
      llmsFixed++
      return `${site}${base}/`
    }
  )
  if (out !== src) writeFileSync(p, out)
}

console.log(
  `fix-dist-links: repointed ${hrefsFixed} .md hrefs across ${pagesTouched} pages; ` +
    `prefixed ${llmsFixed} llms.txt URLs with ${base}`
)
