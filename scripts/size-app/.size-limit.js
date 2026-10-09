// What an app pays for ic-reactor, gzipped, with the peers included.
//
// The checks in packages/core and packages/react measure each package's own
// code only: size-limit adds every `peerDependencies` entry of the package it
// runs in to each check's `ignore`, and an `ignore: []` does not stop it. So a
// change in what core pulls from its peers (`@icp-sdk/core`,
// `@candid-core/schema`, `@noble/curves`, `@tanstack/query-core`) is invisible
// there. This private workspace package declares no peers, so nothing is left
// out here but what a check names in `ignore`. Core resolves its peers from its
// own devDependencies, the versions the lockfile pins.
//
// Both limits are tight on purpose, as core's and react's are. A pull request
// that moves either number states the delta and raises the limit deliberately,
// including a dependency bump that changes a peer's size. `pnpm size` runs these
// with the packages' own checks; run `pnpm build` first.
export default [
  {
    // Measured 89,484 B with the canister check of isReactorError (89,363 B
    // on 4.0.0-beta.3, +121 B): the limit leaves 16 B.
    name: "App: { createClient } from @ic-reactor/core, peers included",
    path: "core.js",
    limit: "89.5 kB",
    gzip: true,
  },
  {
    // Measured 90,692 B with the canister check of isReactorError (90,566 B
    // on 4.0.0-beta.3, +126 B): the limit leaves 8 B. React itself is left
    // out: the app ships it with or without ic-reactor.
    name: "App: createClient, ReactorProvider and useClient, peers included, React left out",
    path: "react.js",
    limit: "90.7 kB",
    gzip: true,
    ignore: ["react", "react/jsx-runtime"],
  },
]
