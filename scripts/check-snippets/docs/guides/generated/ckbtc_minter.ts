// A hand-trimmed excerpt, for the Reads guide's fences, of the module
// candid-core-cli generates from the ckBTC minter's .did: only
// get_btc_address, with its inline argument record named by hand.
import * as $ from "@candid-core/schema"

/**
 * The owner (the caller when null) and subaccount of the ckBTC account the
 * deposit address is for. Inline in the minter's own interface; named here.
 */
type $GetBtcAddressArgs = {
  owner: $.Principal | null
  subaccount: Uint8Array | null
}
/**
 * The owner (the caller when null) and subaccount of the ckBTC account the
 * deposit address is for. Inline in the minter's own interface; named here.
 */
const $GetBtcAddressArgs: $.Schema<$GetBtcAddressArgs> = $.c.rec(() =>
  $.c.record({ owner: $.c.opt($.c.principal), subaccount: $.c.opt($.c.blob()) })
)
export { $GetBtcAddressArgs as GetBtcAddressArgs }

const $actor: $.Schema<$.Principal> = $.c.rec(() =>
  $.c.service({
    get_btc_address: $.c.func([$GetBtcAddressArgs], [$.c.text], "update"),
  })
)
type $Actor = {
  /**
   * Returns the Bitcoin address to which the owner should send BTC
   * before converting the amount to ckBTC using the [update_balance]
   * endpoint.
   *
   * If the owner is not set, it defaults to the caller's principal.
   * The resolved owner must be a non-anonymous principal.
   */
  get_btc_address: (arg0: $GetBtcAddressArgs) => Promise<string>
}
export { $actor as actor, type $Actor as Actor }
