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
    // With "env" routing LAN, .local and tunnel pages through their own origin (#941) on top of v4: measured 91,750 B, so the limit moved from 91,640 B to 91.80 kB.
    limit: "91.80 kB",
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
    // With "env" routing LAN, .local and tunnel pages through their own origin (#941) on top of v4: measured 93,058 B, so the limit moved from 92,950 B to 93.11 kB.
    limit: "93.11 kB",
    gzip: true,
    ignore: ["react", "react/jsx-runtime"],
  },
]
