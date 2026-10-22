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
    // With timeoutMs (#875) on top of v4: measured 16,269 B, so the limit moved from 15,940 B to 16.32 kB.
    // With strict createClient options (#938) on top of v4: measured 16,608 B, so the limit moved from 16,320 B to 16.66 kB.
    // With TanStack retries kept for app queries (#937) on top of v4: measured 16,669 B, so the limit moved from 16,660 B to 16.72 kB.
    // With a held-back write sent as its caller (#936) on top of v4: measured 17,194 B, so the limit moved from 16,720 B to 17.25 kB.
    // With a view per useClient() caller (#935) on top of v4: measured 17,347 B, so the limit moved from 17,250 B to 17.4 kB.
    // With #939 on top of v4: measured 17,645 B, so the limit moved from 17,400 B to 17.7 kB.
    // With #940 on top of v4: measured 17,818 B, so the limit moved from 17,700 B to 17.87 kB.
    // With #941 on top of v4: measured 17,980 B, so the limit moved from 17,870 B to 18.03 kB.
    // With #942 on top of v4: measured 18,118 B, so the limit moved from 18,030 B to 18.17 kB.
    // With #960 on top of v4: measured 18,281 B, so the limit moved from 18,170 B to 18.33 kB.
    // With #963 on top of v4: measured 18,489 B, so the limit moved from 18,330 B to 18.54 kB.
    limit: "18.54 kB",
    gzip: true,
  },
]
