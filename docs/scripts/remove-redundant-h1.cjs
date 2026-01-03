const fs = require("fs")
const path = require("path")

const docsDir = path.join(__dirname, "../src/content/docs")

function getFiles(dir) {
  let results = []
  const list = fs.readdirSync(dir)
  list.forEach((file) => {
    const fullPath = path.join(dir, file)
    const stat = fs.statSync(fullPath)
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(fullPath))
    } else if (fullPath.endsWith(".mdx") || fullPath.endsWith(".md")) {
      results.push(fullPath)
    }
  })
  return results
}

const files = getFiles(docsDir)

files.forEach((file) => {
  let content = fs.readFileSync(file, "utf8")
  const lines = content.split("\n")
  let hasFrontmatterTitle = content.match(/^title:\s*/m)

  if (hasFrontmatterTitle) {
    // Find the FIRST H1 in the file that is NOT inside a code block
    let insideCodeBlock = false
    for (let i = 0; i < lines.length; i++) {
      const trimmedLine = lines[i].trim()
      if (trimmedLine.startsWith("```")) {
        insideCodeBlock = !insideCodeBlock
      }
      if (!insideCodeBlock && trimmedLine.startsWith("# ")) {
        console.log(`Removing redundant H1 from ${file}: ${lines[i]}`)
        lines.splice(i, 1)
        // Remove trailing empty line if it exists
        if (lines[i] && lines[i].trim() === "") {
          lines.splice(i, 1)
        }
        break
      }
    }
    fs.writeFileSync(file, lines.join("\n"))
  }
})
