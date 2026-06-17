import fs from "node:fs"
import path from "node:path"

const repoRoot = path.resolve("..")
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

const documentedExamples = new Set()
const errors = []

for (const file of getMdxFiles()) {
  if (file === "index.mdx") continue

  const fullPath = path.join(docsExamplesDir, file)
  const content = fs.readFileSync(fullPath, "utf8")
  const matches = [...content.matchAll(providerPattern)]

  if (matches.length === 0) {
    errors.push(`${file} has no StackBlitz or CodeSandbox example link`)
    continue
  }

  for (const match of matches) {
    const url = match[0]
    const examplePath = match[1]
    const exampleDir = examplePath.split("/")[0]
    documentedExamples.add(exampleDir)

    const sandboxRoot = path.join(examplesDir, examplePath)
    if (!fs.existsSync(sandboxRoot)) {
      errors.push(
        `${file} links to missing sandbox root: examples/${examplePath}`
      )
      continue
    }

    if (!hasPackageJson(sandboxRoot)) {
      errors.push(
        `${file} sandbox root has no package.json: examples/${examplePath}`
      )
    }

    const parsedUrl = new URL(url)
    const focusedFile = parsedUrl.searchParams.get("file")
    if (focusedFile && !fs.existsSync(path.join(sandboxRoot, focusedFile))) {
      errors.push(
        `${file} focuses missing file: examples/${examplePath}/${focusedFile}`
      )
    }
  }
}

for (const exampleDir of getExampleDirs()) {
  if (!documentedExamples.has(exampleDir)) {
    errors.push(
      `examples/${exampleDir} is not linked from an example docs page`
    )
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"))
  process.exit(1)
}

console.log(
  `Checked ${documentedExamples.size} documented examples with sandbox links.`
)
