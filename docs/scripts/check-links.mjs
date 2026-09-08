/**
 * Crawls the BUILT docs for broken links.
 *
 * Runs against `docs/dist` rather than the Markdown sources because the site's
 * hand-written hrefs are absolute and base-prefixed (`](/v3/...)`) -- they only
 * resolve once Astro has rendered routes under the configured base. Checking the
 * sources would miss exactly the links a page rename breaks.
 *
 * Astro writes the site to `dist/` root while emitting `/v3/`-prefixed hrefs, so
 * the crawl needs `dist` mounted AT the base rather than served as the web root.
 * A staging directory with a symlink gives that without copying 24 MB.
 *
 * The base is read from astro.config.mjs rather than hardcoded, so the two
 * cannot drift.
 */
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { LinkChecker } from "linkinator"

const docsRoot = resolve(import.meta.dirname, "..")

const config = await readFile(join(docsRoot, "astro.config.mjs"), "utf8")
const baseMatch = config.match(/^\s*base:\s*["'](.+?)["']/m)
if (!baseMatch) {
  console.error("Could not read `base` from astro.config.mjs")
  process.exit(1)
}
const base = baseMatch[1].replace(/^\/|\/$/g, "")

const staging = await mkdtemp(join(tmpdir(), "ic-reactor-links-"))
try {
  await symlink(join(docsRoot, "dist"), join(staging, base), "dir")

  const checker = new LinkChecker()
  const result = await checker.check({
    // The crawl root must be the DIRECTORY, not index.html. linkinator sets
    // `rootPath` to the full starting URL and only recurses into links whose
    // href string-prefixes it (build/src/index.js:271 and :892). With
    // `${base}/index.html` nothing on the site starts with that string, so the
    // crawl never leaves the home page: it reported "Checked 191 internal
    // links" for a 180-page site while visiting exactly one page.
    path: `${base}/`,
    serverRoot: staging,
    recurse: true,
    linksToSkip: [
      // External links are someone else's uptime, not this repo's correctness.
      // linkinator resolves every internal link against its own server, which
      // binds 127.0.0.1 -- so this must exempt the local host explicitly or it
      // skips the entire site and the gate silently checks nothing.
      "^https?://(?!(localhost|127\\.0\\.0\\.1)[:/])",
      // Scope limit, not noise suppression. typedoc-plugin-markdown emits
      // relative `../type-aliases/X.md` cross-links while Starlight nests the
      // route one level deeper, so these 404 for real. They are tracked
      // separately; this gate covers the rendered routes, which is what a page
      // rename breaks.
      "\\.md$",
    ],
  })

  const broken = result.links.filter((l) => l.state === "BROKEN")
  const checked = result.links.filter((l) => l.state !== "SKIPPED").length

  if (broken.length > 0) {
    console.error(`\n${broken.length} broken link(s):\n`)
    for (const link of broken) {
      console.error(`  [${link.status}] ${link.url}\n      <- ${link.parent}`)
    }
    process.exit(1)
  }

  console.log(
    `Checked ${checked} internal links under /${base}/ - no broken links.`
  )
} finally {
  await rm(staging, { recursive: true, force: true })
}
