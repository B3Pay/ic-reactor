// STUB (FOUNDATION): the signature is the contract; B3 implements it.

/**
 * The shareable URL of a call: `/canister/<id>/?method=…&args=<hex>&run=1`.
 * Arguments over 16 KiB are left out of the URL.
 */
export function sharedCallUrl(
  canisterId: string,
  method: string,
  bytes: Uint8Array,
  run: boolean
): string {
  void canisterId
  void method
  void bytes
  void run
  throw new Error("not implemented")
}
