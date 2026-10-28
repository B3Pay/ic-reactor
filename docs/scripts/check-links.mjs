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
 *
 * The pages also link Candid Core's site, which the deploy serves at
 * `/candid-core/` from a build of its own repository
 * (scripts/assemble-docs-site.mjs). `CANDID_CORE_SITE` names that build
 * (`website/dist` of a B3Pay/Meant checkout, after
 * `node website/build.mjs`; a relative path is read from docs/, where it runs),
 * and it is mounted there too: each such link and its `#fragment` are checked
 * against the real pages, and those pages are crawled as well, as they will be
 * published. Without it those links are skipped and counted, and in CI (`CI`
 * set) the check fails instead.
 */
import { mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { existsSync } from "node:fs"
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

// Where the deploy serves Candid Core's site (CANDID_CORE_DIR in
// scripts/assemble-docs-site.mjs).
const candidCoreDir = "candid-core"
const candidCoreSite = process.env.CANDID_CORE_SITE
  ? resolve(process.env.CANDID_CORE_SITE)
  : undefined
if (candidCoreSite && !existsSync(join(candidCoreSite, "index.html"))) {
  console.error(
    `CANDID_CORE_SITE=${candidCoreSite} holds no built Candid Core site (no index.html)`
  )
  process.exit(1)
}
if (!candidCoreSite && process.env.CI) {
  console.error(
    `CANDID_CORE_SITE is not set: in CI the links under /${candidCoreDir}/ are checked against a build of B3Pay/Meant's site`
  )
  process.exit(1)
}
// linkinator matches a skip pattern against the absolute URL, and reports a
// link of its own server by its path from the server root.
const candidCoreUrl = new RegExp(
  `^(https?://(localhost|127\\.0\\.0\\.1)(:\\d+)?/|/)?${candidCoreDir}(/|$)`
)
const candidCoreRoot = new RegExp(
  `^(https?://(localhost|127\\.0\\.0\\.1)(:\\d+)?/|/)?${candidCoreDir}/?$`
)

const staging = await mkdtemp(join(tmpdir(), "ic-reactor-links-"))
try {
  await symlink(join(docsRoot, "dist"), join(staging, base), "dir")
  if (candidCoreSite) {
    await symlink(candidCoreSite, join(staging, candidCoreDir), "dir")
  }

  const options = {
    // The crawl root must be the DIRECTORY, not index.html. linkinator sets
    // `rootPath` to the full starting URL and only recurses into links whose
    // href string-prefixes it (build/src/index.js:271 and :892). With
    // `${base}/index.html` nothing on the site starts with that string, so the
    // crawl never leaves the home page: it reported "Checked 191 internal
    // links" for a 180-page site while visiting exactly one page.
    path: `${base}/`,
    serverRoot: staging,
    recurse: true,
    // A `#fragment` must name an id on its page, so a reworded heading that
    // breaks a link like `/v4/guides/ssr/#a-read-...` fails here.
    checkFragments: true,
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
      // Without a build of Candid Core's site, its links cannot be checked.
      ...(candidCoreSite ? [] : [candidCoreUrl.source]),
    ],
  }
  const result = await new LinkChecker().check(options)
  // Candid Core's own pages, as they will be published: the crawl above only
  // follows links under the base, so it stops at their entry links.
  const candidCoreResult = candidCoreSite
    ? await new LinkChecker().check({ ...options, path: `${candidCoreDir}/` })
    : { links: [] }

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

  const broken = [...result.links, ...candidCoreResult.links].filter(
    (l) => l.state === "BROKEN"
  )
  const checked = result.links.filter((l) => l.state !== "SKIPPED")
  // What the crawl of Candid Core's pages reached past the home page it
  // started from, which it reports twice (`candid-core`, then `candid-core/`).
  const candidCoreReached = new Set(
    candidCoreResult.links
      .filter((l) => l.state !== "SKIPPED" && !candidCoreRoot.test(l.url))
      .map((l) => l.url)
  )
  // linkinator reports a skipped URL once per page that links it.
  const candidCoreSkipped = new Set(
    result.links
      .filter((l) => l.state === "SKIPPED" && candidCoreUrl.test(l.url))
      .map((l) => l.url)
  )

  if (broken.length > 0) {
    console.error(`\n${broken.length} broken link(s):\n`)
    for (const link of broken) {
      console.error(`  [${link.status}] ${link.url}\n      <- ${link.parent}`)
    }
    process.exit(1)
  }

  // A mounted site whose crawl reached nothing past its home page was not
  // checked.
  if (candidCoreSite && candidCoreReached.size === 0) {
    console.error(
      `The crawl of /${candidCoreDir}/ reached nothing past its home page: is ${candidCoreSite} the site's website/dist?`
    )
    process.exit(1)
  }

  console.log(
    `Checked ${checked.length} internal links under /${base}/ - no broken links.`
  )
  if (candidCoreSite) {
    const entries = checked.filter((l) => candidCoreUrl.test(l.url)).length
    console.log(
      `${entries} of them reach Candid Core's site under /${candidCoreDir}/, and the crawl of its pages reached ${candidCoreReached.size} more, none broken (built at ${candidCoreSite}).`
    )
  } else {
    console.log(
      `${candidCoreSkipped.size} links under /${candidCoreDir}/ were not checked: set CANDID_CORE_SITE to a build of B3Pay/Meant's site (website/dist).`
    )
  }
} finally {
  await rm(staging, { recursive: true, force: true })
}
