#!/usr/bin/env node
/**
 * Rewrites TypeDoc's relative `.md` cross-links into absolute Starlight routes.
 *
 * typedoc-plugin-markdown writes links as paths between the `.md` FILES it
 * emitted, e.g. `libs/classes/DisplayReactor.md` links to
 * `../type-aliases/BaseActor.md`. Astro serves that source file at the route
 * `/v3/libs/classes/displayreactor/` — one segment deeper than the file's own
 * directory, per-segment lowercased, with a trailing slash. Astro leaves `.md`
 * hrefs in content-collection markdown untouched, so the href survives verbatim
 * into the HTML and the browser resolves it against the wrong directory:
 *
 *     ../type-aliases/BaseActor.md  from  /v3/libs/classes/displayreactor/
 *       -> /v3/libs/classes/type-aliases/BaseActor.md   404
 *       -> /v3/libs/type-aliases/baseactor/             the real page
 *
 * Runs after `typedoc` and before `astro build`. The base is read from
 * astro.config.mjs rather than hardcoded, matching check-links.mjs.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs"
import { join, posix, dirname, relative, resolve } from "node:path"

const docsRoot = resolve(import.meta.dirname, "..")
const LIBS = join(docsRoot, "src/content/docs/libs")

const astroConfig = readFileSync(join(docsRoot, "astro.config.mjs"), "utf8")
const baseMatch = astroConfig.match(/^\s*base:\s*["'](.+?)["']/m)
if (!baseMatch) {
  console.error(
    "rewrite-typedoc-links: could not read `base` from astro.config.mjs"
  )
  process.exit(1)
}
const base = "/" + baseMatch[1].replace(/^\/|\/$/g, "")

/** Starlight's slug rule for these pages: plain per-segment lowercase. */
const slug = (p) =>
  p
    .split("/")
    .map((s) => s.toLowerCase())
    .join("/")

/** `libs/type-aliases/BaseActor.md` -> `/v3/libs/type-aliases/baseactor/` */
function routeFor(libsRelativePath) {
  const noExt = libsRelativePath.replace(/\.md$/, "")
  if (noExt === "index") return `${base}/libs/`
  return `${base}/libs/${slug(noExt)}/`
}

function* markdownFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) yield* markdownFiles(full)
    else if (name.endsWith(".md")) yield full
  }
}

// Matches a markdown link whose target is a RELATIVE .md path. Absolute hrefs
// (the page-action `/v3/...md` links) and external URLs are left alone.
const RELATIVE_MD = /\]\((?!\/|https?:|#)([^)\s]+?\.md)(#[^)\s]*)?\)/g

let filesChanged = 0
let linksRewritten = 0

for (const file of markdownFiles(LIBS)) {
  const src = readFileSync(file, "utf8")
  const fileDir = dirname(relative(LIBS, file))
  const out = src.replace(RELATIVE_MD, (whole, target, hash = "") => {
    // resolve the target against the containing file's directory, as a reader
    // of the FILE tree would
    const resolved = posix.normalize(
      posix.join(fileDir === "." ? "" : fileDir, target)
    )
    if (resolved.startsWith("..")) return whole // escapes libs/; leave it alone
    linksRewritten++
    return `](${routeFor(resolved)}${hash})`
  })
  if (out !== src) {
    writeFileSync(file, out)
    filesChanged++
  }
}

console.log(
  `rewrote ${linksRewritten} TypeDoc cross-links across ${filesChanged} files -> ${base}/libs/**`
)
