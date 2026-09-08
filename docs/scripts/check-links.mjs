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
import { mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, posix, resolve } from "node:path"
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
    // linkinator's default concurrency (100) overwhelms its own static server
    // once the crawl is a few hundred links: requests come back with status 0
    // (connection dropped, not a 404) and the gate fails intermittently on
    // whichever page lost the race. Capping concurrency and retrying transport
    // errors makes it deterministic -- a flaky gate gets ignored, which is the
    // failure mode this whole gate exists to avoid.
    concurrency: 25,
    retryErrors: true,
    retryErrorsCount: 3,
    linksToSkip: [
      // External links are someone else's uptime, not this repo's correctness.
      // linkinator resolves every internal link against its own server, which
      // binds 127.0.0.1 -- so this must exempt the local host explicitly or it
      // skips the entire site and the gate silently checks nothing.
      "^https?://(?!(localhost|127\\.0\\.0\\.1)[:/])",
    ],
  })

  // Case-sensitivity pass. linkinator serves the built site from the local
  // filesystem, so on macOS every href resolves case-insensitively and a link
  // that is a hard 404 on the Linux host comes back 200. That is not a
  // hypothetical: `starlight-page-actions` writes each page's `.md` companion
  // at the SOURCE-cased path while building the href from the lowercased route,
  // and the mismatch is invisible here without this check. Compare exact
  // strings against the real file set rather than asking the filesystem.
  const realFiles = new Set()
  const walk = async (dir, rel = "") => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) await walk(join(dir, e.name), r)
      else realFiles.add(r)
    }
  }
  await walk(join(docsRoot, "dist"))

  const caseBroken = []
  for (const page of [...realFiles].filter((f) => f.endsWith(".html"))) {
    const html = await readFile(join(docsRoot, "dist", page), "utf8")
    const route = `/${base}/${page.replace(/index\.html$/, "")}`
    for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
      if (/^(https?:|mailto:|#|\/\/)/.test(href)) continue
      const clean = href.split("#")[0].split("?")[0]
      if (!clean) continue
      const abs = clean.startsWith("/")
        ? clean
        : posix.normalize(posix.join(route, clean))
      if (!abs.startsWith(`/${base}/`)) continue
      let f = abs.slice(base.length + 2)
      if (f === "") f = "index.html"
      else if (f.endsWith("/")) f += "index.html"
      else if (!/\.[a-z0-9]+$/i.test(f)) f += "/index.html"
      if (!realFiles.has(f)) caseBroken.push(`${href}\n      <- ${route}`)
    }
  }
  if (caseBroken.length > 0) {
    console.error(
      `\n${caseBroken.length} link(s) resolve only on a case-insensitive filesystem ` +
        `- these are 404s on the Linux host that serves the site:\n`
    )
    for (const b of caseBroken.slice(0, 20)) console.error(`  ${b}`)
    if (caseBroken.length > 20)
      console.error(`  ... and ${caseBroken.length - 20} more`)
    process.exit(1)
  }

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
