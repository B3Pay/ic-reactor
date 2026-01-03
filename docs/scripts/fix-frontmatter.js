import { readdirSync, readFileSync, writeFileSync, statSync } from "fs"
import { join, extname } from "path"

const DOCS_DIR = "src/content/docs"

function processFile(filePath) {
  if (extname(filePath) !== ".md" && extname(filePath) !== ".mdx") return

  const content = readFileSync(filePath, "utf-8")
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)

  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1]
    if (frontmatter.includes("title:")) return // Already has title

    // Try to find H1
    const h1Match = content.match(/^# (.*)/m)
    if (h1Match) {
      const title = h1Match[1].trim()
      const newFrontmatter = `title: ${title}\n${frontmatter}`
      const newContent = content.replace(
        frontmatterMatch[0],
        `---\n${newFrontmatter}\n---`
      )
      writeFileSync(filePath, newContent)
      console.log(`Added title to ${filePath}: ${title}`)
    } else {
      // Use filename as fallback
      const filename = filePath
        .split("/")
        .pop()
        .replace(/\.(md|mdx)$/, "")
      const title = filename.charAt(0).toUpperCase() + filename.slice(1)
      const newFrontmatter = `title: ${title}\n${frontmatter}`
      const newContent = content.replace(
        frontmatterMatch[0],
        `---\n${newFrontmatter}\n---`
      )
      writeFileSync(filePath, newContent)
      console.log(`Added title (fallback) to ${filePath}: ${title}`)
    }
  } else {
    // No frontmatter at all
    const h1Match = content.match(/^# (.*)/m)
    const title = h1Match
      ? h1Match[1].trim()
      : filePath
          .split("/")
          .pop()
          .replace(/\.(md|mdx)$/, "")
    const newContent = `---\ntitle: ${title}\n---\n\n${content}`
    writeFileSync(filePath, newContent)
    console.log(`Created frontmatter for ${filePath}: ${title}`)
  }
}

function walk(dir) {
  const files = readdirSync(dir)
  for (const file of files) {
    const filePath = join(dir, file)
    if (statSync(filePath).isDirectory()) {
      if (file !== "node_modules" && file !== ".astro") {
        walk(filePath)
      }
    } else {
      processFile(filePath)
    }
  }
}

walk(DOCS_DIR)
