#!/usr/bin/env node

import {
  readdirSync,
  readFileSync,
  writeFileSync,
  statSync,
  existsSync,
} from "fs"
import { join, basename, extname } from "path"

const LIBS_DIR = "src/content/docs/libs"

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function processFile(filePath) {
  const content = readFileSync(filePath, "utf-8")
  const fileName = basename(filePath, extname(filePath))

  // Basic frontmatter extraction
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)

  if (!frontmatterMatch) {
    // No frontmatter, add it
    const newContent = `---\ntitle: ${fileName}\n---\n\n${content}`
    writeFileSync(filePath, newContent)
    console.log(`Added frontmatter to ${fileName}`)
    return
  }

  const frontmatterBody = frontmatterMatch[1]

  // Check if title exists
  if (!frontmatterBody.includes("title:")) {
    const newFrontmatterBody = `title: ${fileName}\n${frontmatterBody}`
    const newContent = content.replace(
      frontmatterMatch[0],
      `---\n${newFrontmatterBody}\n---`
    )
    writeFileSync(filePath, newContent)
    console.log(`Added title to frontmatter in ${fileName}`)
  }
}

function walkDir(dir) {
  if (!existsSync(dir)) return

  const files = readdirSync(dir)
  for (const file of files) {
    const path = join(dir, file)
    const stat = statSync(path)

    if (stat.isDirectory()) {
      walkDir(path)
    } else if (file.endsWith(".md") || file.endsWith(".mdx")) {
      processFile(path)
    }
  }
}

function main() {
  console.log(`Fixing frontmatter in ${LIBS_DIR}...`)
  walkDir(LIBS_DIR)
  console.log("Done.")
}

main()
