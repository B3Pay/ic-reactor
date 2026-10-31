// @vitest-environment node
/**
 * The response headers of the docs guide "Deploy to a frontend canister"
 * (docs/src/content/docs/guides/deploy.mdx), as DFINITY's two asset canisters
 * serve them through the local HTTP gateway: the asset canister with the
 * wallet example's `.ic-assets.json5`, and the certified-assets canister of
 * icp-cli's static-site recipe with the guide's `_headers`.
 * `frontends/build.mjs` copied both files, unchanged, into what `icp deploy`
 * uploaded.
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { runInNewContext } from "node:vm"
import { describe, expect, it } from "vitest"
import {
  fences,
  guideFile,
  guideHeaders,
  icAssetsFile,
} from "../frontends/build.mjs"
import { replica } from "./replica"

const guide = readFileSync(guideFile, "utf8")
const icAssets = readFileSync(icAssetsFile, "utf8")

interface AssetRule {
  readonly match: string
  readonly security_policy: string
  readonly headers: Readonly<Record<string, string>>
  readonly allow_raw_access: boolean
}

/** `.ic-assets.json5`, read as the object literal JSON5 is. */
const rules = runInNewContext(`(${icAssets})`) as readonly AssetRule[]

/** The guide's `_headers`, as [name, value] pairs. */
const headersFile: readonly (readonly [string, string])[] = guideHeaders(guide)
  .split("\n")
  .slice(1)
  .filter((line) => line.trim() !== "")
  .map((line) => {
    const colon = line.indexOf(":")
    return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()] as const
  })

/** What the asset canister's "hardened" policy adds, as the guide lists it. */
const hardened = {
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
  "x-xss-protection": "1; mode=block",
}

/** Every header the asset canister sends from the file and its policy, lower-cased. */
const assetHeaders = [
  ...Object.keys(rules[0]?.headers ?? {}),
  ...Object.keys(hardened),
  "permissions-policy",
].map((name) => name.toLowerCase())

/** Lines that are not comments, as the guide and the example compare. */
const code = (text: string): string =>
  text
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")
    .trim()

/** `/` of a frontend canister, through the local gateway. */
const page = (canisterId: string): Promise<Response> =>
  fetch(`${replica.host}/?canisterId=${canisterId}`)

/** The headers a response's `ic-certificateexpression` certifies, lower-cased. */
function certified(response: Response): string[] {
  const expression = response.headers.get("ic-certificateexpression") ?? ""
  const list =
    /certified_response_headers: ResponseHeaderList\{headers: \[([^\]]*)\]/.exec(
      expression
    )
  if (list === null) throw new Error(`no header list in ${expression}`)
  return [...list[1]!.matchAll(/"([^"]+)"/g)].map(([, name]) =>
    name!.toLowerCase()
  )
}

/**
 * The status and the `Location` a canister's `http_request` answers a GET for
 * `url` on `host` with: the query a gateway makes, here with a Host the local
 * gateway does not route.
 */
function httpRequest(
  canister: string,
  url: string,
  host: string
): { status: number; location: string | undefined } {
  const arg = `(record { method = "GET"; url = "${url}"; headers = vec { record { "Host"; "${host}" } }; body = blob ""; certificate_version = opt 2 })`
  const output = execFileSync(
    "icp",
    [
      "canister",
      "call",
      canister,
      "http_request",
      arg,
      "--query",
      "-e",
      "local",
      "--json",
    ],
    {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  )
  const reply = String(JSON.parse(output).response_candid)
  const status = /status_code = (\d+) : nat16/.exec(reply)?.[1]
  if (status === undefined) throw new Error(`no status_code in ${reply}`)
  return {
    status: Number(status),
    location: /"Location";\s*"([^"]+)"/.exec(reply)?.[1],
  }
}

const { assetCanister, staticSite } = replica.frontends

describe("the deploy guide's headers", () => {
  it("are the wallet example's .ic-assets.json5 in the guide and in core's llms.txt, comments aside", () => {
    const shown = fences(guide).filter(
      (fence) =>
        fence.lang === "json5" &&
        fence.body.startsWith("// public/.ic-assets.json5\n")
    )
    expect(shown).toHaveLength(1)
    expect(code(shown[0]!.body)).toBe(code(icAssets))
    const consumerGuide = readFileSync(
      new URL("../../packages/core/llms.txt", import.meta.url),
      "utf8"
    )
    const inLlms = fences(consumerGuide).filter(
      (fence) => fence.lang === "json5"
    )
    expect(inLlms).toHaveLength(1)
    expect(code(inLlms[0]!.body)).toBe(code(icAssets))
    expect(rules).toEqual([
      {
        match: "**/*",
        security_policy: "hardened",
        headers: expect.any(Object),
        allow_raw_access: false,
      },
    ])
  })

  it("are deployed here with the recipes the guide names, as the wallet example's are", () => {
    /** Each asset recipe of an icp.yaml text, with its asset canister version. */
    const recipes = (yaml: string): string[] =>
      [
        ...yaml.matchAll(
          /type: "(@dfinity\/(?:asset-canister|static-site)@[^"]+)"(?:\s+configuration:\s+version: (\S+))?/g
        ),
      ]
        .map(([, type, version]) => (version ? `${type} ${version}` : type!))
        .sort()
    const named = recipes(
      fences(guide)
        .filter((fence) => fence.lang === "yaml")
        .map((fence) => fence.body)
        .join("\n")
    )
    expect(named).toEqual([
      "@dfinity/asset-canister@v2.3.0 0.30.2",
      "@dfinity/static-site@v0.4.2",
    ])
    const file = (relative: string): string =>
      readFileSync(new URL(relative, import.meta.url), "utf8")
    expect(recipes(file("../icp.yaml"))).toEqual(named)
    expect(recipes(file("../../examples/vite-wallet/icp.yaml"))).toEqual([
      named[0],
    ])
  })

  it("are served by the asset canister, with its hardened policy's own, and certified", async () => {
    const response = await page(assetCanister)
    expect(response.status).toBe(200)
    const [rule] = rules
    for (const [name, value] of Object.entries(rule!.headers)) {
      expect(response.headers.get(name), name).toBe(value)
    }
    for (const [name, value] of Object.entries(hardened)) {
      expect(response.headers.get(name), name).toBe(value)
    }
    // A Permissions-Policy that turns off every feature it lists, the
    // clipboard's included.
    const features = (response.headers.get("permissions-policy") ?? "")
      .split(",")
      .map((feature) => feature.trim())
    expect(features).toContain("clipboard-write=()")
    expect(features.filter((feature) => !feature.endsWith("=()"))).toEqual([])
    expect(certified(response)).toEqual(expect.arrayContaining(assetHeaders))
  })

  it("are served by the static-site canister as its _headers lists them, and certified", async () => {
    const response = await page(staticSite)
    expect(response.status).toBe(200)
    for (const [name, value] of headersFile) {
      expect(response.headers.get(name), name).toBe(value)
    }
    expect(certified(response)).toEqual(
      expect.arrayContaining(headersFile.map(([name]) => name.toLowerCase()))
    )
    // It adds none of its own: the one header of the asset canister's policy
    // that _headers leaves out is not sent.
    expect(response.headers.get("x-xss-protection")).toBeNull()
  })

  it("are the same on both canisters, but X-XSS-Protection and the Permissions-Policy", async () => {
    // _headers lists every header the asset canister sends but one.
    expect(headersFile.map(([name]) => name.toLowerCase()).sort()).toEqual(
      assetHeaders.filter((name) => name !== "x-xss-protection").sort()
    )
    const assets = (await page(assetCanister)).headers
    for (const [name, value] of headersFile) {
      if (name !== "Permissions-Policy") {
        expect(assets.get(name), name).toBe(value)
      }
    }
  })

  it("send a visitor of the asset canister's raw host to the checked one, path and query kept", () => {
    expect(
      httpRequest(
        "asset_canister",
        "/send?to=bob",
        `${assetCanister}.raw.icp0.io`
      )
    ).toEqual({
      status: 308,
      location: `https://${assetCanister}.icp0.io/send?to=bob`,
    })
    expect(
      httpRequest("asset_canister", "/", `${assetCanister}.icp0.io`)
    ).toEqual({ status: 200, location: undefined })
  })

  it("leave the static-site canister's raw host served as the other", () => {
    expect(
      httpRequest("static_site", "/", `${staticSite}.raw.icp0.io`)
    ).toEqual({ status: 200, location: undefined })
  })
})
