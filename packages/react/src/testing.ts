/**
 * `@ic-reactor/react/testing`: the testing utilities of
 * `@ic-reactor/core/testing`, re-exported for an app that depends on
 * `@ic-reactor/react` alone. The main entry re-exports `@ic-reactor/core` the
 * same way, but a package manager that installs strictly does not let such an
 * app import `@ic-reactor/core/testing` itself.
 *
 * Nothing here imports React, and neither the main entry nor the
 * `react-server` entry imports this one, so none of it reaches an app bundle.
 *
 * @example
 * ```typescript
 * import { createTestCanister, installFakeReplica } from "@ic-reactor/react/testing"
 * ```
 *
 * @packageDocumentation
 */
export * from "@ic-reactor/core/testing"
