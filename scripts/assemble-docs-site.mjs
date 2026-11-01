#!/usr/bin/env node
/**
 * Assembles the whole Pages site that .github/workflows/docs.yml deploys.
 *
 * A Pages deploy replaces the site, so every deploy carries every line:
 *
 * - `/v4/`: the 4.x docs, built from this commit (main). With
 *   `--v4-moved-to`, they are served at that address instead (b3pay.net's
 *   IC Reactor module, which .github/workflows/b3pay-site.yml publishes), and
 *   `/v4/` keeps, for each page of the build, a page that sends the reader to
 *   the same page there, with the build's Markdown copies and `llms.txt`
 *   beside them.
 * - `/v3/`: the 3.x docs. By default (`--v3-line`) they are rebuilt from the
 *   `v3` branch on every deploy, with that branch's `llms.txt` and
 *   `llms-full.txt` beside them. Without `--v3-line`, `/v3/` must already be
 *   in the existing site (a static snapshot committed to `gh-pages`), and is
 *   kept as it is.
 * - `/v2/`: the static 2.x TypeDoc site, moved under `/v2/` once from the
 *   legacy root of `gh-pages`.
 * - `/candid-core/`: Candid Core's site, built from its own repository
 *   (B3Pay/Meant, `node website/build.mjs`) and published as it was
 *   built. It has no versions of its own here: the deploy builds that
 *   repository's `main`. Its pages link each other and their assets
 *   relatively, so they work under any prefix. With
 *   `--candid-core-moved-to`, `/candid-core/` keeps only a page for each of
 *   them that sends the reader to that page at the new address.
 * - the root: `index.html` sends readers to `/v4/`, or where the 4.x docs
 *   moved, `404.html` sends a miss to the line it is under or to `/v4/`,
 *   `llms.txt` is the 4.x consumer guide (`packages/core/llms.txt`), and
 *   `llms-full.txt` is whatever `--root-llms-full` names (the frozen 3.x file
 *   by default), or absent.
 *
 * It also points each page's version selector at the three lines and rewrites
 * the 2.x site's legacy links.
 *
 * Usage (docs.yml):
 *   node scripts/assemble-docs-site.mjs --out final-docs \
 *     --existing existing-pages --v4 docs/dist --v3-line v3-line \
 *     --candid-core candid-core-site \
 *     --root-llms packages/core/llms.txt --root-llms-full v3-line/llms-full.txt \
 *     --cname CNAME \
 *     --v4-moved-to https://b3pay.net/docs/ic-reactor/ \
 *     --candid-core-moved-to https://b3pay.net/docs/meant/
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

/** The line a reader lands on: the root, the 404 page and the selector. */
export const CURRENT_LINE = "v4"
export const LINES = ["v4", "v3", "v2"]

/** Where Candid Core's site is served: the 4.x pages link it here. */
export const CANDID_CORE_DIR = "candid-core"

/** Root entries that are not part of the legacy 2.x site. */
const ROOT_KEEP = new Set([
  "v2",
  "v3",
  "v4",
  CANDID_CORE_DIR,
  "llms.txt",
  "llms-full.txt",
  "CNAME",
  ".nojekyll",
])

const LINK_REWRITES = [
  ["https://ic-reactor.b3pay.net/ic-reactor/", "/v2/"],
  ["ic-reactor.b3pay.net/ic-reactor", "ic-reactor.b3pay.net/v2"],
  [
    "https://b3pay.github.io/ic-reactor/modules/core.html",
    "/v3/packages/core/",
  ],
  [
    "https://b3pay.github.io/ic-reactor/modules/parser.html",
    "/v3/packages/parser/",
  ],
  [
    "https://b3pay.github.io/ic-reactor/modules/react.html",
    "/v3/packages/react/",
  ],
  [
    "https://b3pay.github.io/ic-reactor/modules/visitor.html",
    "/v3/packages/candid/",
  ],
  ["https://b3pay.github.io/ic-reactor/", "/v3/"],
]

const SELECTOR_HTML = `<select id="version-select" onchange="handleVersionChange(event)" aria-label="Select version">
${LINES.map((line) => `        <option value="${line}">${line}</option>`).join("\n")}
      </select>`

// A page outside the three lines (none today) shows the current one.
const PATCH_SCRIPT = `<script id="ic-reactor-version-selector-patch">
      (function () {
        var select = document.getElementById("version-select");
        if (!select) return;
        var match = window.location.pathname.match(/^\\/(v2|v3|v4)(\\/|$)/);
        var currentVersion = match ? match[1] : "${CURRENT_LINE}";
        select.value = currentVersion;
        select.addEventListener("change", function (event) {
          var version = event.target.value;
          var path = window.location.pathname || "/";
          var nextPath = /^\\/v[234](\\/|$)/.test(path)
            ? path.replace(/^\\/v[234](?=\\/|$)/, "/" + version)
            : "/" + version + "/";
          window.location.href = nextPath + window.location.search + window.location.hash;
        });
      })();
    </script>`

const ROOT_INDEX = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0; url=/${CURRENT_LINE}/" />
    <title>IC Reactor Docs</title>
    <script>
      window.location.replace("/${CURRENT_LINE}/");
    </script>
  </head>
  <body>
    <p>Redirecting to the <a href="/${CURRENT_LINE}/">ic-reactor 4 documentation</a>…</p>
  </body>
</html>
`

// Unknown routes go to the current line, keeping the path; a miss under a
// versioned base, or under Candid Core's site, goes to that base's home rather
// than looping on 404.html.
const NOT_FOUND = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Not Found</title>
    <script>
      (function () {
        var path = window.location.pathname || "/";
        var match = path.match(/^\\/(v2|v3|v4|${CANDID_CORE_DIR})(\\/|$)/);
        if (match) {
          window.location.replace("/" + match[1] + "/");
          return;
        }
        window.location.replace("/${CURRENT_LINE}" + path);
      })();
    </script>
  </head>
  <body>
    <p>Redirecting...</p>
  </body>
</html>
`

const escapeAttribute = (text) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")

/**
 * A page that sends the reader to `href`, the query and #fragment kept. The
 * script goes first, so they survive; the refresh is for a reader without
 * JavaScript, and the canonical link tells a search engine where the page is
 * now.
 */
export function movedPage(href) {
  const attribute = escapeAttribute(href)
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Moved</title>
    <link rel="canonical" href="${attribute}" />
    <script>
      window.location.replace(${JSON.stringify(href)} + window.location.search + window.location.hash);
    </script>
    <meta http-equiv="refresh" content="0; url=${attribute}" />
  </head>
  <body>
    <p>This page has moved to <a href="${attribute}">${attribute}</a>.</p>
  </body>
</html>
`
}

/**
 * The address a line moved to: https, with no query or fragment, and a path
 * ending in "/", since each page's address is resolved against it.
 */
function movedAddress(value, option) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${option} must be an address, not ${value}`)
  }
  if (
    url.protocol !== "https:" ||
    !url.pathname.endsWith("/") ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `${option} must be an https address whose path ends in "/", not ${value}`
    )
  }
  return url
}

function* files(dir, base = dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* files(path, base)
    else if (entry.isFile()) yield relative(base, path).split(sep).join("/")
  }
}

/**
 * Writes `to` as the pages of the build `from` that moved: each HTML page
 * becomes a page sending the reader to `target(path)`, the files `keep`
 * accepts are copied as built, and nothing else is published.
 */
function writeMoved(from, to, target, keep = () => false) {
  rmSync(to, { recursive: true, force: true })
  for (const path of files(from)) {
    const file = join(to, ...path.split("/"))
    if (path.endsWith(".html")) {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, movedPage(target(path)))
    } else if (keep(path)) {
      mkdirSync(dirname(file), { recursive: true })
      cpSync(join(from, ...path.split("/")), file)
    }
  }
}

/**
 * Where a page of the 4.x build is in b3pay.net's IC Reactor module: the
 * same path, but for the docs home and `ic-reactor/`, whose page is the
 * module's home (b3pay-module.json leaves out `index.mdx` and `404.mdx` and
 * renames `ic-reactor/index.mdx`).
 */
export function v4MovedTarget(base, path) {
  const route = path.replace(/(^|\/)index\.html$/, "$1")
  if (route === "" || route === "404.html" || route === "ic-reactor/") {
    return base.href
  }
  return new URL(route, base).href
}

/** Where a page of Candid Core's flat site is at its new address. */
export function candidCoreMovedTarget(base, path) {
  if (path === "index.html" || path === "404.html") return base.href
  return new URL(path, base).href
}

function copyDir(from, to) {
  rmSync(to, { recursive: true, force: true })
  mkdirSync(to, { recursive: true })
  cpSync(from, to, { recursive: true })
}

function* pages(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* pages(path)
    else if (entry.isFile() && /\.(html|md|mdx)$/.test(entry.name)) yield path
  }
}

/**
 * @param {object} options
 * @param {string} options.out the site directory to write (created; must not hold files)
 * @param {string} [options.existing] the checkout of `gh-pages`, when there is one
 * @param {string} options.v4 the 4.x docs build (`docs/dist`)
 * @param {string} [options.v3Line] the checkout of the `v3` branch, its docs built; omit to keep a static `/v3/` from `existing`
 * @param {string} options.candidCore Candid Core's built site (`website/dist` of its repository)
 * @param {string} options.rootLlms the file served at `/llms.txt`
 * @param {string} [options.rootLlmsFull] the file served at `/llms-full.txt`; omit to serve none
 * @param {string} [options.cname] the CNAME file to keep
 * @param {string} [options.v4MovedTo] where the 4.x docs are served instead of `/v4/`
 * @param {string} [options.candidCoreMovedTo] where Candid Core's site is served instead of `/candid-core/`
 * @param {(line: string) => void} [options.log]
 */
export function assembleSite({
  out,
  existing,
  v4,
  v3Line,
  candidCore,
  rootLlms,
  rootLlmsFull,
  cname,
  v4MovedTo,
  candidCoreMovedTo,
  log = console.log,
}) {
  if (!out || !v4 || !candidCore || !rootLlms) {
    throw new Error("assembleSite needs out, v4, candidCore and rootLlms")
  }
  const v4Moved = v4MovedTo && movedAddress(v4MovedTo, "--v4-moved-to")
  const candidCoreMoved =
    candidCoreMovedTo &&
    movedAddress(candidCoreMovedTo, "--candid-core-moved-to")
  if (existsSync(out) && readdirSync(out).length > 0) {
    throw new Error(`${out} is not empty`)
  }
  mkdirSync(out, { recursive: true })

  if (existing && existsSync(existing)) {
    // Its visible entries, as `cp -r existing-pages/*` copied them: not
    // `.git` or any other dotfile.
    for (const name of readdirSync(existing)) {
      if (name.startsWith(".")) continue
      cpSync(join(existing, name), join(out, name), { recursive: true })
    }
  } else {
    log("No existing Pages content: treating this as the first deploy.")
  }

  // The legacy 2.x TypeDoc site sat at the root of gh-pages: move it under
  // /v2/ once.
  if (!existsSync(join(out, "v2"))) {
    mkdirSync(join(out, "v2"))
    for (const name of readdirSync(out)) {
      if (ROOT_KEEP.has(name)) continue
      renameSync(join(out, name), join(out, "v2", name))
    }
  }

  // The 3.x line.
  if (v3Line) {
    const dist = join(v3Line, "docs", "dist")
    if (!existsSync(join(dist, "index.html"))) {
      throw new Error(`${dist} holds no built 3.x docs (no index.html)`)
    }
    copyDir(dist, join(out, "v3"))
    for (const file of ["llms.txt", "llms-full.txt"]) {
      if (existsSync(join(v3Line, file))) {
        cpSync(join(v3Line, file), join(out, "v3", file))
      }
    }
  } else if (!existsSync(join(out, "v3", "index.html"))) {
    throw new Error(
      "No --v3-line and no static /v3/ in the existing site: refusing to publish a site without the 3.x docs."
    )
  } else {
    log("Keeping the static /v3/ of the existing site.")
  }

  // The 4.x line, built from this commit: its pages, or, once they have
  // moved, a page for each that sends the reader there. The Markdown copies
  // and llms.txt stay, for the tools that fetch them, which a page that
  // redirects cannot serve.
  if (!existsSync(join(v4, "index.html"))) {
    throw new Error(`${v4} holds no built docs (no index.html)`)
  }
  if (v4Moved) {
    writeMoved(
      v4,
      join(out, "v4"),
      (path) => v4MovedTarget(v4Moved, path),
      (path) => /\.(md|txt)$/.test(path)
    )
  } else {
    copyDir(v4, join(out, "v4"))
  }

  // Candid Core's site. The 4.x pages link it, so a site without one is
  // refused; the link check (docs/scripts/check-links.mjs) is what checks
  // the pages they link.
  if (!existsSync(join(candidCore, "index.html"))) {
    throw new Error(
      `${candidCore} holds no built Candid Core site (no index.html)`
    )
  }
  if (candidCoreMoved) {
    writeMoved(candidCore, join(out, CANDID_CORE_DIR), (path) =>
      candidCoreMovedTarget(candidCoreMoved, path)
    )
  } else {
    copyDir(candidCore, join(out, CANDID_CORE_DIR))
  }

  // The site root's guides.
  cpSync(rootLlms, join(out, "llms.txt"))
  if (rootLlmsFull) {
    cpSync(rootLlmsFull, join(out, "llms-full.txt"))
  } else {
    rmSync(join(out, "llms-full.txt"), { force: true })
  }

  // The version selector of every page, and the 2.x site's legacy links.
  // Candid Core's pages are published as they were built.
  for (const file of pages(out)) {
    if (relative(out, file).split(sep)[0] === CANDID_CORE_DIR) continue
    const original = readFileSync(file, "utf8")
    let html = original
    for (const [from, to] of LINK_REWRITES) html = html.split(from).join(to)
    if (html.includes('id="version-select"')) {
      html = html.replace(
        /<select id="version-select"[\s\S]*?<\/select>/,
        SELECTOR_HTML
      )
      if (!html.includes("ic-reactor-version-selector-patch")) {
        html = html.replace("</body>", `${PATCH_SCRIPT}\n  </body>`)
      }
    }
    if (html !== original) writeFileSync(file, html)
  }

  if (cname && existsSync(cname)) cpSync(cname, join(out, "CNAME"))

  writeFileSync(
    join(out, "index.html"),
    v4Moved ? movedPage(v4Moved.href) : ROOT_INDEX
  )
  writeFileSync(join(out, "404.html"), NOT_FOUND)

  const moved = [
    v4Moved && `/v4/ to ${v4Moved.href}`,
    candidCoreMoved && `/${CANDID_CORE_DIR}/ to ${candidCoreMoved.href}`,
  ].filter(Boolean)
  log(
    `Assembled ${out}: /${LINES.join("/, /")}/, /${CANDID_CORE_DIR}/, /llms.txt from ${basename(rootLlms)}` +
      (moved.length ? `, moved: ${moved.join(", ")}` : "") +
      (rootLlmsFull
        ? `, /llms-full.txt from ${rootLlmsFull}`
        : ", no /llms-full.txt")
  )
}

function isMain() {
  try {
    return (
      realpathSync(process.argv[1]) ===
      realpathSync(fileURLToPath(import.meta.url))
    )
  } catch {
    return false
  }
}

if (isMain()) {
  const { values } = parseArgs({
    options: {
      out: { type: "string" },
      existing: { type: "string" },
      v4: { type: "string" },
      "v3-line": { type: "string" },
      "candid-core": { type: "string" },
      "root-llms": { type: "string" },
      "root-llms-full": { type: "string" },
      cname: { type: "string" },
      "v4-moved-to": { type: "string" },
      "candid-core-moved-to": { type: "string" },
    },
  })
  try {
    assembleSite({
      out: values.out,
      existing: values.existing,
      v4: values.v4,
      v3Line: values["v3-line"],
      candidCore: values["candid-core"],
      rootLlms: values["root-llms"],
      rootLlmsFull: values["root-llms-full"],
      cname: values.cname,
      v4MovedTo: values["v4-moved-to"],
      candidCoreMovedTo: values["candid-core-moved-to"],
    })
  } catch (error) {
    console.error(`::error::${error.message}`)
    process.exit(1)
  }
}
