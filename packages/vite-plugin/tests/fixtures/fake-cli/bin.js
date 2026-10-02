#!/usr/bin/env node
// A stand-in for candid-core-cli. `gen <did>... -o <dir> --json` reads each
// entry and, by what it says:
//   TRAP  writes a trap message to stderr and exits 101 (a crash in the generator)
//   HANG  never exits, after appending its pid to hang.pids beside this file
//   SLOW  reports as below, after 300 ms
//   NOISY reports as below, after writing a warning to stderr
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
    process.stderr.write("warning: this is on stderr (fake)\n")
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
  if (sources.some((source) => source.includes("SLOW"))) {
    setTimeout(report, 300)
  } else {
    report()
  }
}
