import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as vitePluginModule from "./index.js"
import type { IcReactorPluginOptions } from "./index.js"
import path from "node:path"
import { spawn } from "child_process"
import { installIcpAdvice } from "./env.js"
import { icpProcess } from "../tests/support.js"
import { getCanisterEnv } from "@icp-sdk/core/agent/canister-env"
import { resolveConfig as resolveViteConfig } from "vite"

const createVitePlugin =
  (vitePluginModule as any).icReactor ??
  (vitePluginModule as any).icReactorPlugin

// Mock child_process
vi.mock("child_process", () => ({
  spawn: vi.fn(),
}))

/**
 * Answer each `icp` command with what `answer` returns for its arguments: its
 * stdout, or an Error to fail with. An Error's `stderr`, or else its message,
 * is the command's stderr (`icpProcess`).
 */
function mockIcp(answer: (args: string[]) => string | Error) {
  ;(spawn as any).mockImplementation((_file: string, args: string[]) =>
    icpProcess(answer(args))
  )
}

/**
 * A Vite root that is deliberately not the process cwd, so every path
 * assertion below fails if the plugin falls back to `process.cwd()`.
 */
const VITE_ROOT = path.resolve("/vite/root")

describe("icReactor", () => {
  const mockOptions: IcReactorPluginOptions = {
    canisters: { test_canister: {} },
  }

  const mockServer: any = {
    config: {
      root: VITE_ROOT,
      logger: {
        info: vi.fn(),
      },
    },
    middlewares: {
      use: vi.fn(),
    },
    // A refused canister, with a didFile or not, is replayed to each browser
    // that connects.
    ws: {
      on: vi.fn(),
      send: vi.fn(),
    },
    restart: vi.fn(),
  }

  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("should return correct plugin structure", () => {
    const plugin = createVitePlugin(mockOptions)
    expect(plugin.name).toBe("ic-reactor-plugin")
    expect(plugin.configureServer).toBeDefined()
    expect(plugin.configurePreviewServer).toBeDefined()
    expect((plugin as any).config).toBeDefined()
  })

  // A JavaScript config is not type-checked: read by truthiness, `0`, `""`
  // or `null` would turn the option off and `"false"` would turn it on.
  it("should refuse a failOnError that is not true or false", () => {
    for (const value of [null, 0, "", "false"]) {
      expect(() => createVitePlugin({ failOnError: value })).toThrow(
        `[ic-reactor] failOnError is ${JSON.stringify(value)}, not true or false: ` +
          "set it to true or false, or remove it for the default"
      )
    }
    for (const value of [undefined, true, false]) {
      expect(() => createVitePlugin({ failOnError: value })).not.toThrow()
    }
  })

  it("should refuse an onGenerated that is not a function", () => {
    for (const value of [null, 0, "", "hook", {}]) {
      expect(() => createVitePlugin({ onGenerated: value })).toThrow(
        /^\[ic-reactor\] onGenerated is .*, not a function: give it a function to call after each generated module, or remove it$/
      )
    }
    for (const value of [undefined, () => {}, async () => {}]) {
      expect(() => createVitePlugin({ onGenerated: value })).not.toThrow()
    }
  })

  it("should refuse an injectEnvironment that is not true or false", () => {
    for (const value of [null, 0, "", "false"]) {
      expect(() => createVitePlugin({ injectEnvironment: value })).toThrow(
        `[ic-reactor] injectEnvironment is ${JSON.stringify(value)}, not true or false: ` +
          "set it to true or false, or remove it for the default"
      )
    }
    for (const value of [undefined, true, false]) {
      expect(() => createVitePlugin({ injectEnvironment: value })).not.toThrow()
    }
  })

  // Only an omitted option takes its default. `canisters: null` read as none
  // started the plugin with no canister: nothing generated, none in the
  // cookie, and the bindings of the last run left as they were.
  it("should refuse canisters, or the options, given as null or any value that is not an object, and take only an omitted one for none", () => {
    const given: Array<[unknown, string]> = [
      [null, "null"],
      [0, "0"],
      ["", '""'],
      ["ledger", '"ledger"'],
      [false, "false"],
      [[], "[]"],
      [() => ({}), "a function"],
      [1n, "1n"],
    ]
    for (const [value, quoted] of given) {
      expect(() => createVitePlugin({ canisters: value })).toThrow(
        `[ic-reactor] canisters is ${quoted}, not a plain object of canisters by name: ` +
          "give each canister's options under its name, or remove canisters"
      )
    }
    expect(() => createVitePlugin(null)).toThrow(
      "[ic-reactor] the options are null, not a plain object: give icReactor() an object of options, or none"
    )
    for (const options of [
      undefined,
      {},
      { canisters: undefined },
      { canisters: {} },
    ]) {
      expect(() => createVitePlugin(options)).not.toThrow()
    }
  })

  // An object that is not a plain one is no object of canisters: its keys
  // are not the canisters it holds. Read for them, a Map of canisters, a
  // Promise of them (an async loader not awaited) or the canisters a
  // prototype holds were none, and the plugin started with no canister,
  // without a word, as for canisters: null.
  it("should refuse canisters, or the options, given as an object that is not a plain one, and take one with no prototype", () => {
    class Canisters {
      ledger = { didFile: "did/ledger.did" }
    }
    const canisters = { ledger: { didFile: "did/ledger.did" } }
    const given: Array<[unknown, string]> = [
      [new Map(Object.entries(canisters)), "Map {}"],
      [Promise.resolve(canisters), "Promise {}"],
      [new Canisters(), 'Canisters {"ledger":{"didFile":"did/ledger.did"}}'],
      [Object.create(canisters), "{} (an object that inherits from another)"],
      [new Date(0), "Date {}"],
      [new Number(1), "Number {}"],
    ]
    for (const [value, quoted] of given) {
      expect(() => createVitePlugin({ canisters: value })).toThrow(
        `[ic-reactor] canisters is ${quoted}, not a plain object of canisters by name: ` +
          "give each canister's options under its name, or remove canisters"
      )
    }
    const options = { canisters }
    for (const [value, quoted] of [
      [new Map(Object.entries(options)), "Map {}"],
      [Promise.resolve(options), "Promise {}"],
    ] as const) {
      expect(() => createVitePlugin(value)).toThrow(
        `[ic-reactor] the options are ${quoted}, not a plain object: give icReactor() an object of options, or none`
      )
    }
    // An object with no prototype, as Object.create(null) makes, is plain.
    const bare = Object.assign(Object.create(null), canisters)
    expect(() => createVitePlugin({ canisters: bare })).not.toThrow()
    expect(() =>
      createVitePlugin(Object.assign(Object.create(null), { canisters: bare }))
    ).not.toThrow()
  })

  // A key that is no option was never read: a misspelled canisters started
  // the plugin with no canister, without a word, as canisters: null did, and
  // a misspelled failOnError left a build to ship stale bindings.
  it("should refuse a key of the options that is not an option, whatever its value, and name the option it may misspell", () => {
    const canisters = { ledger: { didFile: "did/ledger.did" } }
    const given: Array<[unknown, string]> = [
      [
        { canister: canisters },
        '"canister" (did you mean canisters?) is not an option',
      ],
      [
        { canisters, FailOnError: true },
        '"FailOnError" (did you mean failOnError?) is not an option',
      ],
      // Nine letters from canisters, case and all, and none with case aside.
      [
        { CANISTERS: canisters },
        '"CANISTERS" (did you mean canisters?) is not an option',
      ],
      // No option is near enough to name.
      [
        { canisters, outDir: "src/declarations", verbose: true },
        '"outDir" and "verbose" are not options',
      ],
      // The key is what is wrong, whatever its value.
      [
        { canisters, failOnErorr: undefined },
        '"failOnErorr" (did you mean failOnError?) is not an option',
      ],
      // A JSON config's own key, as any other.
      [
        JSON.parse('{ "__proto__": {}, "canisters": {} }'),
        '"__proto__" is not an option',
      ],
    ]
    for (const [value, refused] of given) {
      expect(() => createVitePlugin(value)).toThrow(
        `[ic-reactor] ${refused} of icReactor(): ` +
          "its options are canisters, injectEnvironment, failOnError and onGenerated"
      )
    }
    const unlisted = new Proxy(
      { canisters },
      {
        ownKeys() {
          throw new Error("no keys today")
        },
      }
    )
    expect(() => createVitePlugin(unlisted)).toThrow(
      "[ic-reactor] the options could not be listed: no keys today"
    )
    for (const known of [
      {},
      { canisters, injectEnvironment: true, failOnError: false },
      { canisters: undefined, injectEnvironment: undefined },
    ]) {
      expect(() => createVitePlugin(known)).not.toThrow()
    }
  })

  describe("config", () => {
    /**
     * Every canister id `icp` reports, by canister name: its own properties
     * only, so that a canister named `toString` is one `icp` does not know.
     */
    type Deployed = Record<string, string>

    /**
     * `icp canister status`'s answer to its arguments `args`, read as icp's
     * parser reads them: `-e` takes a value, `-i` none, `--` ends the
     * options, and the first other argument is the canister. Before `--`,
     * an argument that begins with `-` is a flag: `--help` prints the help,
     * with exit 0, and any other unknown one is refused.
     */
    const statusOf = (args: string[], deployed: Deployed): string | Error => {
      let name: string | undefined
      for (let index = 0; index < args.length; index++) {
        const arg = args[index]
        if (arg === "--") {
          name ??= args[index + 1]
          break
        }
        if (arg === "-e") index += 1
        else if (arg === "-h" || arg === "--help") {
          return "Show the status of canister(s).\n\nUsage: icp canister status [OPTIONS] [CANISTER]\n"
        } else if (arg.startsWith("-") && arg !== "-i") {
          return new Error(`error: unexpected argument '${arg}' found`)
        } else if (arg !== "-i") name ??= arg
      }
      return name !== undefined &&
        Object.prototype.hasOwnProperty.call(deployed, name)
        ? deployed[name]
        : new Error(`canister ${name} not found`)
    }

    /**
     * Answer each `icp` command the plugin runs: the network status, or
     * `network` as the error it fails with, and each canister's id from
     * `deployed`, failing for a canister that is not in it.
     */
    const answerIcp = (
      deployed: Deployed,
      network: Record<string, unknown> | Error = {
        root_key: "mock-root-key",
        port: 4943,
      }
    ) =>
      mockIcp((args) => {
        if (args[0] === "network") {
          return network instanceof Error ? network : JSON.stringify(network)
        }
        return statusOf(args.slice(2), deployed)
      })

    /** How many `icp` commands the plugin has run. */
    const icpCalls = () => (spawn as any).mock.calls.length

    /**
     * Run the config hook as `vite dev` does, then configureServer, and return
     * the config and the middleware that sets the cookie.
     */
    const serveWithEnvironment = async (plugin: any, userConfig = {}) => {
      const config = await plugin.config(userConfig, { command: "serve" })
      mockServer.middlewares.use.mockClear()
      plugin.configureServer(mockServer)
      const middleware = mockServer.middlewares.use.mock.calls[0]?.[0]
      return { config, middleware }
    }

    /** A page load. */
    const PAGE = { method: "GET", accept: "text/html,application/xhtml+xml" }
    /** A module or `fetch` request, which is not a page load. */
    const MODULE = { method: "GET", accept: "*/*" }

    /** Send `middleware` a request and return the Set-Cookie it added. */
    const request = async (
      middleware: any,
      { method, accept }: { method: string; accept: string } = PAGE
    ): Promise<string | undefined> => {
      const headers = new Map<string, unknown>()
      const res = {
        getHeader: (name: string) => headers.get(name.toLowerCase()),
        setHeader: (name: string, value: unknown) => {
          headers.set(name.toLowerCase(), value)
        },
      }
      await new Promise<void>((resolve, reject) =>
        middleware({ method, headers: { accept } }, res, (error?: unknown) =>
          error ? reject(error) : resolve()
        )
      )
      const cookie = headers.get("set-cookie")
      return cookie === undefined ? undefined : String(cookie)
    }

    /**
     * The `ic_env` cookie of a `Set-Cookie` header as the app reads it, with
     * `@icp-sdk/core`'s `getCanisterEnv`, as a page does.
     */
    const readBack = (setCookie: string | undefined) => {
      vi.stubGlobal("document", { cookie: String(setCookie).split(";")[0] })
      try {
        return getCanisterEnv()
      } finally {
        vi.unstubAllGlobals()
      }
    }

    it("should set up the API proxy and the cookie when icp-cli is available", async () => {
      answerIcp({ test_canister: "mock-canister-id" })

      const plugin = createVitePlugin(mockOptions)
      const { config, middleware } = await serveWithEnvironment(plugin)

      const cookie = await request(middleware)
      expect(cookie).toContain("ic_env=")
      expect(cookie).toContain(
        "PUBLIC_CANISTER_ID%3Atest_canister%3Dmock-canister-id"
      )
      expect(cookie).toContain("ic_root_key%3Dmock-root-key")
      expect(cookie).toContain("; Path=/; SameSite=Lax;")
      expect(config.server.proxy["/api"]).toMatchObject({
        target: "http://127.0.0.1:4943",
        changeOrigin: true,
      })
      // Set per response by the middleware, not fixed at startup.
      expect(config.server.headers).toBeUndefined()
    })

    // icp looks for icp.yaml in its working directory and the directories above
    // it. `vite apps/web` from a monorepo root, or `root` in the config, leaves
    // the process cwd outside the app, so icp has to start from Vite's root.
    it("should run icp from the Vite root rather than the process cwd", async () => {
      answerIcp({ test_canister: "mock-canister-id" })

      const plugin = createVitePlugin(mockOptions)
      await plugin.config({ root: "apps/web" }, { command: "serve" })

      const workingDirs = (spawn as any).mock.calls.map(
        ([, , options]: any) => options?.cwd
      )
      expect(workingDirs.length).toBeGreaterThan(1)
      expect(new Set(workingDirs)).toEqual(new Set([path.resolve("apps/web")]))
    })

    it("should prefer configured canisterId over CLI-discovered env values", async () => {
      answerIcp({ test_canister: "local-cli-canister-id" })

      const plugin = createVitePlugin({
        ...mockOptions,
        canisters: {
          test_canister: { canisterId: "yq4ns-hyaaa-aaaap-akbna-cai" },
        },
      })
      const { middleware } = await serveWithEnvironment(plugin)

      const cookie = await request(middleware)
      expect(cookie).toContain(
        "PUBLIC_CANISTER_ID%3Atest_canister%3Dyq4ns-hyaaa-aaaap-akbna-cai"
      )
      expect(cookie).not.toContain("local-cli-canister-id")
    })

    // Its answer would be thrown away, and each question is an `icp` process
    // (#980).
    it("should not ask icp for a canister whose canisterId is configured, but for internet_identity", async () => {
      answerIcp({
        other: "bkyz2-fmaaa-aaaaa-qaaaq-cai",
        internet_identity: "rdmx6-jaaaa-aaaaa-aaadq-cai",
      })
      const askedFor = () =>
        (spawn as any).mock.calls
          .map(([, args]: [string, string[]]) => args)
          .filter((args: string[]) => args[0] === "canister")
          .map((args: string[]) => args[args.length - 1])

      const plugin = createVitePlugin({
        canisters: {
          test_canister: { canisterId: "yq4ns-hyaaa-aaaap-akbna-cai" },
          other: {},
        },
      })
      const { middleware } = await serveWithEnvironment(plugin)
      await request(middleware)
      expect(askedFor()).toEqual(["other", "internet_identity"])

      // A configured internet_identity is still looked up: icp reports the
      // project's own, so the cookie names no built-in provider beside it.
      ;(spawn as any).mockClear()
      const withIdentity = createVitePlugin({
        canisters: {
          other: {},
          internet_identity: { canisterId: "rdmx6-jaaaa-aaaaa-aaadq-cai" },
        },
      })
      const served = await serveWithEnvironment(withIdentity)
      const cookie = await request(served.middleware)
      expect(askedFor()).toEqual(["other", "internet_identity"])
      expect(cookie).toContain(
        "PUBLIC_CANISTER_ID%3Ainternet_identity%3Drdmx6-jaaaa-aaaaa-aaadq-cai"
      )
      expect(cookie).not.toContain("INTERNET_IDENTITY_PROVIDER")
    })

    // A canister's name is kept as given, and a JSON config can name one
    // __proto__. Kept by name in a plain object, its configured ID went to
    // the prototype's setter instead, and the cookie carried no ID for it.
    it("should give a canister named __proto__ or constructor its configured canisterId over the one icp reports", async () => {
      answerIcp(
        Object.fromEntries([
          ["__proto__", "icp-proto-id"],
          ["constructor", "icp-constructor-id"],
        ])
      )

      const plugin = createVitePlugin({
        canisters: JSON.parse(
          '{"__proto__": {"canisterId": "ryjl3-tyaaa-aaaaa-aaaba-cai"},' +
            ' "constructor": {"canisterId": "mqygn-kiaaa-aaaar-qaadq-cai"}}'
        ),
      })
      const { middleware } = await serveWithEnvironment(plugin)

      const cookie = await request(middleware)
      expect(cookie).toContain(
        "PUBLIC_CANISTER_ID%3A__proto__%3Dryjl3-tyaaa-aaaaa-aaaba-cai"
      )
      expect(cookie).toContain(
        "PUBLIC_CANISTER_ID%3Aconstructor%3Dmqygn-kiaaa-aaaar-qaadq-cai"
      )
      expect(cookie).not.toContain("icp-proto-id")
      expect(cookie).not.toContain("icp-constructor-id")
    })

    // Looked up in a plain object, a canister named after a member of
    // Object.prototype found that member, so it was never missing: no
    // warning, no page load asked icp again, and the cookie never carried its
    // ID. __proto__'s ID, which icp reported, went to the prototype's setter.
    it("should ask icp for a canister named __proto__, constructor, toString or hasOwnProperty until it has an ID, and give the cookie the one icp reports", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {})
      vi.spyOn(console, "log").mockImplementation(() => {})
      const names = ["__proto__", "constructor", "toString", "hasOwnProperty"]
      answerIcp({})
      const plugin = createVitePlugin({
        canisters: JSON.parse(
          '{"__proto__": {}, "constructor": {}, "toString": {}, "hasOwnProperty": {}}'
        ),
      })
      const { middleware } = await serveWithEnvironment(plugin)

      expect(consoleWarnSpy).toHaveBeenCalledOnce()
      expect(consoleWarnSpy.mock.calls[0][0]).toContain(
        'no canister ID could be resolved for "__proto__", "constructor", "toString", "hasOwnProperty"'
      )
      expect(await request(middleware)).not.toContain("PUBLIC_CANISTER_ID")

      // Deployed: the next page load asks icp, and the cookie carries each ID.
      answerIcp(
        Object.fromEntries(
          names.map((name, index) => [name, `icp-id-${index}`])
        )
      )
      const cookie = await request(middleware)
      names.forEach((name, index) =>
        expect(cookie).toContain(
          `PUBLIC_CANISTER_ID%3A${name}%3Dicp-id-${index}`
        )
      )
    })

    // icp gives a canister a name of ASCII letters, digits, _ and -, which
    // may begin with -. Handed to icp before its options ended, such a name
    // was read as a flag: icp refused it, or printed its help for --help,
    // with exit 0, which the cookie then carried as the canister's ID.
    it("should ask icp for a canister whose name begins with - by that name, and give the cookie the ID it reports", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {})
      answerIcp({ "-x": "icp-dash-id", "--help": "icp-help-id" })

      const plugin = createVitePlugin({ canisters: { "-x": {}, "--help": {} } })
      const { middleware } = await serveWithEnvironment(plugin)

      const cookie = await request(middleware)
      expect(cookie).toContain("PUBLIC_CANISTER_ID%3A-x%3Dicp-dash-id")
      expect(cookie).toContain("PUBLIC_CANISTER_ID%3A--help%3Dicp-help-id")
      expect(cookie).not.toContain("Show%20the%20status")
    })

    // The cookie joins its entries with & and each name to its ID with =, as
    // the asset canister writes it, and @icp-sdk/core reads it back so. A
    // name that held either was read back as other keys, one of which could
    // take the place of another canister's entry or of the root key: the app
    // then read no environment at all.
    it("should leave a canister whose name holds & or = out of the cookie, with a warning, and the app reads back every other name as given", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {})
      answerIcp(
        {
          "-x": "icp-dash-id",
          "a=b": "icp-equals-id",
          "x&ic_root_key=00": "icp-amp-id",
        },
        { root_key: "ab".repeat(133), port: 4943 }
      )

      const plugin = createVitePlugin({
        canisters: JSON.parse(`{
          "__proto__": { "canisterId": "ryjl3-tyaaa-aaaaa-aaaba-cai" },
          "-x": {},
          "a b": { "canisterId": "bkyz2-fmaaa-aaaaa-qaaaq-cai" },
          "a=b": {},
          "x&ic_root_key=00": { "canisterId": "mqygn-kiaaa-aaaar-qaadq-cai" }
        }`),
      })
      const { middleware } = await serveWithEnvironment(plugin)

      expect(readBack(await request(middleware))).toEqual({
        IC_ROOT_KEY: new Uint8Array(133).fill(0xab),
        "PUBLIC_CANISTER_ID:__proto__": "ryjl3-tyaaa-aaaaa-aaaba-cai",
        "PUBLIC_CANISTER_ID:-x": "icp-dash-id",
        "PUBLIC_CANISTER_ID:a b": "bkyz2-fmaaa-aaaaa-qaaaq-cai",
        INTERNET_IDENTITY_PROVIDER: "http://id.ai.localhost:4943/authorize",
      })
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[ic-reactor] The ic_env cookie cannot carry the canisters "a=b", "x&ic_root_key=00": ' +
          'it joins its entries with "&" and each name to its ID with "=", so a name that holds either ' +
          "would be read back as other keys, and it cannot encode text that is not well-formed. They are left " +
          "out of the cookie, and icp is not asked for their IDs. Name the canister as icp does: ASCII letters, " +
          'digits, "_" and "-".'
      )
      const asked = (spawn as any).mock.calls.map(
        ([, args]: [string, string[]]) => args[args.length - 1]
      )
      expect(asked).toContain("-x")
      expect(asked).not.toContain("a=b")
      expect(asked).not.toContain("x&ic_root_key=00")
    })

    // Text that is not well-formed, a lone surrogate as a JSON config can
    // hold, cannot be URI-encoded: the cookie threw as it was built, and no
    // cookie was set for any canister.
    it("should leave a canister whose name is not well-formed text out of the cookie, with a warning, and set the cookie for the others", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {})
      answerIcp({ "-x": "icp-dash-id" })

      const plugin = createVitePlugin({
        canisters: JSON.parse(
          '{ "-x": {}, "\\ud800": { "canisterId": "yq4ns-hyaaa-aaaap-akbna-cai" } }'
        ),
      })
      const { middleware } = await serveWithEnvironment(plugin)

      const cookie = await request(middleware)
      expect(cookie).toBeDefined()
      expect(cookie).toContain("PUBLIC_CANISTER_ID%3A-x%3Dicp-dash-id")
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[ic-reactor] The ic_env cookie cannot carry the canister "\\ud800": ' +
          'it joins its entries with "&" and each name to its ID with "=", so a name that holds either ' +
          "would be read back as other keys, and it cannot encode text that is not well-formed. It is left " +
          "out of the cookie, and icp is not asked for its ID. Name the canister as icp does: ASCII letters, " +
          'digits, "_" and "-".'
      )
    })

    // A JavaScript config is not type-checked: a configured canisterId that
    // is not text, or is empty, is neither put in the cookie nor dropped
    // without a word. Neither is text that is no principal, which the cookie
    // would hand the app as the canister's ID.
    it("should leave a configured canisterId that is not one to icp, and warn", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {})
      answerIcp({
        empty: "icp-empty",
        nil: "icp-nil",
        number: "icp-number",
        text: "icp-text",
      })

      const plugin = createVitePlugin({
        canisters: {
          empty: { canisterId: "" },
          nil: { canisterId: null },
          number: { canisterId: 123 },
          // yq4ns-hyaaa-aaaap-akbna-cai with its last letter changed.
          text: { canisterId: "yq4ns-hyaaa-aaaap-akbna-caj" },
        },
      })
      const { middleware } = await serveWithEnvironment(plugin)

      const cookie = await request(middleware)
      expect(cookie).toContain("PUBLIC_CANISTER_ID%3Aempty%3Dicp-empty")
      expect(cookie).toContain("PUBLIC_CANISTER_ID%3Anil%3Dicp-nil")
      expect(cookie).toContain("PUBLIC_CANISTER_ID%3Anumber%3Dicp-number")
      expect(cookie).toContain("PUBLIC_CANISTER_ID%3Atext%3Dicp-text")
      expect(cookie).not.toContain("akbna-caj")
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[ic-reactor] canisterId is not a canister ID (empty: ""; nil: null; number: 123; text: "yq4ns-hyaaa-aaaap-akbna-caj"), ' +
          "so the ic_env cookie takes the ID of those canisters from icp. " +
          "Give the canister's principal as text, or remove canisterId."
      )
    })

    it("should inject built-in local Internet Identity provider when no project II canister is found", async () => {
      answerIcp(
        { test_canister: "mock-canister-id" },
        { root_key: "mock-root-key", api_url: "http://localhost:8000/" }
      )

      const plugin = createVitePlugin(mockOptions)
      const { config, middleware } = await serveWithEnvironment(plugin)

      expect(await request(middleware)).toContain(
        "INTERNET_IDENTITY_PROVIDER%3Dhttp%3A%2F%2Fid.ai.localhost%3A8000%2Fauthorize"
      )
      expect(config.server.proxy["/api"].target).toBe("http://localhost:8000/")
    })

    it("should fallback to default proxy when icp-cli fails", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {})
      mockIcp(() => new Error("Command not found"))

      const plugin = createVitePlugin(mockOptions)
      const { config, middleware } = await serveWithEnvironment(plugin)

      expect(await request(middleware)).toBeUndefined()
      expect(config.server.proxy["/api"].target).toBe("http://127.0.0.1:8000")
      // Silent detection failure is indistinguishable from a working setup
      // until the app blows up on an undefined canister id at runtime. The
      // warning says what the plugin does about it.
      expect(consoleWarnSpy).toHaveBeenCalledOnce()
      const [warning] = consoleWarnSpy.mock.calls[0]
      expect(warning).toContain("Could not detect the local IC environment")
      expect(warning).toContain("/api goes to http://127.0.0.1:8000 for now")
      expect(warning).toContain(
        "asks `icp` again on each page load until it answers"
      )
      expect(warning).toContain("reload the page")
    })

    it("says icp could not be run, not that the network may be down, when no icp starts", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {})
      // What spawn fails with when the file cannot be found: on Windows,
      // also what an npm-installed icp.cmd gives.
      mockIcp(() =>
        Object.assign(new Error("spawn icp ENOENT"), { code: "ENOENT" })
      )

      const plugin = createVitePlugin(mockOptions)
      const { middleware } = await serveWithEnvironment(plugin)

      expect(await request(middleware)).toBeUndefined()
      expect(consoleWarnSpy).toHaveBeenCalledOnce()
      const [warning] = consoleWarnSpy.mock.calls[0]
      expect(warning).toContain("Could not run `icp`")
      expect(warning).toContain(installIcpAdvice())
      expect(warning).not.toContain("Is the local network running?")
    })

    // The replica being UP while a configured canister is simply not deployed
    // is the common case: `vite dev` usually starts before `icp deploy`.
    it("should warn when the replica is up but a configured canister has no id", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {})
      answerIcp({})

      const plugin = createVitePlugin(mockOptions)
      const { middleware } = await serveWithEnvironment(plugin)

      expect(consoleWarnSpy).toHaveBeenCalledOnce()
      const [warning] = consoleWarnSpy.mock.calls[0]
      expect(warning).toContain(
        'no canister ID could be resolved for "test_canister"'
      )
      // It used to promise that deploying was enough, while the cookie stayed
      // without the id until the dev server restarted.
      expect(warning).toContain(
        "Deploy it (`icp deploy`) and reload the page: the plugin asks `icp` " +
          "again on each page load until every configured canister has an ID."
      )
      const cookie = await request(middleware)
      expect(cookie).toContain("ic_root_key%3Dmock-root-key")
      expect(cookie).not.toContain("PUBLIC_CANISTER_ID")
    })

    it("should stay quiet about failed detection when no canisters are configured", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {})
      mockIcp(() => new Error("project manifest not found"))

      const plugin = createVitePlugin({ canisters: {} })
      await plugin.config({}, { command: "serve" })

      expect(consoleWarnSpy).not.toHaveBeenCalled()
    })

    it("should surface the icp stderr at debug level", async () => {
      const consoleDebugSpy = vi
        .spyOn(console, "debug")
        .mockImplementation(() => {})
      vi.spyOn(console, "warn").mockImplementation(() => {})
      vi.stubEnv("DEBUG", "ic-reactor")
      mockIcp(() =>
        Object.assign(new Error("Command failed: icp network status"), {
          stderr: "error: no local network is running\n",
        })
      )

      const plugin = createVitePlugin(mockOptions)
      await plugin.config({}, { command: "serve" })

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining("no local network is running")
      )

      vi.unstubAllEnvs()
    })

    it("should inject default local II provider in env-only mode when icp-cli project detection fails", async () => {
      mockIcp(() => new Error("project manifest not found"))

      const plugin = createVitePlugin({ canisters: {} })
      const { config, middleware } = await serveWithEnvironment(plugin)

      expect(await request(middleware)).toContain(
        "INTERNET_IDENTITY_PROVIDER%3Dhttp%3A%2F%2Fid.ai.localhost%3A8000%2Fauthorize"
      )
      expect(config.server.proxy["/api"].target).toBe("http://127.0.0.1:8000")
    })

    it("should return empty config for build command", async () => {
      const plugin = createVitePlugin(mockOptions)
      const config = await (plugin as any).config({}, { command: "build" })

      expect(config).toEqual({})
      expect(spawn).not.toHaveBeenCalled()
    })

    it("should add no middleware when injectEnvironment is off", async () => {
      const plugin = createVitePlugin({
        ...mockOptions,
        injectEnvironment: false,
      })
      const { config, middleware } = await serveWithEnvironment(plugin)

      expect(config).toEqual({})
      expect(middleware).toBeUndefined()
      expect(spawn).not.toHaveBeenCalled()
    })

    // `vite preview` resolves the config with the `serve` command, and used to
    // get the cookie through `preview.headers`, which defaults to
    // `server.headers`.
    it("should set the cookie on the preview server too", async () => {
      answerIcp({ test_canister: "mock-canister-id" })

      const plugin = createVitePlugin(mockOptions)
      await plugin.config({}, { command: "serve" })
      const previewServer = { middlewares: { use: vi.fn() } }
      plugin.configurePreviewServer(previewServer)

      expect(
        await request(previewServer.middlewares.use.mock.calls[0][0])
      ).toContain("PUBLIC_CANISTER_ID%3Atest_canister%3Dmock-canister-id")
    })

    // `vite dev` usually starts before the canister is deployed. The cookie
    // was fixed at startup, so after `icp deploy` every reload still lacked the
    // id until the dev server restarted (#664).
    describe("while detection is incomplete", () => {
      it("should give a page load after a deploy the new canister's id", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {})
        const consoleLogSpy = vi
          .spyOn(console, "log")
          .mockImplementation(() => {})
        answerIcp({})
        const plugin = createVitePlugin(mockOptions)
        const { middleware } = await serveWithEnvironment(plugin)
        expect(await request(middleware)).not.toContain("PUBLIC_CANISTER_ID")

        answerIcp({ test_canister: "bkyz2-fmaaa-aaaaa-qaaaq-cai" })

        expect(await request(middleware)).toContain(
          "PUBLIC_CANISTER_ID%3Atest_canister%3Dbkyz2-fmaaa-aaaaa-qaaaq-cai"
        )
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '[ic-reactor] The ic_env cookie now carries the canister ID for "test_canister".'
        )
      })

      it("should pick up a network that was down at startup and send /api to it", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {})
        const consoleLogSpy = vi
          .spyOn(console, "log")
          .mockImplementation(() => {})
        answerIcp({}, new Error("no local network is running"))
        const plugin = createVitePlugin(mockOptions)
        const { config, middleware } = await serveWithEnvironment(plugin)

        // Vite builds the proxy from a copy of the entry and hands that copy to
        // `configure`. It reads the target from it on every request.
        const apiEntry = config.server.proxy["/api"]
        const proxyOptions = { ...apiEntry }
        apiEntry.configure({}, proxyOptions)
        expect(proxyOptions.target).toBe("http://127.0.0.1:8000")
        expect(await request(middleware)).toBeUndefined()

        // A gateway on another port than the fallback's, so the switch shows.
        answerIcp(
          { test_canister: "bkyz2-fmaaa-aaaaa-qaaaq-cai" },
          { root_key: "fresh-root-key", api_url: "http://127.0.0.1:8080" }
        )

        const cookie = await request(middleware)
        expect(cookie).toContain("ic_root_key%3Dfresh-root-key")
        expect(cookie).toContain(
          "PUBLIC_CANISTER_ID%3Atest_canister%3Dbkyz2-fmaaa-aaaaa-qaaaq-cai"
        )
        expect(proxyOptions.target).toBe("http://127.0.0.1:8080")
        expect(consoleLogSpy).toHaveBeenCalledWith(
          "[ic-reactor] Detected the local IC network: the ic_env cookie now carries its root key and /api goes to http://127.0.0.1:8080."
        )
      })

      // A restart of an inline config runs the config hook again with the
      // same plugin object, for a new server with a proxy of its own.
      it("should move only its own server's /api proxy when a server of the same plugin object detects a network", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {})
        vi.spyOn(console, "log").mockImplementation(() => {})
        answerIcp({}, new Error("no local network is running"))
        const plugin = createVitePlugin(mockOptions)
        const proxyOf = (config: any) => {
          const apiEntry = config.server.proxy["/api"]
          const proxyOptions = { ...apiEntry }
          apiEntry.configure({}, proxyOptions)
          return proxyOptions
        }
        const first = await serveWithEnvironment(plugin)
        const firstProxy = proxyOf(first.config)
        const second = await serveWithEnvironment(plugin)
        const secondProxy = proxyOf(second.config)

        // A page load of the first server finds the network.
        answerIcp(
          { test_canister: "bkyz2-fmaaa-aaaaa-qaaaq-cai" },
          { root_key: "fresh-root-key", api_url: "http://127.0.0.1:8080" }
        )
        await request(first.middleware)
        expect(firstProxy.target).toBe("http://127.0.0.1:8080")
        expect(secondProxy.target).toBe("http://127.0.0.1:8000")
      })

      it("should not run icp for a request that is not a page load", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {})
        answerIcp({})
        const plugin = createVitePlugin(mockOptions)
        const { middleware } = await serveWithEnvironment(plugin)
        const calls = icpCalls()

        const cookie = await request(middleware, MODULE)
        await request(middleware, { method: "POST", accept: "text/html" })

        expect(icpCalls()).toBe(calls)
        // It still carries what the last detection found.
        expect(cookie).toContain("ic_root_key%3Dmock-root-key")
      })

      it("should share one detection between page loads that arrive together", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {})
        answerIcp({})
        const plugin = createVitePlugin(mockOptions)
        const { middleware } = await serveWithEnvironment(plugin)
        const calls = icpCalls()

        await Promise.all([request(middleware), request(middleware)])

        const networkStatusCalls = (spawn as any).mock.calls
          .slice(calls)
          .filter(([, args]: any) => args[0] === "network")
        expect(networkStatusCalls).toHaveLength(1)
      })

      // A command can fail for a moment while `icp deploy` runs. The cookie
      // that already worked must survive that page load.
      it("should keep what it detected when icp fails for a moment", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {})
        const plugin = createVitePlugin({
          canisters: { alpha: {}, beta: {} },
        })
        answerIcp({ alpha: "alpha-id" })
        const { middleware } = await serveWithEnvironment(plugin)

        // The network status fails outright.
        answerIcp({}, new Error("lock held by another icp process"))
        let cookie = await request(middleware)
        expect(cookie).toContain("ic_root_key%3Dmock-root-key")
        expect(cookie).toContain("PUBLIC_CANISTER_ID%3Aalpha%3Dalpha-id")

        // The network answers, but alpha's lookup fails.
        answerIcp({ beta: "beta-id" })
        cookie = await request(middleware)
        expect(cookie).toContain("PUBLIC_CANISTER_ID%3Aalpha%3Dalpha-id")
        expect(cookie).toContain("PUBLIC_CANISTER_ID%3Abeta%3Dbeta-id")
      })

      it("should not name the built-in Internet Identity next to a kept internet_identity id", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {})
        const localhost = {
          root_key: "mock-root-key",
          api_url: "http://localhost:8000",
        }
        answerIcp({ internet_identity: "ii-id" }, localhost)
        const plugin = createVitePlugin(mockOptions)
        const { middleware } = await serveWithEnvironment(plugin)

        // internet_identity's lookup fails this time.
        answerIcp({}, localhost)
        const cookie = await request(middleware)

        expect(cookie).toContain(
          "PUBLIC_CANISTER_ID%3Ainternet_identity%3Dii-id"
        )
        expect(cookie).not.toContain("INTERNET_IDENTITY_PROVIDER")
      })

      it("should drop the ids of a network whose root key changed", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {})
        const plugin = createVitePlugin({
          canisters: { alpha: {}, beta: {} },
        })
        answerIcp({ alpha: "alpha-id" })
        const { middleware } = await serveWithEnvironment(plugin)

        answerIcp(
          { beta: "beta-id" },
          { root_key: "fresh-root-key", port: 4943 }
        )
        const cookie = await request(middleware)

        expect(cookie).toContain("ic_root_key%3Dfresh-root-key")
        expect(cookie).toContain("PUBLIC_CANISTER_ID%3Abeta%3Dbeta-id")
        expect(cookie).not.toContain("alpha-id")
      })
    })

    describe("once every configured canister has an id", () => {
      it("should run no icp command for a page load", async () => {
        answerIcp({ test_canister: "mock-canister-id" })
        const plugin = createVitePlugin(mockOptions)
        const { middleware } = await serveWithEnvironment(plugin)
        const calls = icpCalls()

        for (let load = 0; load < 3; load++) {
          expect(await request(middleware)).toContain(
            "PUBLIC_CANISTER_ID%3Atest_canister%3Dmock-canister-id"
          )
        }

        expect(icpCalls()).toBe(calls)
      })

      it("should stop running icp after a page load resolves the last id", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => {})
        const consoleLogSpy = vi
          .spyOn(console, "log")
          .mockImplementation(() => {})
        answerIcp({})
        const plugin = createVitePlugin(mockOptions)
        const { middleware } = await serveWithEnvironment(plugin)

        answerIcp({ test_canister: "mock-canister-id" })
        await request(middleware)
        const calls = icpCalls()
        await request(middleware)
        await request(middleware)

        expect(icpCalls()).toBe(calls)
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            "Every configured canister has an ID, so page loads no longer run `icp`."
          )
        )
      })

      // A canister id set in the plugin config counts as resolved.
      it("should count a configured canisterId as resolved", async () => {
        answerIcp({})
        const plugin = createVitePlugin({
          ...mockOptions,
          canisters: {
            test_canister: { canisterId: "yq4ns-hyaaa-aaaap-akbna-cai" },
          },
        })
        const { middleware } = await serveWithEnvironment(plugin)
        const calls = icpCalls()

        await request(middleware)

        expect(icpCalls()).toBe(calls)
      })
    })

    // Vite deep-merges what a plugin's config hook returns over the user's
    // config, so the /api entry the plugin returned replaced the user's own.
    // examples/codegen-in-action proxied /api to its own replica and got the
    // plugin's fallback. Here the user's replica is a dfx one on 4943, not the
    // fallback's 8000. These run Vite's real resolveConfig, which does that
    // merge.
    describe("with a Vite config that already proxies /api", () => {
      const userApiProxy = {
        target: "http://127.0.0.1:4943",
        changeOrigin: true,
      }

      const resolveWithUserProxy = (plugin: any) =>
        resolveViteConfig(
          {
            configFile: false,
            logLevel: "silent",
            plugins: [plugin],
            server: { proxy: { "/api": userApiProxy } },
          },
          "serve"
        )

      afterEach(() => {
        vi.unstubAllEnvs()
      })

      it("should keep the user's proxy when icp detection succeeds", async () => {
        const consoleDebugSpy = vi
          .spyOn(console, "debug")
          .mockImplementation(() => {})
        vi.stubEnv("DEBUG", "ic-reactor")
        answerIcp({ test_canister: "mock-canister-id" })

        const plugin = createVitePlugin(mockOptions)
        const resolved = await resolveWithUserProxy(plugin)

        expect(resolved.server.proxy?.["/api"]).toEqual(userApiProxy)
        expect(consoleDebugSpy).toHaveBeenCalledWith(
          expect.stringContaining("already proxies /api")
        )
        // Everything else the plugin injects still arrives.
        mockServer.middlewares.use.mockClear()
        plugin.configureServer(mockServer)
        expect(
          await request(mockServer.middlewares.use.mock.calls[0][0])
        ).toContain("ic_root_key%3Dmock-root-key")
      })

      it.each([
        ["with canisters configured", mockOptions],
        ["in env-only mode", { canisters: {} }],
      ])(
        "should keep the user's proxy when detection fails %s",
        async (_label, options) => {
          vi.spyOn(console, "warn").mockImplementation(() => {})
          mockIcp(() => new Error("project manifest not found"))

          const resolved = await resolveWithUserProxy(createVitePlugin(options))

          expect(resolved.server.proxy?.["/api"]).toEqual(userApiProxy)
        }
      )

      // The warning must not claim a target the plugin does not proxy to.
      it("should leave /api out of the warning", async () => {
        const consoleWarnSpy = vi
          .spyOn(console, "warn")
          .mockImplementation(() => {})
        mockIcp(() => new Error("project manifest not found"))

        await resolveWithUserProxy(createVitePlugin(mockOptions))

        expect(consoleWarnSpy).toHaveBeenCalledOnce()
        expect(consoleWarnSpy.mock.calls[0][0]).not.toContain("/api")
      })
    })

    it("should still proxy /api when the Vite config proxies only other paths", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {})
      mockIcp(() => new Error("project manifest not found"))

      const resolved = await resolveViteConfig(
        {
          configFile: false,
          logLevel: "silent",
          plugins: [createVitePlugin(mockOptions)],
          server: { proxy: { "/assets": "http://127.0.0.1:9000" } },
        },
        "serve"
      )

      expect(resolved.server.proxy).toEqual({
        "/assets": "http://127.0.0.1:9000",
        "/api": {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
          configure: expect.any(Function),
        },
      })
    })

    // A plugin whose config hook runs after this one can proxy /api as well.
    // Vite merges its entry over the plugin's own and keeps the plugin's
    // `configure`, which then took /api back to the detected network.
    it("should leave /api where a later plugin points it", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {})
      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {})
      answerIcp({}, new Error("no local network is running"))
      const plugin = createVitePlugin(mockOptions)
      const laterTarget = "http://127.0.0.1:3000"

      const resolved = await resolveViteConfig(
        {
          configFile: false,
          logLevel: "silent",
          plugins: [
            plugin,
            {
              name: "later-api-proxy",
              config: () => ({
                server: { proxy: { "/api": { target: laterTarget } } },
              }),
            },
          ],
        },
        "serve"
      )
      const apiEntry = resolved.server.proxy?.["/api"] as any
      const proxyOptions = { ...apiEntry }
      apiEntry.configure({}, proxyOptions)
      expect(proxyOptions.target).toBe(laterTarget)

      // The network comes up on another port. The cookie follows it, /api
      // stays with the later plugin, and the terminal does not claim it moved.
      answerIcp(
        { test_canister: "mock-canister-id" },
        { root_key: "mock-root-key", api_url: "http://127.0.0.1:8000" }
      )
      mockServer.middlewares.use.mockClear()
      plugin.configureServer(mockServer)
      expect(
        await request(mockServer.middlewares.use.mock.calls[0][0])
      ).toContain("ic_root_key%3Dmock-root-key")

      expect(proxyOptions.target).toBe(laterTarget)
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "[ic-reactor] Detected the local IC network: the ic_env cookie now carries its root key."
      )
    })
  })
})
