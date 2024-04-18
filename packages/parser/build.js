/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-var-requires */
const { execSync } = require("child_process")
const fs = require("fs")
const path = require("path")

// Run TypeScript compiler
execSync("npx tsc")

// Run wasm-pack build
execSync(
  "wasm-pack build --no-pack --target web --out-dir src/pkg --out-name index",
  { stdio: "inherit" }
)

const srcDir = "./src/pkg"
const destDir = "./dist/pkg"

// Ensure destination directory exists
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true })
}

// Copy the wasm file to the destination directory
fs.copyFileSync(
  path.join(srcDir, "index_bg.wasm"),
  path.join(destDir, "index_bg.wasm")
)

console.log("Wasm file copied successfully.")

console.log("Build completed successfully.")
