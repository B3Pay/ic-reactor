import { ClientManager } from "@ic-reactor/core"
import { HttpAgent } from "@icp-sdk/core/agent"
import { IDL } from "@icp-sdk/core/candid"
import { describe, expect, it, vi } from "vitest"
import { MetadataDisplayReactor } from "../../src/metadata-display-reactor.js"

/**
 * A text field labelled `url` gets a schema that takes only absolute URLs.
 * The field every canister with an HTTP interface has, `http_request`'s
 * `url`, holds the request's path and query, `/metrics` or
 * `/index.html?lang=en`, never an absolute URL, so no request could be sent
 * from a form MetadataDisplayReactor described: its own schema rejected each
 * valid one. The ICP index canister, the cycles ledger and Internet Identity
 * all declare `http_request`.
 */

function createMockClientManager(): ClientManager {
  const agent = HttpAgent.createSync({ host: "https://ic0.app" })
  return {
    agent,
    registerCanisterId: () => {},
    subscribe: () => () => {},
    queryClient: {
      invalidateQueries: () => Promise.resolve(),
      ensureQueryData: () => Promise.resolve(undefined),
      getQueryData: () => undefined,
    },
  } as unknown as ClientManager
}

// The HTTP interface as the ICP index canister declares it.
const CANDID = `
  type HeaderField = record { text; text };
  type HttpRequest = record {
    url : text;
    method : text;
    body : blob;
    headers : vec HeaderField;
  };
  type HttpResponse = record {
    body : blob;
    headers : vec HeaderField;
    status_code : nat16;
  };
  service : {
    http_request : (HttpRequest) -> (HttpResponse) query;
  }
`

const HttpRequest = IDL.Record({
  url: IDL.Text,
  method: IDL.Text,
  body: IDL.Vec(IDL.Nat8),
  headers: IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text)),
})
const HttpResponse = IDL.Record({
  body: IDL.Vec(IDL.Nat8),
  headers: IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text)),
  status_code: IDL.Nat16,
})

async function reactor() {
  const reactor = new MetadataDisplayReactor({
    name: "icp_index",
    canisterId: "qhbym-qaaaa-aaaaa-aaafq-cai",
    clientManager: createMockClientManager(),
    candid: CANDID,
  })
  await reactor.initialize()
  return reactor
}

function urlField(meta: { args: unknown[] }) {
  const request = meta.args[0] as {
    type: string
    fields: Array<{ label: string; schema: import("zod").ZodTypeAny }>
  }
  const url = request.fields.find((field) => field.label === "url")
  if (!url) throw new Error("no url field")
  return url
}

describe("an http_request url field", () => {
  it.each(["/metrics", "/index.html?lang=en", "/"])(
    "accepts the request path %s",
    async (path) => {
      const meta = (await reactor()).getInputMeta("http_request")
      if (!meta) throw new Error("metadata missing")

      expect(urlField(meta).schema.safeParse(path).success).toBe(true)
      expect(
        meta.schema.safeParse([
          { url: path, method: "GET", body: "", headers: [] },
        ]).success
      ).toBe(true)
    }
  )

  it("sends the request its form accepted", async () => {
    const icpIndex = await reactor()
    const args = [
      {
        url: "/metrics",
        method: "GET",
        body: "",
        headers: [["Accept", "text/plain"]],
      },
    ]
    expect(
      icpIndex.getInputMeta("http_request")?.schema.safeParse(args)
    ).toMatchObject({
      success: true,
    })
    const query = vi
      .spyOn(icpIndex as any, "executeQuery")
      .mockResolvedValue(
        IDL.encode(
          [HttpResponse],
          [{ body: new Uint8Array(), headers: [], status_code: 200 }]
        )
      )

    await icpIndex.callMethod({ functionName: "http_request", args })

    const [, bytes] = query.mock.calls[0] as [string, Uint8Array]
    expect(IDL.decode([HttpRequest], bytes)).toEqual([
      {
        url: "/metrics",
        method: "GET",
        body: new Uint8Array(),
        headers: [["Accept", "text/plain"]],
      },
    ])
  })

  it("still takes an absolute URL and refuses text that is neither", async () => {
    const meta = (await reactor()).getInputMeta("http_request")
    if (!meta) throw new Error("metadata missing")
    const url = urlField(meta)

    expect(url.schema.safeParse("https://example.com/a?b=c").success).toBe(true)
    expect(url.schema.safeParse("not a url").success).toBe(false)
    expect(url.schema.safeParse("").success).toBe(false)
  })
})
