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
    // Measured 90,169 B with the builders refusing another copy's skipToken
    // (#873; 89,949 B before that, +220 B; 89,746 B before client.resendOf()
    // was held to the bytes and the canister ids a write went out with;
    // 89,484 B before resendOf; 89,363 B on 4.0.0-beta.3): the limit leaves
    // 31 B.
    name: "App: { createClient } from @ic-reactor/core, peers included",
    path: "core.js",
    // With client.time() (#885) on top of v4: measured 90,472 B, so the limit moved from 90,200 B to 90.53 kB.
    // With expiresAt (#888) on top of v4: measured 90,619 B, so the limit moved from 90,530 B to 90.67 kB.
    // With client.encode() (#887) on top of v4: measured 90,767 B, so the limit moved from 90,670 B to 90.82 kB.
    // With client.canisterId() (#890) on top of v4: measured 90,795 B, so the limit moved from 90,820 B to 90.85 kB.
    // With maxElements (#932) on top of v4: measured 90,897 B, so the limit moved from 90,850 B to 90.95 kB.
    // With timeoutMs (#875) on top of v4: measured 91,291 B, so the limit moved from 90,950 B to 91.34 kB.
    // With strict createClient options (#938) on top of v4: measured 91,519 B, so the limit moved from 91,340 B to 91.57 kB.
    // With TanStack retries kept for app queries (#937) on top of v4: measured 91,589 B, so the limit moved from 91,570 B to 91.64 kB.
    // With a held-back write sent as its caller (#936) on top of v4: measured 92,096 B, so the limit moved from 91,640 B to 92.15 kB.
    // With a view per useClient() caller (#935) on top of v4: measured 92,248 B, so the limit moved from 92,150 B to 92.3 kB.
    // With #939 on top of v4: measured 92,590 B, so the limit moved from 92,300 B to 92.64 kB.
    // With #940 on top of v4: measured 92,761 B, so the limit moved from 92,640 B to 92.82 kB.
    // With #941 on top of v4: measured 92,915 B, so the limit moved from 92,820 B to 92.97 kB.
    // With #942 on top of v4: measured 93,050 B, so the limit moved from 92,970 B to 93.1 kB.
    // With #960 on top of v4: measured 93,213 B, so the limit moved from 93,100 B to 93.27 kB.
    // With #963 on top of v4: measured 93,409 B, so the limit moved from 93,270 B to 93.47 kB.
    // With #961 on top of v4: measured 93,426 B, so the limit moved from 93,470 B to 93.49 kB.
    // With #962 on top of v4: measured 93,497 B, so the limit moved from 93,490 B to 93.57 kB.
    // With #975 on top of v4: measured 93,542 B, so the limit moved from 93,570 B to 93.62 kB.
    // With #973 on top of v4: measured 93,657 B, so the limit moved from 93,620 B to 93.74 kB.
    // With #974 on top of v4: measured 93,757 B, so the limit moved from 93,740 B to 93.84 kB.
    // With #976 on top of v4: measured 93,775 B, so the limit moved from 93,840 B to 93.86 kB.
    // With #949 on top of v4: measured 93,777 B, so the limit moved from 93,860 B to 93.87 kB.
    // With #913 on top of v4: measured 93,924 B, so the limit moved from 93,870 B to 94.07 kB.
    limit: "94.07 kB",
    gzip: true,
  },
  {
    // Measured 91,453 B with the builders and the provider checking for two
    // copies of @tanstack/query-core (#873; 91,155 B before that, +298 B;
    // 90,960 B before client.resendOf() was held to the bytes and the
    // canister ids a write went out with; 90,692 B before resendOf; 90,566 B
    // on 4.0.0-beta.3): the limit leaves 47 B. React itself is left out: the
    // app ships it with or without ic-reactor.
    name: "App: createClient, ReactorProvider and useClient, peers included, React left out",
    path: "react.js",
    // With client.time() (#885) on top of v4: measured 91,763 B, so the limit moved from 91,500 B to 91.82 kB.
    // With expiresAt (#888) on top of v4: measured 91,916 B, so the limit moved from 91,820 B to 91.97 kB.
    // With client.encode() (#887) on top of v4: measured 92,053 B, so the limit moved from 91,970 B to 92.11 kB.
    // With client.canisterId() (#890) on top of v4: measured 92,083 B, so the limit moved from 92,110 B to 92.14 kB.
    // With maxElements (#932) on top of v4: measured 92,162 B, so the limit moved from 92,140 B to 92.22 kB.
    // With timeoutMs (#875) on top of v4: measured 92,561 B, so the limit moved from 92,220 B to 92.61 kB.
    // With strict createClient options (#938) on top of v4: measured 92,830 B, so the limit moved from 92,610 B to 92.88 kB.
    // With TanStack retries kept for app queries (#937) on top of v4: measured 92,899 B, so the limit moved from 92,880 B to 92.95 kB.
    // With a held-back write sent as its caller (#936) on top of v4: measured 93,393 B, so the limit moved from 92,950 B to 93.45 kB.
    // With a view per useClient() caller (#935) on top of v4: measured 93,575 B, so the limit moved from 93,450 B to 93.63 kB.
    // With #939 on top of v4: measured 93,873 B, so the limit moved from 93,630 B to 93.93 kB.
    // With #940 on top of v4: measured 94,043 B, so the limit moved from 93,930 B to 94.1 kB.
    // With #941 on top of v4: measured 94,202 B, so the limit moved from 94,100 B to 94.26 kB.
    // With #942 on top of v4: measured 94,335 B, so the limit moved from 94,260 B to 94.39 kB.
    // With #960 on top of v4: measured 94,506 B, so the limit moved from 94,390 B to 94.56 kB.
    // With #963 on top of v4: measured 94,712 B, so the limit moved from 94,560 B to 94.77 kB.
    // With #961 on top of v4: measured 94,733 B, so the limit moved from 94,770 B to 94.79 kB.
    // With #962 on top of v4: measured 94,818 B, so the limit moved from 94,790 B to 94.88 kB.
    // With #975 on top of v4: measured 94,847 B, so the limit moved from 94,880 B to 94.91 kB.
    // With #972 on top of v4: measured 94,849 B, so the limit moved from 94,910 B to 94.92 kB.
    // With #973 on top of v4: measured 94,952 B, so the limit moved from 94,920 B to 95.03 kB.
    // With #974 on top of v4: measured 95,069 B, so the limit moved from 95,030 B to 95.15 kB.
    // With #976 on top of v4: measured 95,091 B, so the limit moved from 95,150 B to 95.18 kB.
    // With #949 on top of v4: measured 95,092 B, so the limit moved from 95,180 B to 95.19 kB.
    // With #913 on top of v4: measured 95,239 B, so the limit moved from 95,190 B to 95.38 kB.
    limit: "95.38 kB",
    gzip: true,
    ignore: ["react", "react/jsx-runtime"],
  },
]
