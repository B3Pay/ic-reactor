/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-var-requires */
const { execSync } = require("child_process")
const fs = require("fs")
const path = require("path")

// get the arguments
const args = process.argv.slice(2)
const isRelease = args.includes("--release")
const target = args[0] ?? "bundler"

console.log(`Building for target: ${target}...`)
// Run wasm-pack build
execSync(
  `wasm-pack build --${
    isRelease ? "release" : "dev"
  } --target ${target} --out-dir src/pkg --out-name index`,
  { stdio: "inherit" }
)

execSync("npx tsc", { stdio: "inherit" })

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
