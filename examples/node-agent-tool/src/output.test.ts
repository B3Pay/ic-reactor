// Scenario 6: --json on every command, in one stable shape.
import { principal } from "@meantjs/schema"
import { describe, expect, it } from "vitest"
import { createOutput, printable, stringify } from "./output.ts"
import { createCli, generatePem } from "./test-kit.ts"

const key = generatePem("ed25519")
const OWNER = principal("ryjl3-tyaaa-aaaaa-aaaba-cai")

const setup = () =>
  createCli({
    files: { "me.pem": key.pem },
    ledger: { balances: [[key.principal, 2n ** 70n]] },
  })

describe("JSON output", () => {
  it("writes a bigint as decimal text, digits intact, and bytes as hex", () => {
    expect(
      stringify({ big: 2n ** 70n, bytes: Uint8Array.from([0, 255]), n: 1 })
    ).toBe('{"big":"1180591620717411303424","bytes":"00ff","n":1}')
  })

  it.each([
    [["whoami"]],
    [["info"]],
    [["info", "--certified"]],
    [["balance", OWNER]],
    [["transfer", OWNER, "1"]],
  ])(
    "%j: one document, ok and command first-class, nothing on stderr",
    async (argv) => {
      const { cli } = setup()
      const result = await cli([...argv, "--json", "--pem", "me.pem"])
      expect(result.exitCode).toBe(0)
      expect(result.stderr).toEqual([])
      expect(result.stdout).toHaveLength(1)
      expect(result.docs).toHaveLength(1)
      expect(result.docs[0]).toMatchObject({ ok: true, command: argv[0] })
    }
  )

  it("keeps a balance past 2^53 exact", async () => {
    const { cli } = setup()
    const result = await cli(["balance", key.principal, "--json"])
    expect(result.docs[0]).toMatchObject({
      balance: {
        units: "1180591620717411303424",
        tokens: "11805916207174.11303424",
      },
    })
  })

  it("gives every failure ok: false, kind, mayHaveExecuted and message, on stdout", async () => {
    const { cli } = setup()
    for (const [argv, kind] of [
      [["transfer", OWNER, "1"], "unauthenticated"],
      [["balance", "nobody"], "usage"],
      [["--bogus"], "usage"],
      [["balance"], "usage"],
      [["info", "--resend-unknown"], "usage"],
    ] as const) {
      const result = await cli([...argv, "--json"])
      expect(result.stderr).toEqual([])
      expect(result.docs).toEqual([
        expect.objectContaining({
          ok: false,
          kind,
          mayHaveExecuted: false,
          message: expect.any(String),
        }),
      ])
      expect(Object.keys(result.docs[0] ?? {})).toEqual(
        expect.arrayContaining([
          "ok",
          "command",
          "kind",
          "mayHaveExecuted",
          "message",
        ])
      )
    }
  })

  it("names the command of a refused command line, or none if it is not known", async () => {
    const { cli } = setup()
    const unknown = await cli(["--bogus", "--json"])
    expect(unknown.exitCode).toBe(2)
    expect(unknown.docs[0]).toMatchObject({ command: null, kind: "usage" })
    const short = await cli(["transfer", "1", "--json"])
    expect(short.docs[0]).toMatchObject({ command: "transfer", kind: "usage" })
  })

  it("without --json, prints lines for a person, failures on stderr", async () => {
    const { cli } = setup()
    const ok = await cli(["whoami"])
    expect(ok.stdout[0]).toMatch(/^principal\s+2vxsx-fae$/)
    const failed = await cli(["balance", "nobody"])
    expect(failed.stdout).toEqual([])
    expect(failed.stderr[0]).toMatch(
      /^error: usage: owner "nobody" is not a principal/
    )
  })
})

describe("text a ledger sends", () => {
  // Any character a terminal acts on instead of showing.
  const RAW = /[\u0000-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]/
  const hostile = {
    // Moves the cursor up a line, erases it and writes a balance in its place.
    symbol: "ICP\u001b[1A\u001b[2Kbalance  1000000 ICP",
    // A line break that adds a line of its own, then a right-to-left override.
    name: "Token\nprincipal  aaaaa-aa‮",
  }

  it("is printed with each control character spelled out, so it can't move the cursor or add a line", async () => {
    const { cli } = createCli({ ledger: hostile })
    const result = await cli(["info"])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContainEqual(
      expect.stringMatching(
        /^symbol\s+ICP\\u\{1b\}\[1A\\u\{1b\}\[2Kbalance {2}1000000 ICP$/
      )
    )
    expect(result.stdout).toContainEqual(
      expect.stringMatching(
        /^name\s+Token\\u\{a\}principal {2}aaaaa-aa\\u\{202e\}$/
      )
    )
    expect(
      result.stdout.filter((line) => line.startsWith("principal"))
    ).toEqual([])
    for (const line of result.stdout) expect(line).not.toMatch(RAW)
  })

  it("is spelled out in a failure on stderr, and in a note", () => {
    const stdout: string[] = []
    const stderr: string[] = []
    const out = createOutput(
      {
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line),
      },
      false
    )
    // OSC 52 asks the terminal to put text on the clipboard; BEL ends it.
    out.failure(
      {
        ok: false,
        command: "transfer",
        kind: "rejected",
        mayHaveExecuted: false,
        message: "",
      },
      ["error: rejected: \u001b]52;c;aGVsbG8=\u0007"]
    )
    out.note("\u009b2J")
    expect(stderr).toEqual(["error: rejected: \\u{1b}]52;c;aGVsbG8=\\u{7}"])
    expect(stdout).toEqual(["\\u{9b}2J"])
  })

  it("keeps printable text as it is, whatever its script", () => {
    expect(printable("Ꭵ₿ Bitcoin · ckBTC — 1.5 ₿, ü, 東京")).toBe(
      "Ꭵ₿ Bitcoin · ckBTC — 1.5 ₿, ü, 東京"
    )
  })

  it("with --json, leaves no raw control character in the line and parses back exact", async () => {
    const symbol = `${hostile.symbol}\u009b31m⁦`
    const { cli } = createCli({ ledger: { ...hostile, symbol } })
    const result = await cli(["info", "--json"])
    expect(result.stdout).toHaveLength(1)
    expect(result.stdout[0]).not.toMatch(RAW)
    expect(result.stdout[0]).toContain("\\u009b31m\\u2066")
    expect(result.docs[0]).toMatchObject({ symbol, name: hostile.name })
  })
})

describe("--help", () => {
  it("prints the usage and exits 0; no command exits 2", async () => {
    const { cli } = setup()
    const help = await cli(["--help"])
    expect(help.exitCode).toBe(0)
    expect(help.stdout.join("\n")).toMatch(/Usage: node src\/cli\.ts <command>/)
    const none = await cli([])
    expect(none.exitCode).toBe(2)
    expect(none.stderr[0]).toBe("error: usage: no command given")
  })

  it("with --json, is one JSON document that carries the usage", async () => {
    const { cli } = setup()
    for (const argv of [
      ["--help", "--json"],
      ["transfer", "-h", "--json"],
    ]) {
      const help = await cli(argv)
      expect(help.exitCode).toBe(0)
      expect(help.stderr).toEqual([])
      expect(help.stdout).toHaveLength(1)
      expect(help.docs).toEqual([
        {
          ok: true,
          command: "help",
          usage: expect.stringMatching(/^node-agent-tool: .*Exit codes: /s),
        },
      ])
    }
  })
})
