/**
 * What `verify-peer-floors.js` and `verify-typescript-floor.js` share to set
 * up a scratch project and run tools in it.
 */
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"

/** The JSON file at `path`, parsed. */
export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

/** `value` as JSON indented by two spaces, ending with a newline. */
export function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n")
}

/**
 * Runs `command` in `cwd` with the output shown, and says whether it exited 0.
 * `HUSKY=0` keeps an install in a scratch project from setting up git hooks.
 */
export function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, HUSKY: "0" },
  })
  return result.status === 0
}
