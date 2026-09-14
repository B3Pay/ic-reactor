/**
 * Checks the example docs pages against the examples/ tree they document.
 *
 * Every page in docs/src/content/docs/examples/ other than index.mdx must
 * embed a StackBlitz or CodeSandbox link, and every such link must resolve
 * inside this repo. Its sandbox root has to exist and hold a package.json,
 * because StackBlitz has nothing to install or boot without one. The file
 * named by its `file=` parameter has to exist under that root. Every directory
 * in examples/ with a package.json at its root or one level down must be
 * linked from at least one of those pages.
 *
 * index.mdx is exempt from the sandbox rules. It is a card grid with no
 * sandbox link of its own, and a sandbox link added there must not count as
 * documenting an example that has no page. It must instead carry exactly one
 * LinkCard per example page. Nothing checked the index before, and the
 * ckbtc-wallet and icp-reactor cards fell off it while both pages stayed
 * published.
 *
 * This reads the MDX sources and needs no build. check-links.mjs cannot catch
 * any of this. It skips external links, and fetching a StackBlitz URL would not
 * help, since a `file=` parameter and a sandbox root's package.json only mean
 * something against this repo's own tree. A missing card or an undocumented
 * example is not a broken link at all.
 */
import fs from "node:fs"
import path from "node:path"

// Resolved from this file, not the working directory. `path.resolve("..")` only
// found the repo when run from docs/. From the repo root it scanned a directory
// outside the checkout and died with ENOENT.
const repoRoot = path.resolve(import.meta.dirname, "../..")
const docsExamplesDir = path.join(repoRoot, "docs/src/content/docs/examples")
const examplesDir = path.join(repoRoot, "examples")
const providerPattern =
  /https:\/\/(?:stackblitz\.com\/github|codesandbox\.io\/p\/github)\/b3pay\/ic-reactor\/(?:tree\/)?main(?:\/examples)?\/([^?"\s)]+)[^"\s)]*/g

function hasPackageJson(dir) {
  return fs.existsSync(path.join(dir, "package.json"))
}

function findPackageRoot(exampleDir) {
  const root = path.join(examplesDir, exampleDir)
  if (hasPackageJson(root)) return root

  for (const child of fs.readdirSync(root, { withFileTypes: true })) {
    if (child.isDirectory() && hasPackageJson(path.join(root, child.name))) {
      return path.join(root, child.name)
    }
  }

  return null
}

function getExampleDirs() {
  return fs
    .readdirSync(examplesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => findPackageRoot(name))
    .sort()
}

function getMdxFiles() {
  return fs
    .readdirSync(docsExamplesDir)
    .filter((name) => name.endsWith(".mdx"))
    .sort()
}

const pages = getMdxFiles().filter((file) => file !== "index.mdx")
const documentedExamples = new Set()
// A Set, because each page points at the same sandbox twice, once in the
// "Open in StackBlitz" LinkCard href and again in the iframe src. With an
// array, one broken link produced two identical findings.
const errors = new Set()

for (const file of pages) {
  const fullPath = path.join(docsExamplesDir, file)
  const content = fs.readFileSync(fullPath, "utf8")
  const matches = [...content.matchAll(providerPattern)]

  if (matches.length === 0) {
    errors.add(`${file} has no StackBlitz or CodeSandbox example link`)
    continue
  }

  for (const match of matches) {
    const url = match[0]
    const examplePath = match[1]
    const exampleDir = examplePath.split("/")[0]
    documentedExamples.add(exampleDir)

    const sandboxRoot = path.join(examplesDir, examplePath)
    if (!fs.existsSync(sandboxRoot)) {
      errors.add(
        `${file} links to missing sandbox root: examples/${examplePath}`
      )
      continue
    }

    if (!hasPackageJson(sandboxRoot)) {
      errors.add(
        `${file} sandbox root has no package.json: examples/${examplePath}`
      )
    }

    const parsedUrl = new URL(url)
    const focusedFile = parsedUrl.searchParams.get("file")
    if (focusedFile && !fs.existsSync(path.join(sandboxRoot, focusedFile))) {
      errors.add(
        `${file} focuses missing file: examples/${examplePath}/${focusedFile}`
      )
    }
  }
}

for (const exampleDir of getExampleDirs()) {
  if (!documentedExamples.has(exampleDir)) {
    errors.add(`examples/${exampleDir} is not linked from an example docs page`)
  }
}

// Cards are matched to pages by the last segment of an `/examples/<slug>` href,
// so the check does not depend on the site's base path. A card whose href is
// not shaped like that is skipped, and its page then reports a missing card.
const cardCounts = new Map(pages.map((page) => [page, 0]))
const index = fs.readFileSync(path.join(docsExamplesDir, "index.mdx"), "utf8")
for (const [, attributes] of index.matchAll(/<LinkCard\b([\s\S]*?)\/>/g)) {
  const href = attributes.match(/\bhref="([^"]*)"/)?.[1]
  const slug = href?.match(/\/examples\/([^/?#]+)\/?$/)?.[1]
  if (!slug) continue

  const page = `${slug}.mdx`
  if (cardCounts.has(page)) {
    cardCounts.set(page, cardCounts.get(page) + 1)
  } else {
    errors.add(`index.mdx has a LinkCard for a missing page: ${href}`)
  }
}

for (const [page, count] of cardCounts) {
  if (count === 0) errors.add(`index.mdx has no LinkCard for ${page}`)
  if (count > 1) errors.add(`index.mdx has ${count} LinkCards for ${page}`)
}

if (errors.size > 0) {
  console.error([...errors].map((error) => `- ${error}`).join("\n"))
  process.exit(1)
}

console.log(
  `Checked ${documentedExamples.size} documented examples with sandbox links and ${pages.length} index cards.`
)
