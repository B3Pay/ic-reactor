// Core's own code, gzipped: `dist/index.js` with every peer left out, since
// size-limit adds each `peerDependencies` entry of this package to the check's
// `ignore` (and an `ignore: []` here does not stop it).
//
// The limit is tight on purpose, as react's is: measured 15,170 B with the
// view `useClient()` reads writing only as its principal (#894; 14,957 B
// before that, +213 B, with `client.resendOf()` holding a re-send to the
// bytes, the canister id and the effective canister id the write went out
// with; 14,750 B before that; 14,449 B before resendOf; 14,347 B on
// 4.0.0-beta.3), so it leaves 30 B. A change that
// grows core fails here, and its pull request states the size delta and
// raises this limit deliberately.
//
// What an app pays for core with its peers included is measured by
// `scripts/size-app/`, which declares no peers. Both run in `pnpm size`.
export default [
  {
    name: "Core Library",
    path: "dist/index.js",
    limit: "15.2 kB",
    gzip: true,
  },
]
