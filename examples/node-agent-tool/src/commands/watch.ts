// Scenario 7, the cache outside React: `watch <principal>`.
//
// A long-running process can use the client's QueryClient the way a page
// does, without React:
//
// - `client.queryClient.fetchQuery(client.queryOptions(...))` reads through
//   the cache. Options are built by the client (keys too: never by hand), and
//   with `staleTime: Infinity` an answer is served from the cache until it is
//   invalidated.
// - The symbol and the decimals never change, so they are fetched once: every
//   later tick is answered from the cache, with no request.
// - Each tick invalidates the balance alone, with
//   `invalidateQueries({ queryKey: client.queryKey(ledger, method, account) })`,
//   so the next `fetchQuery` asks the ledger again. Only a change is printed.
// - A failed read is printed and the watch goes on: a query changes nothing,
//   so it never "may have executed", and the last balance stays in the cache.
// - Ctrl-C (SIGINT) disposes the client, which cancels what is in flight and
//   clears the cache, and the command exits 0.
import type { Context } from "../context.ts"
import { EXIT_CODES, failureOf } from "../failure.ts"
import { principalArg, subaccountArg } from "../input.ts"
import { ledgerOn } from "../ledgers.ts"
import { amount, rows } from "../output.ts"

export async function watch(
  ctx: Context,
  ownerText: string,
  options: { subaccount: string | undefined; intervalMs: number }
): Promise<number> {
  const { client, out } = ctx
  const account = {
    owner: principalArg(ownerText, "owner"),
    subaccount:
      options.subaccount === undefined
        ? null
        : subaccountArg(options.subaccount, "--subaccount"),
  }
  const ledger = ledgerOn(client, ctx.ledger.id)

  const stopped = new AbortController()
  const stopListening = ctx.onInterrupt(() => {
    stopped.abort()
    client.dispose()
  })

  let last: bigint | undefined
  try {
    out.note(
      `watching ${account.owner} on ${ctx.ledger.name ?? ctx.ledger.id} every ${options.intervalMs} ms; Ctrl-C stops`
    )
    while (!stopped.signal.aborted) {
      try {
        const [symbol, decimals, balance] = await Promise.all([
          client.queryClient.fetchQuery({
            ...client.queryOptions(ledger, "icrc1_symbol"),
            staleTime: Infinity,
          }),
          client.queryClient.fetchQuery({
            ...client.queryOptions(ledger, "icrc1_decimals"),
            staleTime: Infinity,
          }),
          client.queryClient.fetchQuery({
            ...client.queryOptions(ledger, "icrc1_balance_of", account),
            staleTime: Infinity,
          }),
        ])
        if (stopped.signal.aborted) break
        if (balance !== last) {
          const shown = amount(balance, decimals)
          out.result(
            {
              ok: true,
              command: "watch",
              event: last === undefined ? "balance" : "change",
              account,
              balance: shown,
              ...(last === undefined
                ? {}
                : { change: amount(balance - last, decimals) }),
              symbol,
              at: new Date().toISOString(),
            },
            rows([
              [
                last === undefined ? "balance" : "changed",
                last === undefined
                  ? `${shown.tokens} ${symbol}`
                  : `${shown.tokens} ${symbol} (${balance > last ? "+" : ""}${amount(balance - last, decimals).tokens})`,
              ],
            ])
          )
          last = balance
        }
      } catch (error) {
        if (stopped.signal.aborted) break
        const failure = failureOf(error)
        out.failure(
          {
            ok: false,
            command: "watch",
            kind: failure.kind,
            mayHaveExecuted: failure.mayHaveExecuted,
            message: failure.message,
          },
          [`read failed: ${failure.kind}: ${failure.message} (still watching)`]
        )
      }
      await sleep(options.intervalMs, stopped.signal)
      if (stopped.signal.aborted) break
      // The balance alone goes stale; the symbol and decimals stay cached.
      await client.queryClient.invalidateQueries({
        queryKey: client.queryKey(ledger, "icrc1_balance_of", account),
      })
    }
  } finally {
    stopListening()
    client.dispose()
  }
  out.note("stopped")
  return EXIT_CODES.ok
}

/** Waits `ms`, or less if `signal` aborts first. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const timer = setTimeout(done, ms)
    signal.addEventListener("abort", done, { once: true })
    function done() {
      clearTimeout(timer)
      signal.removeEventListener("abort", done)
      resolve()
    }
  })
}
