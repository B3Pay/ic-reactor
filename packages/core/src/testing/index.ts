/**
 * `@ic-reactor/core/testing`: run the code under test against a fake replica
 * instead of a real one, or instead of a hand-built stub of `Reactor`.
 *
 * {@link installFakeReplica} answers an `HttpAgent`'s requests with the
 * canisters {@link createTestCanister} builds, so `ClientManager`, `Reactor`,
 * `DisplayReactor`, their query keys, error unwrapping and the React hooks all
 * run as they do in production.
 *
 * This entry is separate from the main one, which never imports it, so none
 * of it reaches an app bundle. It signs with `@noble/curves`, an optional peer
 * dependency: `@icp-sdk/core` installs it already, and a package manager that
 * does not let this package resolve it needs it as a devDependency.
 *
 * @packageDocumentation
 */
export {
  installFakeReplica,
  type FakeCallContext,
  type FakeCanister,
  type FakeReplica,
  type FakeReplicaOptions,
  type FakeReplicaRequest,
} from "./fake-replica.js"
export {
  createTestCanister,
  type TestCanisterHandler,
  type TestCanisterHandlers,
} from "./test-canister.js"
