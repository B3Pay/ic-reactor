// Core's own code, gzipped: `dist/index.js` with every peer left out, since
// size-limit adds each `peerDependencies` entry of this package to the check's
// `ignore` (and an `ignore: []` here does not stop it).
//
// The limit is tight on purpose, as react's is: measured 15,413 B with each
// mutation run keeping the caller `mutate()` started it as, read by the
// client's `MutationCache` and by `onMutate`, and refusing a run whose
// caller is not known (#893; 14,957 B before that, +456 B, with
// `client.resendOf()` holding a re-send to the bytes, the canister id and
// the effective canister id the write went out with; 14,750 B before that; 14,449 B before resendOf; 14,347 B on
// 4.0.0-beta.3), so it leaves 37 B. A change that
// grows core fails here, and its pull request states the size delta and
// raises this limit deliberately.
//
// What an app pays for core with its peers included is measured by
// `scripts/size-app/`, which declares no peers. Both run in `pnpm size`.
export default [
  {
    name: "Core Library",
    path: "dist/index.js",
    limit: "15.45 kB",
    gzip: true,
  },
]
