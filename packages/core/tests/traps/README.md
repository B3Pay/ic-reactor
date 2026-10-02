# Runtime traps

One file per mistake a hand-written Internet Computer integration makes, run
end to end through the public surface an app has: `createClient`,
`createTestClient` from `@ic-reactor/core/testing` (a real client over a fake
replica that signs and certifies), TanStack Query's observers, and the generated
ICRC-1 module in `../fixtures/`. They are scenarios, not unit tests of
internals: the unit tests are next to them in `tests/`.

Each file opens with a header that names the mistake and the guarantee the
library gives. Each has at least one entry in `scripts/faults.json`: a textual
fault in `src/` that reintroduces the mistake, which `pnpm verify:faults`
applies to a copy of the package and requires a test of the file to fail under.
A trap with no fault proves nothing; a green build cannot tell a test that
guards a regression from one that never did.

| File                                         | The mistake                                                                              |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `anonymous-write.test.ts`                    | an update sent as the anonymous principal while nobody is signed in                      |
| `update-not-resent.test.ts`                  | an update sent again after a failure that does not say it never ran                      |
| `update-resent-when-never-delivered.test.ts` | the opposite: giving up on an update the replica proved it never took in                 |
| `classification-table.test.ts`               | a failed write reported as one thing that means another (every row a ledger can provoke) |
| `stale-data-across-users.test.ts`            | one user's cached answer shown to the next user of the page                              |
| `update-as-query.test.ts`                    | an update method read through a query that refetches                                     |
| `root-key-off-local.test.ts`                 | a root key fetched from a replica nobody vouches for                                     |
| `unresolved-name.test.ts`                    | a canister id taken from a cookie the page cannot trust                                  |
| `invalidation-after-write.test.ts`           | a screen that keeps showing money that has already moved                                 |
| `err-arm.test.ts`                            | an `Err` reply that resolves as a success                                                |

`ledger.ts` is the ledger they share, and `fetch-spy.ts` a `fetch` that records
what a client asks a replica for. Neither is a test.

Adding a trap: write the file with its header, import only what a consumer can
(the entries of `src/`, the testing entry, TanStack, `@candid-core/schema`, the
fixtures), run the tests that wait out the client's re-send delays side by side
(`describe.concurrent`) so the suite stays a few seconds, and add the fault.
The fault is the natural way somebody would reintroduce the mistake; if no
single edit of `src/` makes the test fail, the test is an invariant guard and
says so in a comment.
