// Core's own code, gzipped: `dist/index.js` with every peer left out, since
// size-limit adds each `peerDependencies` entry of this package to the check's
// `ignore` (and an `ignore: []` here does not stop it).
//
// The limit is tight on purpose, as react's is: measured 15,164 B with the
// builders refusing another copy's skipToken (#873; 14,957 B before that,
// +207 B; 14,750 B before resendOf held a re-send to the bytes and canister
// ids it went out with; 14,449 B before resendOf; 14,347 B on
// 4.0.0-beta.3), so it leaves 36 B. A change that
// grows core fails here, and its pull request states the size delta and
// raises this limit deliberately.
//
// What an app pays for core with its peers included is measured by
// `scripts/size-app/`, which declares no peers. Both run in `pnpm size`.
export default [
  {
    name: "Core Library",
    path: "dist/index.js",
    // With client.time() (#885) on top of v4: measured 15,487 B, so the limit moved from 15,200 B to 15.54 kB.
    // With expiresAt (#888) on top of v4: measured 15,646 B, so the limit moved from 15,540 B to 15.7 kB.
    // With client.encode() (#887) on top of v4: measured 15,774 B, so the limit moved from 15,700 B to 15.83 kB.
    // With client.canisterId() (#890) on top of v4: measured 15,809 B, so the limit moved from 15,830 B to 15.86 kB.
    // With maxElements (#932) on top of v4: measured 15,888 B, so the limit moved from 15,860 B to 15.94 kB.
    limit: "15.94 kB",
    gzip: true,
  },
]
