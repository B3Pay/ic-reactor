// The command line: canisters, .did files, the network and its root key.
import { describe, expect, it } from "vitest"
import { networkFrom } from "../src/network.ts"
import { parseOptions } from "../src/options.ts"
import { UsageError } from "../src/usage.ts"

const LEDGER = "ryjl3-tyaaa-aaaaa-aaaba-cai"
const GOVERNANCE = "rrkah-fqaaa-aaaaa-aaaaq-cai"
const home = () => "/home/me"

describe("parseOptions", () => {
  it("defaults to mainnet, no identity and no canisters", () => {
    const options = parseOptions([], home)
    expect(options.network.network).toBe("ic")
    expect(options.network.read).toEqual({
      host: "https://icp-api.io",
      fetchRootKey: false,
    })
    expect(options.identityPath).toBeUndefined()
    expect(options.canisters).toEqual([])
    expect(options.didFiles.size).toBe(0)
  })

  it("names canisters, and a bare id after its first five characters", () => {
    const options = parseOptions(
      ["--canister", `ledger=${LEDGER}`, "--canister", GOVERNANCE],
      home
    )
    expect(options.canisters).toEqual([
      { name: "ledger", id: LEDGER },
      { name: "rrkah", id: GOVERNANCE },
    ])
  })

  it("refuses a bad id, the management canister, a bad name and repeats", () => {
    for (const [argv, reason] of [
      [["--canister", "ledger=not-an-id"], /--canister ledger=not-an-id/],
      [["--canister", "ic=aaaaa-aa"], /--canister ic=aaaaa-aa/],
      [["--canister", `led-ger=${LEDGER}`], /1 to 20 letters, digits or _/],
      [["--canister", `=${LEDGER}`], /1 to 20 letters/],
      [
        ["--canister", `a=${LEDGER}`, "--canister", `a=${GOVERNANCE}`],
        /the name a is taken/,
      ],
      [
        ["--canister", `a=${LEDGER}`, "--canister", `b=${LEDGER}`],
        /listed twice/,
      ],
    ] as const) {
      expect(() => parseOptions(argv, home)).toThrow(UsageError)
      expect(() => parseOptions(argv, home)).toThrow(reason)
    }
  })

  it("maps --did to canister ids, by name or id, and expands ~", () => {
    const options = parseOptions(
      [
        "--canister",
        `ledger=${LEDGER}`,
        "--did",
        "ledger=~/dids/ledger.did",
        "--did",
        `${GOVERNANCE}=./governance.did`,
      ],
      home
    )
    expect([...options.didFiles]).toEqual([
      [LEDGER, "/home/me/dids/ledger.did"],
      [GOVERNANCE, "./governance.did"],
    ])
  })

  it("refuses a --did without a target or path, or for an unknown name", () => {
    for (const flag of ["ledger", "=x.did", "ledger=", "nope=x.did"]) {
      expect(() => parseOptions(["--did", flag], home)).toThrow(UsageError)
    }
    expect(() =>
      parseOptions(
        ["--did", `${LEDGER}=a.did`, "--did", `${LEDGER}=b.did`],
        home
      )
    ).toThrow(/has a .did already/)
  })

  it("expands ~ in --identity, and refuses unknown flags and positionals", () => {
    expect(
      parseOptions(["--identity", "~/.config/key.pem"], home).identityPath
    ).toBe("/home/me/.config/key.pem")
    expect(() => parseOptions(["--pem", "key.pem"], home)).toThrow(UsageError)
    expect(() => parseOptions([LEDGER], home)).toThrow(UsageError)
  })
})

describe("networkFrom", () => {
  it("fetches the root key only from this machine", () => {
    expect(networkFrom("local", undefined)).toMatchObject({
      network: "local",
      read: { host: "http://127.0.0.1:8000", fetchRootKey: true },
      recheckMs: 0,
    })
    expect(networkFrom(undefined, undefined).recheckMs).toBeUndefined()
    for (const url of [
      "http://localhost:4943",
      "http://127.0.0.1:4943",
      "http://app.localhost:8080",
      "http://[::1]:8000",
    ]) {
      const choice = networkFrom(url, undefined)
      expect(choice.read.fetchRootKey).toBe(true)
      expect(choice.read.rootKey).toBeUndefined()
      expect(choice.recheckMs).toBe(0)
    }
    expect(() => networkFrom("https://replica.example.com", undefined)).toThrow(
      /never fetched from it/
    )
  })

  it("takes a remote replica's root key as hex, and only for a URL", () => {
    const choice = networkFrom("https://replica.example.com/x", "0a0B")
    expect(choice.network).toEqual({
      host: "https://replica.example.com",
      rootKey: Uint8Array.from([0x0a, 0x0b]),
    })
    expect(choice.read).toEqual({
      host: "https://replica.example.com",
      rootKey: Uint8Array.from([0x0a, 0x0b]),
      fetchRootKey: false,
    })
    expect(() => networkFrom("ic", "0a")).toThrow(/goes with a --network <url>/)
    expect(() => networkFrom("https://r.example.com", "0g")).toThrow(/not hex/)
    expect(() => networkFrom("https://r.example.com", "")).toThrow(/not hex/)
  })

  it("refuses what is not ic, local or an http(s) URL", () => {
    expect(() => networkFrom("mainnet", undefined)).toThrow(UsageError)
    expect(() => networkFrom("ftp://127.0.0.1", undefined)).toThrow(
      /http or https/
    )
  })
})
