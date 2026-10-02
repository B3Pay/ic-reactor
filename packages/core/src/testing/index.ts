/**
 * `@ic-reactor/core/testing`: run the code under test against a fake replica
 * instead of a real one.
 *
 * {@link createTestClient} makes a real client over a fake replica that signs
 * and verifies as a replica does, with canisters written as plain functions
 * of domain values ({@link TestHandlers}) and a sign-in a test controls.
 *
 * This entry is separate from the main one, which never imports it, so none
 * of it reaches an app bundle. It signs with `@noble/curves`, an optional peer
 * dependency: `@icp-sdk/core` installs it already, and a package manager that
 * does not let this package resolve it needs it as a devDependency.
 *
 * @packageDocumentation
 */
export { createTestClient, type TestHandlers } from "./test-client.js"
