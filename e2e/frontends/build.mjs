// Writes what the two frontend canisters of e2e/icp.yaml upload, from the
// files the docs guide "Deploy to a frontend canister" gives
// (docs/src/content/docs/guides/deploy.mdx):
//
//   dist/asset-canister/  index.html, and the wallet example's
//                         public/.ic-assets.json5, for DFINITY's asset canister
//   dist/static-site/     index.html, and the _headers of the guide's
//                         static-site section, for the certified-assets one
//
// Each file is copied as it is, so src/frontend-headers.test.ts checks what
// the example deploys and what the guide says, not a copy kept here.
//
// Usage: node frontends/build.mjs asset-canister | static-site
// (each canister's build writes its own directory only, so the two can run
// at once).
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repository = path.resolve(here, "..", "..")

/** The wallet example's `.ic-assets.json5`. */
export const icAssetsFile = path.join(
  repository,
  "examples/vite-wallet/public/.ic-assets.json5"
)

/** The docs guide that gives both files. */
export const guideFile = path.join(
  repository,
  "docs/src/content/docs/guides/deploy.mdx"
)

/**
 * The fenced code blocks of a Markdown text, with their language.
 *
 * @param {string} markdown
 * @returns {{ lang: string, body: string }[]}
 */
export function fences(markdown) {
  return [...markdown.matchAll(/^```(\w*)\n([\s\S]*?)^```$/gm)].map(
    ([, lang, body]) => ({ lang, body })
  )
}

/**
 * The guide's `_headers`: its one `text` fence that starts with a path.
 *
 * @param {string} markdown
 * @returns {string}
 */
export function guideHeaders(markdown) {
  const found = fences(markdown).filter(
    (fence) => fence.lang === "text" && fence.body.startsWith("/*\n")
  )
  if (found.length !== 1) {
    throw new Error(
      `${guideFile}: expected one text fence that starts with "/*", found ${found.length}`
    )
  }
  return found[0].body
}

const sites = {
  "asset-canister": (dir) =>
    copyFileSync(icAssetsFile, path.join(dir, ".ic-assets.json5")),
  "static-site": (dir) =>
    writeFileSync(
      path.join(dir, "_headers"),
      guideHeaders(readFileSync(guideFile, "utf8"))
    ),
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const site = process.argv[2]
  const write = sites[site]
  if (write === undefined) {
    throw new Error(
      `Usage: node frontends/build.mjs ${Object.keys(sites).join(" | ")}`
    )
  }
  const dir = path.join(here, "dist", site)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  copyFileSync(path.join(here, "index.html"), path.join(dir, "index.html"))
  write(dir)
}
