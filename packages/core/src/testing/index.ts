/**
 * `@ic-reactor/core/testing`: run the code under test against a fake replica
 * instead of a real one.
 *
 * This entry is separate from the main one, which never imports it, so none
 * of it reaches an app bundle. It signs with `@noble/curves`, an optional peer
 * dependency: `@icp-sdk/core` installs it already, and a package manager that
 * does not let this package resolve it needs it as a devDependency.
 *
 * @packageDocumentation
 */
export {
  createFakeReplica,
  installFakeReplica,
  type FakeCallContext,
  type FakeCanister,
  type FakeRejectCode,
  type FakeReplica,
  type FakeReplicaOptions,
  type FakeReplicaRequest,
  type InstalledFakeReplica,
} from "./fake-replica.js"
export {
  createTestAuth,
  type TestAuth,
  type TestAuthOptions,
  type TestAuthStatus,
} from "./test-auth.js"
