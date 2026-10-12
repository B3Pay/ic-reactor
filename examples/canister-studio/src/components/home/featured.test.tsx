// @vitest-environment node
// The home page's server render with one featured read that never answers:
// the router's deadline must end the response (a bot gets nothing until the
// whole page is ready) and leave that section to the browser.
import { createTestClient } from "@ic-reactor/core/testing"
import { ReactorProvider, useClient } from "@ic-reactor/react"
import { useSuspenseQuery } from "@tanstack/react-query"
import type { ReactElement } from "react"
import { renderToReadableStream } from "react-dom/server"
import { describe, expect, it } from "vitest"
import {
  actor as icrc1Actor,
  type Actor as Ledger,
} from "../../canisters/icrc1.ts"
import { boundServerReads } from "../../router.tsx"
import { SectionBoundary } from "../SectionBoundary.tsx"
import { ledgerReads, startLedgerReads } from "./featured.ts"

const LEDGER = "mxzaz-hqaaa-aaaar-qaada-cai"
const DEADLINE_MS = 100

function Supply(): ReactElement {
  const client = useClient()
  const supply = useSuspenseQuery(ledgerReads(client, LEDGER).totalSupply).data
  return <p>supply {supply.toString()}</p>
}

function Symbol(): ReactElement {
  const client = useClient()
  const symbol = useSuspenseQuery(ledgerReads(client, LEDGER).symbol).data
  return <p>symbol {symbol}</p>
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder()
  let html = ""
  for await (const chunk of stream)
    html += decoder.decode(chunk, { stream: true })
  return html + decoder.decode()
}

describe("a featured read that never answers on the server", () => {
  it("is cancelled at the deadline, once, and its section is left to the browser", async () => {
    const server = createTestClient({ network: "ic", signedIn: false })
    server.mock<Ledger>(icrc1Actor, LEDGER, {
      icrc1_symbol: () => "ckBTC",
      icrc1_decimals: () => 8,
      icrc1_fee: () => 10n,
      icrc1_total_supply: () => new Promise<bigint>(() => undefined),
    })
    const { client } = server
    const stop = boundServerReads(client.queryClient, DEADLINE_MS)
    const errors: unknown[] = []
    try {
      startLedgerReads(client, client.queryClient, LEDGER)
      const stream = await renderToReadableStream(
        <ReactorProvider client={() => client}>
          <SectionBoundary label="Supply" fallback={<p>loading supply</p>}>
            <Supply />
          </SectionBoundary>
          <SectionBoundary label="Symbol" fallback={<p>loading symbol</p>}>
            <Symbol />
          </SectionBoundary>
        </ReactorProvider>,
        { onError: (error) => void errors.push(error) }
      )
      const html = await Promise.race([
        readAll(stream),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("the server render never ended")),
            DEADLINE_MS * 30
          )
        ),
      ])
      // Rendered on the server: the read that answered.
      expect(html).toContain("symbol <!-- -->ckBTC")
      // Left to the browser: React marks the section to render there.
      expect(html).not.toContain("supply 21")
      expect(html).toContain("<!--$!-->")
      expect(errors).toHaveLength(1)
      // Cancelled where it stood, never started again by a re-render.
      const supplyReads = server.requests.filter(
        (r) => r.endpoint === "query" && r.methodName === "icrc1_total_supply"
      )
      expect(supplyReads).toHaveLength(1)
    } finally {
      stop()
      client.dispose()
    }
  })
})
