// A trimmed excerpt, for the Reads guide's fences, of the module `meant gen`
// writes from the ICRC index-ng's .did (`index-ng.did` in dfinity/ic): only
// get_account_transactions, with the types it takes and answers, generated
// from that part of the .did.
import * as $ from "@meantjs/schema"

export type Account = { owner: $.Principal; subaccount: Uint8Array | null }
const $Account: $.Schema<Account> = $.c.rec(() =>
  $.c.record({ owner: $.c.principal, subaccount: $.c.opt($.c.blob()) })
)
export { $Account as Account }

export type Approve = {
  fee: bigint | null
  from: Account
  memo: Uint8Array | null
  created_at_time: bigint | null
  amount: bigint
  expected_allowance: bigint | null
  expires_at: bigint | null
  spender: Account
}
const $Approve: $.Schema<Approve> = $.c.rec(() =>
  $.c.record({
    fee: $.c.opt($.c.nat),
    from: $Account,
    memo: $.c.opt($.c.blob()),
    created_at_time: $.c.opt($.c.nat64),
    amount: $.c.nat,
    expected_allowance: $.c.opt($.c.nat),
    expires_at: $.c.opt($.c.nat64),
    spender: $Account,
  })
)
export { $Approve as Approve }

export type AuthorizedBurn = {
  from: Account
  mthd: string | null
  caller: $.Principal | null
  created_at_time: bigint | null
  amount: bigint
  reason: string | null
}
const $AuthorizedBurn: $.Schema<AuthorizedBurn> = $.c.rec(() =>
  $.c.record({
    from: $Account,
    mthd: $.c.opt($.c.text),
    caller: $.c.opt($.c.principal),
    created_at_time: $.c.opt($.c.nat64),
    amount: $.c.nat,
    reason: $.c.opt($.c.text),
  })
)
export { $AuthorizedBurn as AuthorizedBurn }

export type AuthorizedMint = {
  to: Account
  mthd: string | null
  caller: $.Principal | null
  created_at_time: bigint | null
  amount: bigint
  reason: string | null
}
const $AuthorizedMint: $.Schema<AuthorizedMint> = $.c.rec(() =>
  $.c.record({
    to: $Account,
    mthd: $.c.opt($.c.text),
    caller: $.c.opt($.c.principal),
    created_at_time: $.c.opt($.c.nat64),
    amount: $.c.nat,
    reason: $.c.opt($.c.text),
  })
)
export { $AuthorizedMint as AuthorizedMint }

export type BlockIndex = bigint
const $BlockIndex: $.Schema<BlockIndex> = $.c.rec(() => $.c.nat)
export { $BlockIndex as BlockIndex }

export type Burn = {
  fee: bigint | null
  from: Account
  memo: Uint8Array | null
  created_at_time: bigint | null
  amount: bigint
  spender: Account | null
}
const $Burn: $.Schema<Burn> = $.c.rec(() =>
  $.c.record({
    fee: $.c.opt($.c.nat),
    from: $Account,
    memo: $.c.opt($.c.blob()),
    created_at_time: $.c.opt($.c.nat64),
    amount: $.c.nat,
    spender: $.c.opt($Account),
  })
)
export { $Burn as Burn }

export type FeeCollector = {
  ts: bigint | null
  mthd: string | null
  fee_collector: Account | null
  caller: $.Principal | null
}
const $FeeCollector: $.Schema<FeeCollector> = $.c.rec(() =>
  $.c.record({
    ts: $.c.opt($.c.nat64),
    mthd: $.c.opt($.c.text),
    fee_collector: $.c.opt($Account),
    caller: $.c.opt($.c.principal),
  })
)
export { $FeeCollector as FeeCollector }

export type GetAccountTransactionsArgs = {
  /** Maximum number of transactions to fetch. */
  max_results: bigint
  /**
   * The txid of the last transaction seen by the client.
   * If None then the results will start from the most recent
   * txid. If set then the results will start from the next
   * most recent txid after start (start won't be included).
   */
  start: bigint | null
  account: Account
}
const $GetAccountTransactionsArgs: $.Schema<GetAccountTransactionsArgs> =
  $.c.rec(() =>
    $.c.record({
      max_results: $.c.nat,
      start: $.c.opt($.c.nat),
      account: $Account,
    })
  )
export { $GetAccountTransactionsArgs as GetAccountTransactionsArgs }

export type GetTransactions = {
  balance: bigint
  transactions: Array<TransactionWithId>
  /** The txid of the oldest transaction the account has */
  oldest_tx_id: bigint | null
}
const $GetTransactions: $.Schema<GetTransactions> = $.c.rec(() =>
  $.c.record({
    balance: $.c.nat,
    transactions: $.c.vec($TransactionWithId),
    oldest_tx_id: $.c.opt($.c.nat),
  })
)
export { $GetTransactions as GetTransactions }

export type GetTransactionsErr = { message: string }
const $GetTransactionsErr: $.Schema<GetTransactionsErr> = $.c.rec(() =>
  $.c.record({ message: $.c.text })
)
export { $GetTransactionsErr as GetTransactionsErr }

export type GetTransactionsResult =
  | { tag: "Ok"; value: GetTransactions }
  | { tag: "Err"; value: GetTransactionsErr }
const $GetTransactionsResult: $.Schema<GetTransactionsResult> = $.c.rec(() =>
  $.c.variant({ Ok: $GetTransactions, Err: $GetTransactionsErr })
)
export { $GetTransactionsResult as GetTransactionsResult }

export type Mint = {
  to: Account
  fee: bigint | null
  memo: Uint8Array | null
  created_at_time: bigint | null
  amount: bigint
}
const $Mint: $.Schema<Mint> = $.c.rec(() =>
  $.c.record({
    to: $Account,
    fee: $.c.opt($.c.nat),
    memo: $.c.opt($.c.blob()),
    created_at_time: $.c.opt($.c.nat64),
    amount: $.c.nat,
  })
)
export { $Mint as Mint }

export type SubAccount = Uint8Array
const $SubAccount: $.Schema<SubAccount> = $.c.rec(() => $.c.blob())
export { $SubAccount as SubAccount }

export type Tokens = bigint
const $Tokens: $.Schema<Tokens> = $.c.rec(() => $.c.nat)
export { $Tokens as Tokens }

export type Transaction = {
  burn: Burn | null
  kind: string
  mint: Mint | null
  approve: Approve | null
  authorized_burn: AuthorizedBurn | null
  authorized_mint: AuthorizedMint | null
  fee_collector: FeeCollector | null
  timestamp: bigint
  transfer: Transfer | null
}
const $Transaction: $.Schema<Transaction> = $.c.rec(() =>
  $.c.record({
    burn: $.c.opt($Burn),
    kind: $.c.text,
    mint: $.c.opt($Mint),
    approve: $.c.opt($Approve),
    authorized_burn: $.c.opt($AuthorizedBurn),
    authorized_mint: $.c.opt($AuthorizedMint),
    fee_collector: $.c.opt($FeeCollector),
    timestamp: $.c.nat64,
    transfer: $.c.opt($Transfer),
  })
)
export { $Transaction as Transaction }

export type TransactionWithId = { id: bigint; transaction: Transaction }
const $TransactionWithId: $.Schema<TransactionWithId> = $.c.rec(() =>
  $.c.record({ id: $.c.nat, transaction: $Transaction })
)
export { $TransactionWithId as TransactionWithId }

export type Transfer = {
  to: Account
  fee: bigint | null
  from: Account
  memo: Uint8Array | null
  created_at_time: bigint | null
  amount: bigint
  spender: Account | null
}
const $Transfer: $.Schema<Transfer> = $.c.rec(() =>
  $.c.record({
    to: $Account,
    fee: $.c.opt($.c.nat),
    from: $Account,
    memo: $.c.opt($.c.blob()),
    created_at_time: $.c.opt($.c.nat64),
    amount: $.c.nat,
    spender: $.c.opt($Account),
  })
)
export { $Transfer as Transfer }

const $actor: $.Schema<$.Principal> = $.c.rec(() =>
  $.c.service({
    get_account_transactions: $.c.func(
      [$GetAccountTransactionsArgs],
      [$GetTransactionsResult],
      "query"
    ),
  })
)
export type Actor = {
  get_account_transactions: ((
    arg0: GetAccountTransactionsArgs
  ) => Promise<GetTransactionsResult>) &
    $.WithMode<"query">
}
export { $actor as actor }
