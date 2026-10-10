/**
 * Phase 2 of fetching: `methods`, which writes a fetched `didFile` as the
 * projection of the live interface to the methods the app calls, and the
 * live check (`verify: "live"`, `IC_REACTOR_VERIFY`), which checks a
 * `didFile` on disk against the live canister. Both run the real
 * `@candid-core/cli` (`project`, `check`) under a real `vite build`.
 *
 * The canisters live on the fake replica of tests/fake-ic.ts, on a local
 * port, which signs its certificates with a root key of its own.
 */
import fs from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Plugin } from "vite"
import { icReactor, type IcReactorPluginOptions } from "../src/index.js"
import { startFakeIc, type Canister } from "./fake-ic.js"
import {
  createApp,
  LEDGER_DID,
  PING_DID,
  recordingLogger,
  runBuild,
  startDev,
  type App,
} from "./support.js"

const LEDGER = fs.readFileSync(LEDGER_DID, "utf-8")
const LEDGER_ID = "ryjl3-tyaaa-aaaaa-aaaba-cai"
const OTHER_ID = "mqygn-kiaaa-aaaar-qaadq-cai"

const closers: Array<() => Promise<unknown>> = []
const apps: App[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  for (const close of closers.splice(0).reverse()) await close()
  for (const app of apps.splice(0)) app.cleanup()
})

function newApp(files: Record<string, string>) {
  const app = createApp(files, "real")
  apps.push(app)
  return app
}

async function fakeIc(canisters: Parameters<typeof startFakeIc>[0]) {
  const ic = await startFakeIc(canisters)
  closers.push(ic.close)
  return ic
}

/** A `fetch` that refuses every request and remembers what it was asked. */
function refuseNetwork(): string[] {
  const asked: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn((input: unknown) => {
      asked.push(String(input instanceof Request ? input.url : input))
      return Promise.reject(
        new TypeError("fetch failed: the test refuses the network")
      )
    })
  )
  return asked
}

const read = (app: App, file: string) =>
  fs.readFileSync(path.join(app.root, file), "utf-8")
const exists = (app: App, file: string) =>
  fs.existsSync(path.join(app.root, file))

/** What a build threw, as text, and what it logged. */
async function buildError(app: App, options: IcReactorPluginOptions) {
  const { result, lines } = runBuild(app.root, options)
  const message = await result.then(
    () => "",
    (error: unknown) => (error instanceof Error ? error.message : String(error))
  )
  return { message, lines }
}

/** The line of a failure message that names `name`. */
const lineOf = (message: string, name: string) =>
  message.split("\n").find((line) => line.includes(`- ${name} (`)) ?? ""

// `as const`: the option takes a readonly list.
const METHODS = ["icrc1_transfer", "icrc1_balance_of"] as const

describe("methods", () => {
  it("writes a missing didFile as the projection of the live interface to them, and a second build makes no request", async () => {
    const ic = await fakeIc({ [LEDGER_ID]: { candid: LEDGER } })
    const app = newApp({})
    const options: IcReactorPluginOptions = {
      canisters: {
        ledger: {
          didFile: "did/ledger.did",
          canisterId: LEDGER_ID,
          network: { host: ic.host },
          methods: METHODS,
        },
      },
    }

    const first = runBuild(app.root, options)
    await first.result
    const did = read(app, "did/ledger.did")
    expect(did).toContain("icrc1_balance_of : (Account) -> (Tokens) query;")
    expect(did).toContain("icrc1_transfer : (TransferArg) -> (TransferResult);")
    // Nothing the two methods do not reach: no other method, and not the
    // init arguments of the ledger's service class.
    expect(did).not.toContain("icrc1_name")
    expect(did).not.toContain("InitArgs")
    expect(did).not.toContain("ledger_arg")
    expect(first.lines).toContainEqual(
      expect.stringContaining(
        `wrote did/ledger.did from the certified candid:service of ${LEDGER_ID} on ${ic.host}, projected to icrc1_balance_of, icrc1_transfer (`
      )
    )
    const module = read(app, "src/canisters/ledger.ts")
    expect(module).toContain("icrc1_transfer")
    expect(module).not.toContain("icrc1_name")
    expect(ic.requests).toEqual([
      "GET /api/v2/status",
      `POST /api/v3/canister/${LEDGER_ID}/read_state`,
    ])

    // The projection on disk matches its methods: read, compared and
    // generated with no request.
    const second = runBuild(app.root, options)
    await second.result
    expect(ic.requests).toHaveLength(2)
    expect(read(app, "did/ledger.did")).toBe(did)
    expect(second.lines.filter((line) => line.startsWith("warn:"))).toEqual([])
  })

  it("with a name the live interface lacks fails, naming it and the canister's methods, and writes nothing", async () => {
    const ic = await fakeIc({ [LEDGER_ID]: { candid: LEDGER } })
    const app = newApp({ "did/ping.did": PING_DID })
    const { message } = await buildError(app, {
      canisters: {
        ping: { didFile: "did/ping.did" },
        ledger: {
          didFile: "did/ledger.did",
          canisterId: LEDGER_ID,
          network: { host: ic.host },
          methods: ["icrc1_transfer", "icrc1_transfr"],
        },
      },
    })
    expect(message).toContain("could not generate 1 of 2 canisters")
    const line = lineOf(message, "ledger")
    expect(line).toContain(
      `ledger (did/ledger.did): methods names icrc1_transfr, which the live interface of ${LEDGER_ID} on ${ic.host} does not have, so did/ledger.did is not written.`
    )
    expect(line).toContain(
      "It has 10 methods: icrc1_balance_of, icrc1_decimals, icrc1_fee,"
    )
    expect(exists(app, "did/ledger.did")).toBe(false)
    expect(exists(app, "src/canisters/ledger.ts")).toBe(false)
    expect(exists(app, "src/canisters/ping.ts")).toBe(true)
  })

  it("of canisters that share a missing didFile must be one list, or nothing is fetched", async () => {
    const ic = await fakeIc({ [LEDGER_ID]: { candid: LEDGER } })
    const app = newApp({})
    const network = { host: ic.host }
    const { message } = await buildError(app, {
      canisters: {
        a: {
          didFile: "did/ledger.did",
          canisterId: LEDGER_ID,
          network,
          methods: ["icrc1_transfer", "icrc1_fee"],
        },
        // The same list in another order is the same projection.
        b: {
          didFile: "did/ledger.did",
          canisterId: LEDGER_ID,
          network,
          methods: ["icrc1_fee", "icrc1_transfer"],
          outDir: "src/b",
        },
        c: {
          didFile: "did/ledger.did",
          canisterId: LEDGER_ID,
          network,
          methods: ["icrc1_fee"],
          outDir: "src/c",
        },
      },
    })
    expect(message).toContain(
      `"a", "b", "c" name did/ledger.did but not one list of methods to project it to (` +
        `a: icrc1_fee, icrc1_transfer; b: icrc1_fee, icrc1_transfer; c: icrc1_fee): ` +
        `the file holds one projection, which every one of them generates from, so it is not fetched.`
    )
    expect(ic.requests).toEqual([])
    expect(exists(app, "did/ledger.did")).toBe(false)

    // Without c, a and b share one fetch.
    const { result } = runBuild(app.root, {
      canisters: {
        a: {
          didFile: "did/ledger.did",
          canisterId: LEDGER_ID,
          network,
          methods: ["icrc1_transfer", "icrc1_fee"],
        },
        b: {
          didFile: "did/ledger.did",
          canisterId: LEDGER_ID,
          network,
          methods: ["icrc1_fee", "icrc1_transfer"],
          outDir: "src/b",
        },
      },
    })
    await result
    expect(ic.requests).toHaveLength(2)
    expect(read(app, "did/ledger.did")).not.toContain("icrc1_name")
  })

  it("of a canister with no canisterId count when it shares a missing didFile: no methods is the whole interface, and nothing is fetched", async () => {
    const ic = await fakeIc({ [LEDGER_ID]: { candid: LEDGER } })
    const app = newApp({})
    const options: IcReactorPluginOptions = {
      canisters: {
        // Only this entry can fetch the file, for one method.
        transfer: {
          didFile: "did/ledger.did",
          canisterId: LEDGER_ID,
          network: { host: ic.host },
          methods: ["icrc1_transfer"],
        },
        // It reads the same file, and wants the whole interface.
        ledger: { didFile: "did/ledger.did", outDir: "src/whole" },
      },
    }
    const { message } = await buildError(app, options)
    const refusal =
      `"transfer", "ledger" name did/ledger.did but not one list of methods to project it to (` +
      `transfer: icrc1_transfer; ledger: no methods, the whole interface): ` +
      `the file holds one projection, which every one of them generates from, so it is not fetched. ` +
      `Give them one list, or give each list a didFile of its own.`
    // One message for both, on one line.
    expect(message).toContain(
      `- transfer (did/ledger.did), ledger (did/ledger.did): ${refusal}`
    )
    expect(ic.requests).toEqual([])
    expect(exists(app, "did/ledger.did")).toBe(false)
    expect(exists(app, "src/canisters/transfer.ts")).toBe(false)
    expect(exists(app, "src/whole/ledger.ts")).toBe(false)

    // A file on disk is read by both, with no request, and still compared
    // with each list: the whole interface holds more than icrc1_transfer.
    fs.mkdirSync(path.join(app.root, "did"), { recursive: true })
    fs.writeFileSync(path.join(app.root, "did/ledger.did"), LEDGER)
    const onDisk = runBuild(app.root, options)
    await onDisk.result
    expect(ic.requests).toEqual([])
    expect(onDisk.lines).toContainEqual(
      expect.stringContaining(
        "ic-reactor: transfer: did/ledger.did also holds icrc1_balance_of,"
      )
    )
    expect(read(app, "src/whole/ledger.ts")).toContain("icrc1_name")

    // Named by IC_REACTOR_FETCH while on disk, the file is to be fetched
    // again: the lists are compared before the request, as for a missing one.
    vi.stubEnv("IC_REACTOR_FETCH", "transfer")
    const again = await buildError(app, options)
    expect(again.message).toContain(
      `- transfer (did/ledger.did), ledger (did/ledger.did): ${refusal}`
    )
    expect(ic.requests).toEqual([])
    expect(read(app, "did/ledger.did")).toBe(LEDGER)
  })

  it("of a canister with no canisterId that names another list for a shared missing didFile refuse the fetch, naming each list", async () => {
    const ic = await fakeIc({ [LEDGER_ID]: { candid: LEDGER } })
    const app = newApp({})
    const { message } = await buildError(app, {
      canisters: {
        transfer: {
          didFile: "did/ledger.did",
          canisterId: LEDGER_ID,
          network: { host: ic.host },
          methods: ["icrc1_transfer", "icrc1_fee"],
        },
        balance: {
          didFile: "did/ledger.did",
          outDir: "src/balance",
          methods: ["icrc1_balance_of"],
        },
      },
    })
    const refusal =
      `"transfer", "balance" name did/ledger.did but not one list of methods to project it to (` +
      `transfer: icrc1_fee, icrc1_transfer; balance: icrc1_balance_of)`
    // One message for both, on one line.
    expect(message).toContain(
      `- transfer (did/ledger.did), balance (did/ledger.did): ${refusal}`
    )
    expect(ic.requests).toEqual([])
    expect(exists(app, "did/ledger.did")).toBe(false)
  })

  it("of a canister with no canisterId that cannot be projected to refuse a shared missing didFile's fetch", async () => {
    const ic = await fakeIc({ [LEDGER_ID]: { candid: LEDGER } })
    const app = newApp({})
    const { message } = await buildError(app, {
      canisters: {
        transfer: {
          didFile: "did/ledger.did",
          canisterId: LEDGER_ID,
          network: { host: ic.host },
          methods: ["icrc1_transfer"],
        },
        broken: {
          didFile: "did/ledger.did",
          outDir: "src/broken",
          methods: ["icrc1_transfer,icrc1_fee"],
        },
      },
    })
    const refusal =
      `"transfer", "broken" name did/ledger.did, which is not fetched, since a list of methods cannot be projected to ` +
      `(broken: methods names "icrc1_transfer,icrc1_fee", which has a comma`
    // One message for both, on one line.
    expect(message).toContain(
      `- transfer (did/ledger.did), broken (did/ledger.did): ${refusal}`
    )
    expect(ic.requests).toEqual([])
    expect(exists(app, "did/ledger.did")).toBe(false)
  })

  it("refuses an empty list and a name with a comma, with no request", async () => {
    const asked = refuseNetwork()
    const app = newApp({})
    const { message } = await buildError(app, {
      canisters: {
        none: {
          didFile: "did/none.did",
          canisterId: LEDGER_ID,
          methods: [],
        },
        comma: {
          didFile: "did/comma.did",
          canisterId: LEDGER_ID,
          methods: ["a,b"],
        },
      },
    })
    expect(lineOf(message, "none")).toContain(
      "none (did/none.did): methods is empty"
    )
    expect(lineOf(message, "comma")).toContain(
      `comma (did/comma.did): methods names "a,b", which has a comma`
    )
    expect(asked).toEqual([])
  })

  it("of a didFile on disk are compared with it, with no request: a name it lacks fails, and a method it has too is a warning", async () => {
    const asked = refuseNetwork()
    const app = newApp({ "did/ledger.did": LEDGER })
    const base = {
      didFile: "did/ledger.did",
      canisterId: LEDGER_ID,
      network: "ic" as const,
    }

    // The file has every method of the list, and more.
    const { result, lines } = runBuild(app.root, {
      canisters: { ledger: { ...base, methods: METHODS } },
    })
    await result
    expect(lines).toContainEqual(
      expect.stringContaining(
        "warn: ic-reactor: ledger: did/ledger.did also holds icrc1_decimals, icrc1_fee, icrc1_metadata,"
      )
    )
    expect(lines).toContainEqual(
      expect.stringContaining(
        "which methods does not name, so its module has them too. Fetch it again with IC_REACTOR_FETCH=ledger to write the projection to methods."
      )
    )
    expect(exists(app, "src/canisters/ledger.ts")).toBe(true)

    // The list names a method the file does not hold.
    const { message } = await buildError(app, {
      canisters: {
        ledger: { ...base, methods: [...METHODS, "icrc2_approve"] },
      },
    })
    expect(lineOf(message, "ledger")).toContain(
      "ledger (did/ledger.did): methods names icrc2_approve, which did/ledger.did does not hold (it holds icrc1_balance_of,"
    )
    expect(lineOf(message, "ledger")).toContain(
      "Fetch it again with IC_REACTOR_FETCH=ledger to write the projection to methods, or take the name out of methods."
    )
    expect(asked).toEqual([])
    expect(read(app, "did/ledger.did")).toBe(LEDGER)
  })

  it("are compared with a didFile saved under vite dev, with no request", async () => {
    const asked = refuseNetwork()
    const app = newApp({ "did/item.did": WRITTEN })
    const running = await startDev(app.root, {
      canisters: {
        item: {
          didFile: "did/item.did",
          canisterId: LEDGER_ID,
          methods: ["get", "maybe", "put"],
        },
      },
    })
    closers.push(running.close)
    expect(running.lines.filter((line) => line.startsWith("error:"))).toEqual(
      []
    )

    // A save that drops a method the list names.
    const file = path.join(app.root, "did/item.did")
    fs.writeFileSync(file, WRITTEN.replace("  put : (nat) -> ();\n", ""))
    running.server.watcher.emit("change", file)
    await vi.waitFor(() =>
      expect(running.lines).toContainEqual(
        expect.stringContaining(
          "item (did/item.did): methods names put, which did/item.did does not hold (it holds get, maybe)"
        )
      )
    )
    expect(asked).toEqual([])
  })

  // The names are listed with a projection to a name no service can have.
  // One that a service can have, as the name the plugin once asked for, lists
  // nothing when the service has it.
  it("of a didFile are compared with it whatever its methods are named", async () => {
    const asked = refuseNetwork()
    const app = newApp({
      "did/item.did": WRITTEN.replace(
        "service : {\n",
        'service : {\n  "ic-reactor list methods" : () -> ();\n'
      ),
    })
    const { message } = await buildError(app, {
      canisters: {
        item: {
          didFile: "did/item.did",
          canisterId: LEDGER_ID,
          methods: ["get", "absent"],
        },
      },
    })
    expect(lineOf(message, "item")).toContain(
      "item (did/item.did): methods names absent, which did/item.did does not hold (it holds get, ic-reactor list methods, maybe, put)"
    )
    expect(exists(app, "src/canisters/item.ts")).toBe(false)
    expect(asked).toEqual([])
  })

  // The CLI that lists them crashes, and its `gen` would succeed: the
  // comparison that did not run must not pass for one that did.
  it("of a didFile whose methods cannot be listed fail the canister, which is not generated", async () => {
    const asked = refuseNetwork()
    const app = createApp({ "did/item.did": WRITTEN }, "fake")
    apps.push(app)
    const { message } = await buildError(app, {
      canisters: {
        item: {
          didFile: "did/item.did",
          canisterId: LEDGER_ID,
          methods: ["get"],
        },
      },
    })
    expect(message).toContain("could not generate 1 of 1 canisters")
    expect(lineOf(message, "item")).toContain(
      "item (did/item.did): methods cannot be compared with did/item.did, whose methods could not be listed:"
    )
    expect(message).toContain("fake trap in project")
    expect(app.runs().map(([command]) => command)).toEqual(["project"])
    expect(asked).toEqual([])
  })

  it("is projected again by IC_REACTOR_FETCH, which rewrites the file", async () => {
    const ic = await fakeIc({ [LEDGER_ID]: { candid: LEDGER } })
    const app = newApp({ "did/ledger.did": LEDGER })
    vi.stubEnv("IC_REACTOR_FETCH", "ledger")
    const { result, lines } = runBuild(app.root, {
      canisters: {
        ledger: {
          didFile: "did/ledger.did",
          canisterId: LEDGER_ID,
          network: { host: ic.host },
          methods: METHODS,
        },
      },
    })
    await result
    expect(lines).toContainEqual(
      expect.stringContaining(
        "rewrote did/ledger.did from the certified candid:service"
      )
    )
    expect(read(app, "did/ledger.did")).not.toContain("icrc1_name")
    expect(lines.filter((line) => line.startsWith("warn:"))).toEqual([])
  })
})

// A service small enough to change by hand, for the live check.
const WRITTEN = `type Item = record { a : nat };
service : {
  get : () -> (Item) query;
  put : (nat) -> ();
  maybe : () -> (opt nat) query;
}
`

/** `WRITTEN` with `edits` made, as the live canister now publishes it. */
const liveWith = (...edits: Array<[string, string]>) =>
  edits.reduce((text, [from, to]) => text.replace(from, to), WRITTEN)

/**
 * Capture what the plugin registers on the WebSocket server. A listener is
 * handed the connecting client as Vite hands it: a socket with `send`.
 */
function spyOnConnections() {
  const connections: Array<(client?: unknown) => void> = []
  const plugin: Plugin = {
    name: "spy-on-connections",
    enforce: "pre",
    configureServer(server) {
      vi.spyOn(server.ws, "on").mockImplementation(((
        event: string,
        callback: (client?: unknown) => void
      ) => {
        if (event === "connection") connections.push(callback)
      }) as never)
    },
  }
  return { connections, plugin }
}

/** A plugin for one canister checked live, whose buildStart the test calls. */
function verifyingPlugin(app: App, host: string) {
  const plugin = icReactor({
    canisters: {
      item: {
        didFile: "did/item.did",
        canisterId: LEDGER_ID,
        network: { host },
        verify: "live",
      },
    },
  }) as Plugin & {
    configResolved: (config: unknown) => void
    buildStart: (this: unknown) => Promise<void>
  }
  const { logger, lines } = recordingLogger()
  plugin.configResolved({ root: app.root, command: "build", logger })
  const context = { addWatchFile: vi.fn(), error: vi.fn() }
  return { buildStart: () => plugin.buildStart.call(context), context, lines }
}

describe("the live check", () => {
  const checked = (host: string): IcReactorPluginOptions => ({
    canisters: {
      item: {
        didFile: "did/item.did",
        canisterId: LEDGER_ID,
        network: { host },
        verify: "live",
      },
    },
  })

  it("passes when the live interface is unchanged, and is made once for one text", async () => {
    const ic = await fakeIc({ [LEDGER_ID]: { candid: WRITTEN } })
    const app = newApp({ "did/item.did": WRITTEN })
    const { buildStart, context, lines } = verifyingPlugin(app, ic.host)

    await buildStart()
    expect(context.error).not.toHaveBeenCalled()
    expect(lines).toContainEqual(
      `info: ic-reactor: item: did/item.did matches the live interface of ${LEDGER_ID} on ${ic.host}`
    )
    expect(exists(app, "src/canisters/item.ts")).toBe(true)
    expect(ic.requests).toEqual([
      "GET /api/v2/status",
      `POST /api/v3/canister/${LEDGER_ID}/read_state`,
    ])

    // Vite 6+'s second buildStart, or a rebuild of `vite build --watch`.
    await buildStart()
    expect(ic.requests).toHaveLength(2)
  })

  it("warns on a compatible change, and generates", async () => {
    const ic = await fakeIc({
      // A field added to a result and a method added: compatible.
      [LEDGER_ID]: {
        candid: liveWith(
          ["record { a : nat }", "record { a : nat; b : opt text }"],
          ["put : (nat) -> ();", "put : (nat) -> ();\n  added : () -> ();"]
        ),
      },
      // An opt whose content changed: compatible, but read as null.
      [OTHER_ID]: { candid: liveWith(["(opt nat)", "(opt text)"]) },
    })
    const app = newApp({ "did/item.did": WRITTEN, "did/opt.did": WRITTEN })
    const { result, lines } = runBuild(app.root, {
      canisters: {
        item: checked(ic.host).canisters!.item,
        opt: {
          didFile: "did/opt.did",
          canisterId: OTHER_ID,
          network: { host: ic.host },
          verify: "live",
        },
      },
    })
    await result
    expect(lines).toContainEqual(
      `warn: ic-reactor: item: ${LEDGER_ID} on ${ic.host} changed compatibly for the methods of did/item.did: ` +
        `its module still works. To take the change, fetch did/item.did again with IC_REACTOR_FETCH=item.`
    )
    const opt = lines.find((line) => line.startsWith("warn: ic-reactor: opt:"))
    expect(opt).toContain(
      `${OTHER_ID} on ${ic.host} is compatible with did/opt.did, with 1 warning`
    )
    expect(opt).toContain("maybe: special_opt_rule at $results[0]: ")
    expect(exists(app, "src/canisters/item.ts")).toBe(true)
    expect(exists(app, "src/canisters/opt.ts")).toBe(true)
  })

  it("fails the build on a method that is missing, changed mode or became incompatible, naming the canister and each method", async () => {
    const ic = await fakeIc({
      [LEDGER_ID]: {
        candid: liveWith(
          ["record { a : nat }", "record { a : text }"],
          ["  put : (nat) -> ();\n", ""],
          ["(opt nat) query", "(opt nat)"]
        ),
      },
    })
    const app = newApp({ "did/item.did": WRITTEN })
    const { message } = await buildError(app, checked(ic.host))
    expect(message).toContain("could not generate 1 of 1 canisters")
    expect(message).toContain(
      `- item (did/item.did): the live check found ${LEDGER_ID} on ${ic.host} incompatible with did/item.did (3 errors):`
    )
    expect(message).toContain("get: method_incompatible at $results[0].a: ")
    expect(message).toContain("maybe: mode_changed: ")
    expect(message).toContain(
      'put: method_missing: the live service has no method "put"'
    )
    expect(message).toContain(
      "fetch did/item.did again with IC_REACTOR_FETCH=item, regenerate, and fix the calls the type checker then reports."
    )
    expect(exists(app, "src/canisters/item.ts")).toBe(false)
  })

  it("follows failOnError: logged, and the other canisters generated", async () => {
    const ic = await fakeIc({
      [LEDGER_ID]: { candid: liveWith(["  put : (nat) -> ();\n", ""]) },
    })
    const app = newApp({ "did/item.did": WRITTEN, "did/ping.did": PING_DID })
    const { result, lines } = runBuild(app.root, {
      failOnError: false,
      canisters: {
        ...checked(ic.host).canisters,
        ping: { didFile: "did/ping.did" },
      },
    })
    await result
    const errors = lines.filter((line) => line.startsWith("error:"))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain("could not generate 1 of 2 canisters")
    expect(errors[0]).toContain(
      `item (did/item.did): the live check found ${LEDGER_ID} on ${ic.host} incompatible with did/item.did (1 error)`
    )
    expect(exists(app, "src/canisters/ping.ts")).toBe(true)
    expect(exists(app, "src/canisters/item.ts")).toBe(false)
  })

  it("runs for IC_REACTOR_VERIFY, and without it or verify nothing is fetched", async () => {
    const ic = await fakeIc({
      [LEDGER_ID]: { candid: liveWith(["  put : (nat) -> ();\n", ""]) },
    })
    const app = newApp({ "did/item.did": WRITTEN, "did/ping.did": PING_DID })
    const options: IcReactorPluginOptions = {
      canisters: {
        item: {
          didFile: "did/item.did",
          canisterId: LEDGER_ID,
          network: { host: ic.host },
        },
        // No canisterId: nothing to check against, and `1` passes it over.
        ping: { didFile: "did/ping.did" },
      },
    }

    await runBuild(app.root, options).result
    expect(ic.requests).toEqual([])

    vi.stubEnv("IC_REACTOR_VERIFY", "1")
    const { message } = await buildError(app, options)
    expect(message).toContain("could not generate 1 of 2 canisters")
    expect(lineOf(message, "item")).toContain(
      `item (did/item.did): the live check found ${LEDGER_ID} on ${ic.host} incompatible with did/item.did (1 error)`
    )
    expect(ic.requests).toHaveLength(2)

    // By name, as IC_REACTOR_FETCH: a canister with no canisterId fails.
    vi.stubEnv("IC_REACTOR_VERIFY", "ping")
    const named = await buildError(app, options)
    expect(lineOf(named.message, "ping")).toContain(
      "ping (did/ping.did): IC_REACTOR_VERIFY asks for its live check, but it names no canisterId"
    )
  })

  it("is off for IC_REACTOR_VERIFY=0, over verify: live, with no request", async () => {
    // Incompatible, so a check that ran would fail the build.
    const ic = await fakeIc({
      [LEDGER_ID]: { candid: liveWith(["  put : (nat) -> ();\n", ""]) },
    })
    const app = newApp({ "did/item.did": WRITTEN })

    for (const value of ["0", "false"]) {
      vi.stubEnv("IC_REACTOR_VERIFY", value)
      const { result, lines } = runBuild(app.root, checked(ic.host))
      await result
      expect(lines.filter((line) => !line.startsWith("info:"))).toEqual([])
      expect(exists(app, "src/canisters/item.ts")).toBe(true)
    }
    expect(ic.requests).toEqual([])

    // A name next to 0 is not checked either, and the run says so.
    vi.stubEnv("IC_REACTOR_VERIFY", "0,item")
    const { result, lines } = runBuild(app.root, checked(ic.host))
    await result
    expect(lines).toContain(
      'warn: ic-reactor: IC_REACTOR_VERIFY is "0,item", and 0 turns the live check off: no canister is checked'
    )
    expect(ic.requests).toEqual([])
  })

  // A save makes no request, so it cannot tell that the file matches the
  // canister again: whatever it changed, the failure stands, in the log and
  // the overlay, until a check passes when the server starts again.
  it("that failed under vite dev stands when the .did is saved, changed or not, until a check passes at the next start", async () => {
    const canisters: Record<string, Canister> = {
      [LEDGER_ID]: { candid: liveWith(["  put : (nat) -> ();\n", ""]) },
    }
    const ic = await fakeIc(canisters)
    const app = newApp({ "did/item.did": WRITTEN })
    const { connections, plugin } = spyOnConnections()
    const running = await startDev(app.root, checked(ic.host), {
      before: [plugin],
    })
    let closed = false
    const close = async () => {
      if (closed) return
      closed = true
      await running.close()
    }
    closers.push(close)
    const failure =
      `item (did/item.did): the live check found ${LEDGER_ID} on ${ic.host} ` +
      `incompatible with did/item.did (1 error)`
    const errors = () =>
      running.lines.filter((line) => line.startsWith("error:"))
    expect(errors()).toHaveLength(1)
    expect(errors()[0]).toContain(failure)
    expect(ic.requests).toHaveLength(2)
    const send = vi.spyOn(running.server.ws, "send")

    // Saved as it is (a touch), then with an edit that changes no method.
    const file = path.join(app.root, "did/item.did")
    for (const text of [WRITTEN, `// Edited.\n${WRITTEN}`]) {
      const before = errors().length
      fs.writeFileSync(file, text)
      running.server.watcher.emit("change", file)
      await vi.waitFor(() => expect(errors()).toHaveLength(before + 1))
      expect(errors()[before]).toContain(failure)
      expect(errors()[before]).toContain(
        "did/item.did was saved, and a save makes no request: this stands until a live check passes, which runs when the dev server restarts."
      )
      expect(send).not.toHaveBeenCalledWith({ type: "full-reload" })
      // A browser that connects now is handed it.
      const client = { send: vi.fn() }
      connections[0](client)
      expect(client.send).toHaveBeenCalledTimes(1)
      expect(
        JSON.parse(client.send.mock.calls[0][0] as string).err.message
      ).toContain(failure)
    }
    expect(exists(app, "src/canisters/item.ts")).toBe(false)
    expect(ic.requests).toHaveLength(2)

    // The canister is put back: the next start checks again, and it passes.
    canisters[LEDGER_ID] = { candid: WRITTEN }
    await close()
    const next = await startDev(app.root, checked(ic.host))
    closers.push(next.close)
    expect(next.lines.filter((line) => line.startsWith("error:"))).toEqual([])
    expect(next.lines).toContainEqual(
      `info: ic-reactor: item: did/item.did matches the live interface of ${LEDGER_ID} on ${ic.host}`
    )
    expect(exists(app, "src/canisters/item.ts")).toBe(true)
    expect(ic.requests).toHaveLength(4)
  })

  it("that cannot read the canister fails it, and says how to turn the check off", async () => {
    const ic = await fakeIc({ [LEDGER_ID]: { private: true } })
    const app = newApp({ "did/item.did": WRITTEN })
    const { message } = await buildError(app, checked(ic.host))
    expect(lineOf(message, "item")).toContain(
      `item (did/item.did): ${ic.host} refused to read the candid:service of ${LEDGER_ID} (HTTP 403`
    )
    expect(lineOf(message, "item")).toContain(
      'the live check cannot read it, so build with IC_REACTOR_VERIFY=0, and stop asking for the check of did/item.did (remove its verify: "live", or its name from IC_REACTOR_VERIFY).'
    )
    expect(read(app, "did/item.did")).toBe(WRITTEN)
  })
})
