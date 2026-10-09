#!/usr/bin/env node
/**
 * Assembles the whole Pages site that .github/workflows/docs.yml deploys.
 *
 * A Pages deploy replaces the site, so every deploy carries every line:
 *
 * - `/v4/`: the 4.x docs, built from this commit (main).
 * - `/v3/`: the 3.x docs. By default (`--v3-line`) they are rebuilt from the
 *   `v3` branch on every deploy, with that branch's `llms.txt` and
 *   `llms-full.txt` beside them. Without `--v3-line`, `/v3/` must already be
 *   in the existing site (a static snapshot committed to `gh-pages`), and is
 *   kept as it is.
 * - `/v2/`: the static 2.x TypeDoc site, moved under `/v2/` once from the
 *   legacy root of `gh-pages`.
 * - the root: `index.html` and `404.html` send readers to `/v4/`,
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
 *     --root-llms packages/core/llms.txt --root-llms-full v3-line/llms-full.txt \
 *     --cname CNAME
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
import { basename, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

/** The line a reader lands on: the root, the 404 page and the selector. */
export const CURRENT_LINE = "v4"
export const LINES = ["v4", "v3", "v2"]

/** Root entries that are not part of the legacy 2.x site. */
const ROOT_KEEP = new Set([
  "v2",
  "v3",
  "v4",
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
// versioned base goes to that base's home rather than looping on 404.html.
const NOT_FOUND = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Not Found</title>
    <script>
      (function () {
        var path = window.location.pathname || "/";
        var match = path.match(/^\\/(v2|v3|v4)(\\/|$)/);
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
 * @param {string} options.rootLlms the file served at `/llms.txt`
 * @param {string} [options.rootLlmsFull] the file served at `/llms-full.txt`; omit to serve none
 * @param {string} [options.cname] the CNAME file to keep
 * @param {(line: string) => void} [options.log]
 */
export function assembleSite({
  out,
  existing,
  v4,
  v3Line,
  rootLlms,
  rootLlmsFull,
  cname,
  log = console.log,
}) {
  if (!out || !v4 || !rootLlms) {
    throw new Error("assembleSite needs out, v4 and rootLlms")
  }
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

  // The 4.x line, built from this commit.
  if (!existsSync(join(v4, "index.html"))) {
    throw new Error(`${v4} holds no built docs (no index.html)`)
  }
  copyDir(v4, join(out, "v4"))

  // The site root's guides.
  cpSync(rootLlms, join(out, "llms.txt"))
  if (rootLlmsFull) {
    cpSync(rootLlmsFull, join(out, "llms-full.txt"))
  } else {
    rmSync(join(out, "llms-full.txt"), { force: true })
  }

  // The version selector of every page, and the 2.x site's legacy links.
  for (const file of pages(out)) {
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

  writeFileSync(join(out, "index.html"), ROOT_INDEX)
  writeFileSync(join(out, "404.html"), NOT_FOUND)

  log(
    `Assembled ${out}: /${LINES.join("/, /")}/, /llms.txt from ${basename(rootLlms)}` +
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
      "root-llms": { type: "string" },
      "root-llms-full": { type: "string" },
      cname: { type: "string" },
    },
  })
  try {
    assembleSite({
      out: values.out,
      existing: values.existing,
      v4: values.v4,
      v3Line: values["v3-line"],
      rootLlms: values["root-llms"],
      rootLlmsFull: values["root-llms-full"],
      cname: values.cname,
    })
  } catch (error) {
    console.error(`::error::${error.message}`)
    process.exit(1)
  }
}
