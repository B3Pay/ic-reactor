// An account's balance on each ledger, as the /account page's sections render
// it on the server: the amount through `formatUnits`, the exact base units,
// and a failed ledger's `ReactorError` kind in its own row.
import { tokens } from "@/format"
import type { BalanceRow } from "@/server/read-balances"

export function BalanceTable(props: {
  caption: string
  section: string
  rows: readonly BalanceRow[]
}) {
  return (
    <table className="balances" data-section={props.section}>
      <caption>{props.caption}</caption>
      <thead>
        <tr>
          <th scope="col">Ledger</th>
          <th scope="col">Balance</th>
          <th scope="col">Base units</th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row) => (
          <tr key={row.ledger.id} data-ledger={row.ledger.id}>
            <th scope="row">{row.ledger.label}</th>
            {row.ok ? (
              <>
                <td data-field="balance">
                  {tokens(row.balance, row.decimals, row.symbol)}
                </td>
                <td data-field="base-units">{row.balance.toString()}</td>
              </>
            ) : (
              <td colSpan={2} className="error" data-kind={row.error.kind}>
                {row.error.kind}: {row.error.message}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
