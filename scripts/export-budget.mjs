/**
 * The export budget of ic-reactor 4: which public names each entry may have,
 * and how many.
 *
 * `check-exports.mjs` compares the built declarations of every entry below
 * with this file, so the surface of a release is a reviewed diff of this file
 * and never a side effect of a refactor. The plan is deliberately small
 * (milestone 1, #790): a thin layer over a `candid-core-cli gen` module, not a
 * second API.
 *
 * To add a public name: add it to the `planned` list of its entry here, in the
 * same pull request as the code. An entry's `cap` is the most names it may
 * ever have, so a name past the cap needs the owner's agreement, not only a
 * line here. React's fifth slot is free on purpose (it was `useCanister`,
 * dropped): filling it means appending a name to `planned`.
 *
 * The entries below are also the list of every importable subpath: a package
 * of `packages/` that publishes may map nothing in its `exports` that has no
 * entry here (`./package.json` aside), and a new publishable package needs its
 * entries before it ships. A subpath nobody budgeted would otherwise export
 * names no gate ever read.
 *
 * Alongside the count, no name may be exported twice. D35: one import path
 * per name across every ic-reactor package, `@candid-core/schema` and
 * TanStack Query. A reader who has seen `principal` or `skipToken` from one
 * package must never find it again from another with a subtly different
 * meaning.
 */

/**
 * The entries. `package` is a directory under the repository root and
 * `subpath` the key of its `exports` map, so the file read is the one a
 * consumer's TypeScript reads. `planned` names that are not exported yet are
 * reported as pending while the package is an `-alpha.` prerelease, and fail
 * from the first beta.
 */
export const ENTRIES = [
  {
    id: "@ic-reactor/core",
    package: "packages/core",
    subpath: ".",
    cap: 13,
    planned: [
      // Runtime.
      "createClient",
      "isReactorError",
      "parseUnits",
      "formatUnits",
      // Types.
      "Client",
      "ClientOptions",
      "Network",
      "AuthLike",
      "AuthState",
      "Canister",
      "ReactorError",
      "ReactorErrorKind",
      "CanisterTarget",
    ],
  },
  {
    id: "@ic-reactor/core/testing",
    package: "packages/core",
    subpath: "./testing",
    cap: 2,
    planned: ["createTestClient", "TestHandlers"],
    /**
     * TRANSITIONAL: names that IR4a (#778) added to this entry and that IR4b
     * (#783) replaces with `createTestClient` and `TestHandlers`. They sit
     * outside the cap while the version is an `-alpha.` prerelease, and
     * `check-exports.mjs` fails if any is still exported once it is a beta.
     * IR4b removes this list together with the names.
     */
    transitional: [
      "createFakeReplica",
      "installFakeReplica",
      "createTestAuth",
      "FakeCallContext",
      "FakeCanister",
      "FakeRejectCode",
      "FakeReplica",
      "FakeReplicaOptions",
      "FakeReplicaRequest",
      "InstalledFakeReplica",
      "TestAuth",
      "TestAuthOptions",
      "TestAuthStatus",
    ],
  },
  {
    id: "@ic-reactor/react",
    package: "packages/react",
    subpath: ".",
    cap: 5,
    planned: [
      "ReactorProvider",
      "useClient",
      "useAuth",
      "ReactorProviderProps",
    ],
  },
  {
    id: "@ic-reactor/vite-plugin",
    package: "packages/vite-plugin",
    subpath: ".",
    cap: 2,
    planned: ["icReactor", "IcReactorPluginOptions"],
  },
]

/**
 * Packages whose exports no ic-reactor entry may repeat (D35). Resolved from
 * `from`, a directory under the repository root, the way that directory's
 * own imports resolve them.
 *
 * `pin` is the exact version whose export list is the reference. The schema
 * is 0.x and pinned exactly through GA (D24), so the list a name is checked
 * against is the one core installs; a different version installed, or declared
 * by any manifest of the repository (the root's and each package's), fails the
 * check instead of quietly comparing against another list. The schema's list
 * is read from `packages/core`, so the reference is literally the copy core
 * resolves.
 */
export const FOREIGN = [
  {
    package: "@candid-core/schema",
    from: "packages/core",
    pin: "0.3.0-beta.1",
    subpaths: [".", "./validate", "./contract", "./codec"],
  },
  {
    package: "@tanstack/query-core",
    from: "packages/core",
    subpaths: ["."],
  },
  {
    // Everything of query-core again, plus the hooks an app imports next to
    // ours; `useClient` or `useAuth` must never shadow one.
    package: "@tanstack/react-query",
    from: "packages/react",
    subpaths: ["."],
  },
]

export const EXPORT_BUDGET = { entries: ENTRIES, foreign: FOREIGN }
