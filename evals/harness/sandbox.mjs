// The OS-level sandbox an agent run executes in: a macOS sandbox-exec (SBPL)
// profile. Docker was the first choice but no Docker daemon is available on
// the machine this was built on; see README "Leak audit".
//
// The profile starts from `allow default` and then
//   - denies reading file contents (file-read-data / file-read-xattr) and all
//     writes under every place user data lives: /Users (every home, the
//     repository, other projects), /private/var/folders (per-user temp dirs:
//     other runs of the batch, the scorer's directory), /private/tmp and
//     /Volumes;
//   - allows reading the toolchain back (the node installation, the agent
//     CLI, anything passed as `readOnly`);
//   - allows reading and writing the run's own directory;
//   - denies writes everywhere else except /dev.
// Among rules for the same operation SBPL applies the last match, so the
// allows (which name the same operations as the denies) override them.
// Metadata (stat) stays readable everywhere so path resolution works: a
// denied file's existence can be observed, its contents cannot.
import { existsSync, realpathSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { spawnSync } from "node:child_process"

export const SANDBOX_EXEC = "/usr/bin/sandbox-exec"

export function sandboxAvailable() {
  return process.platform === "darwin" && existsSync(SANDBOX_EXEC)
}

/** The node installation this process runs on, e.g. ~/.nvm/versions/node/v24.2.0. */
export function nodeInstallDir() {
  return dirname(dirname(realpathSync(process.execPath)))
}

/** The agent CLI's install directory, if `name` is on PATH. */
export function cliInstallDir(name = "claude") {
  const found = spawnSync("sh", ["-c", `command -v ${name}`], {
    encoding: "utf8",
  })
  const bin = found.stdout.trim()
  if (found.status !== 0 || !bin) return undefined
  return dirname(realpathSync(bin))
}

const quote = (path) => JSON.stringify(path)

export function sandboxProfile({ runRoot, readOnly = [] }) {
  const root = realpathSync(runRoot)
  const reads = [
    ...new Set(readOnly.filter(Boolean).map((p) => realpathSync(p))),
  ]
  return [
    "(version 1)",
    "(allow default)",
    ";; user data: contents unreadable, nothing writable",
    ...["/Users", "/private/var/folders", "/private/tmp", "/Volumes"].map(
      (p) =>
        `(deny file-read-data file-read-xattr file-write* (subpath ${quote(p)}))`
    ),
    ";; no writes anywhere else either",
    '(deny file-write* (subpath "/"))',
    '(allow file-write* (subpath "/dev"))',
    ";; the toolchain, read-only",
    ...reads.map(
      (p) => `(allow file-read-data file-read-xattr (subpath ${quote(p)}))`
    ),
    ";; the run itself. The allow names the same operations as the deny: SBPL",
    ";; prefers a rule for a specific operation over a wildcard (file-read*).",
    `(allow file-read-data file-read-xattr file-write* (subpath ${quote(root)}))`,
    "",
  ].join("\n")
}

/** Writes the profile next to the run and returns the command prefix. */
export function sandboxPrefix({ runRoot, readOnly }) {
  const profile = join(runRoot, "sandbox.sb")
  writeFileSync(profile, sandboxProfile({ runRoot, readOnly }))
  return [SANDBOX_EXEC, "-f", profile]
}
