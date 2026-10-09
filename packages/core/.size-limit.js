// Core's own code, gzipped: `dist/index.js` with every peer left out, since
// size-limit adds each `peerDependencies` entry of this package to the check's
// `ignore` (and an `ignore: []` here does not stop it).
//
// The limit is tight on purpose, as react's is: measured 14,446 B with the
// canister check of `isReactorError(error, canister, method)` (14,347 B on
// 4.0.0-beta.3, +99 B), so it leaves 54 B. A change that grows core fails
// here, and its pull request states the size delta and raises this limit
// deliberately.
//
// What an app pays for core with its peers included is measured by
// `scripts/size-app/`, which declares no peers. Both run in `pnpm size`.
export default [
  {
    name: "Core Library",
    path: "dist/index.js",
    limit: "14.5 kB",
    gzip: true,
  },
]
