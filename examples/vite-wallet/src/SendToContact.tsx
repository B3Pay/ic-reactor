// Scenario 8: pay a contact, and refresh what the payment changed.
//
// The contact comes from the backend (the address book); the payment is a
// write to the ledger. Which reads does it change? Only the ledger's: this
// account's balance, the contact's balance (shown below, a read of the same
// method with another argument), and the total supply the fee is burned from.
// So the mutation keeps the client's default, every read of the ledger it
// writes to, for every caller and every argument, and names no other canister.
//
// Listing the backend (`{ invalidates: [ledger, [backend, "contacts"]] }`)
// would be wrong here: no backend state changes when ICP moves, so it would
// only read the address book again for nothing. `invalidates` names another
// canister's reads when a write changes that canister: a backend method that
// paid out through the ledger itself, for one, would list
// `{ invalidates: [backend, [ledger, "icrc1_balance_of"]] }`.
import { useAuth, useClient } from "@ic-reactor/react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useState, type FormEvent } from "react"
import type { Contact } from "./canisters/backend.ts"
import { dedupedBy, Outcome } from "./SendIcp.tsx"
import { showAmount, useToken } from "./token.ts"
import { readTransferForm } from "./transfer.ts"
import { useCanisters } from "./use-canisters.ts"

export function SendToContact({ contact }: { contact: Contact }) {
  const client = useClient()
  const { ledger } = useCanisters()
  const { principal: caller } = useAuth()
  const token = useToken()
  const theirs = useQuery(
    client.queryOptions(ledger, "icrc1_balance_of", {
      owner: contact.owner,
      subaccount: null,
    })
  )
  const pay = useMutation(client.mutationOptions(ledger, "icrc1_transfer"))
  const again = client.resendOf(pay.error, ledger, "icrc1_transfer", {
    dedupedBy,
  })
  const [amount, setAmount] = useState("")
  const [refusal, setRefusal] = useState<string>()

  const onPay = (event: FormEvent) => {
    event.preventDefault()
    if (token === undefined) return
    const read = readTransferForm({ to: contact.owner, amount }, token)
    if (!read.ok) return setRefusal(read.reason)
    setRefusal(undefined)
    if (client.caller() !== caller) return
    pay.mutate(read.arg)
  }

  return (
    <div className="pay" aria-label={`Pay ${contact.name}`} role="group">
      <h3>Pay {contact.name}</h3>
      <p>
        {contact.name}&apos;s balance:{" "}
        <strong data-testid="contact-balance">
          {theirs.data === undefined || token === undefined
            ? "…"
            : showAmount(theirs.data, token)}
        </strong>
      </p>
      <form onSubmit={onPay}>
        <label htmlFor="pay-amount">
          Amount{token ? ` (${token.symbol})` : ""}
        </label>
        <input
          id="pay-amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          autoComplete="off"
          aria-invalid={refusal !== undefined}
        />
        <div className="row">
          <button
            type="submit"
            className="primary"
            disabled={token === undefined || pay.isPending}
          >
            Pay
          </button>
        </div>
        {refusal && (
          <p className="error" role="alert">
            Not sent: {refusal}
          </p>
        )}
      </form>
      {pay.variables && token && (
        <Outcome
          arg={pay.variables}
          token={token}
          isPending={pay.isPending}
          block={pay.data}
          error={pay.error}
          onSendAgain={again && (() => pay.mutate(again.arg))}
        />
      )}
    </div>
  )
}
