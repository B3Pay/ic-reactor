#!/usr/bin/env node
// A stand-in for candid-core-cli. `gen <did>... -o <dir> --json` reads each
// entry and, by what it says:
//   TRAP  writes a trap message to stderr and exits 101 (a crash in the generator)
//   HANG  never exits, after appending its pid to hang.pids beside this file
//   SLOW  reports as below, after 300 ms
//   NOISY reports as below, after writing two warnings to stderr, the second
//         with no newline at its end
//   FLOOD reports as below, after writing 250 lines to stderr
//   NOLINE reports as below, after writing 6 MiB to stderr with no newline
//   PROGRESS writes a line to stderr in two pieces, and reports as below after
//         600 ms
//   NEWER reports as below, with a schemaVersion no plugin knows
//   other reports each entry as written, in the --json shape of the real CLI
// Every run appends its arguments to runs.log beside this file.
const fs = require("node:fs")
const path = require("node:path")

const args = process.argv.slice(2)
fs.appendFileSync(path.join(__dirname, "runs.log"), JSON.stringify(args) + "\n")

const outDir = args[args.indexOf("-o") + 1]
const entries = args.slice(1, args.indexOf("-o"))
const sources = entries.map((entry) => fs.readFileSync(entry, "utf-8"))

if (sources.some((source) => source.includes("TRAP"))) {
  process.stderr.write("RuntimeError: unreachable executed (fake trap)\n")
  process.exit(101)
} else if (sources.some((source) => source.includes("HANG"))) {
  fs.appendFileSync(path.join(__dirname, "hang.pids"), process.pid + "\n")
  setInterval(() => {}, 1000)
} else {
  const stem = (entry) => path.basename(entry, path.extname(entry))
  const newer = sources.some((source) => source.includes("NEWER"))
  if (sources.some((source) => source.includes("NOISY"))) {
    process.stderr.write("warning: first (fake)\nwarning: second (fake)")
  }
  if (sources.some((source) => source.includes("FLOOD"))) {
    for (let line = 1; line <= 250; line++) {
      process.stderr.write(`line ${line} (fake)\n`)
    }
  }
  if (sources.some((source) => source.includes("NOLINE"))) {
    const piece = "x".repeat(64 * 1024)
    for (let written = 0; written < 6 * 1024 * 1024; written += piece.length) {
      process.stderr.write(piece)
    }
  }
  const progress = sources.some((source) => source.includes("PROGRESS"))
  if (progress) {
    process.stderr.write("progress: ste")
    setTimeout(() => process.stderr.write("p 1 (fake)\n"), 150)
  }
  const report = () =>
    process.stdout.write(
      JSON.stringify({
        schemaVersion: newer ? 2 : 1,
        ok: true,
        check: false,
        entries: entries.map((entry) => ({
          entry,
          status: "written",
          module: path.join(outDir, stem(entry) + ".ts"),
          envelope: path.join(outDir, stem(entry) + ".envelope.json"),
          omitted: [],
          diagnostics: [],
        })),
        drift: [],
      })
    )
  if (progress) {
    setTimeout(report, 600)
  } else if (sources.some((source) => source.includes("SLOW"))) {
    setTimeout(report, 300)
  } else {
    report()
  }
}
