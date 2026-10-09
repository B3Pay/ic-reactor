# Changelog

Notable changes to the published `@ic-reactor/*` packages. ic-reactor 4
releases from the `v4` branch in one lane, `@ic-reactor/core`,
`@ic-reactor/react` and `@ic-reactor/vite-plugin` at one version, as
prereleases under npm's `beta` dist-tag until 4.0 GA. The 3.x line released in
three lanes, each with its own version:

- runtime: `@ic-reactor/core`, `@ic-reactor/react`, `@ic-reactor/candid`
- codegen: `@ic-reactor/codegen`, `@ic-reactor/cli`, `@ic-reactor/vite-plugin`
- parser: `@ic-reactor/parser`

The GitHub release of each tag also lists every pull request it contains.
Issue numbers below refer to https://github.com/B3Pay/ic-reactor/issues.

## Unreleased

### @ic-reactor/core

#### Added

- `isReactorError(error, canister, method)` narrows a direct call's error to
  `ReactorError<E>`, where `E` is that method's `Err` arm, so `err` is typed
  after `kind === "canister_err"` without a cast; for a method without an `Err`
  arm, `err` stays `undefined` (#849). The guard checks at run time: every
  error a call rejects with (a direct call, a query function or a mutation
  function built from the canister) carries the canister object it was made
  on, under an internal symbol, and the guard is `true` only for an error of
  that method on that canister object. An error of another method, of another
  canister object (the `certified: true` one, or the same canister of another
  client) or of a `client.func` call is `false`, and a `false` result leaves
  every `kind` possible. The one-argument form is unchanged, including
  point-free use: `errors.filter(isReactorError)` is still typed
  `ReactorError<unknown>[]`, because the one-argument signature is listed last.
  It is an overload of an existing export: core still has 13 names.
- `client.resendOf(error, canister, method, { dedupedBy })` offers to send a
  write again exactly as it was sent, after a failure that left its outcome
  unknown, and only for a method the app says deduplicates (#850). It returns
  `undefined` unless `error` is a write of that method on that canister with
  `mayHaveExecuted: true`, its argument is an object in which `dedupedBy`
  finds a key (`(arg) => arg.created_at_time` for an ICRC-1 transfer; `null`
  or `undefined` offers nothing), and the principal that sent it is the
  caller now: nothing after a sign-out or a sign-in as another account, the
  offer again once the sender signs back in, and on a view pinned to a
  principal (hydration) the live caller decides. It also offers nothing once
  the argument object was changed since it was sent, or once the canister
  object resolves to another canister id than the write went to (a `{ name }`
  the `ic_env` cookie maps elsewhere). The offer's `arg` is the attempt's own
  argument, and goes out only as the same write. `send()` sends the bytes
  the attempt sent, to the canister id it went to (a management call routed
  by the effective canister id it went out with). `mutate(arg)`, on any
  mutation of this client, sends it only to that method and canister id, and
  only while it encodes to those bytes. Each refusal sends nothing: `cancelled`
  (`caller_changed`) once someone else is the caller, `cancelled`
  (`target_changed`) for another method or canister id, and `invalid_args`
  (`arg_changed`) for an argument changed since. Once offered, that object
  stays held to that write, so a new write needs a new argument object. The
  client cannot check that a canister deduplicates: a method without such a
  key has no safe re-send. It is a method of `Client`, not a new export: core
  still has 13 names. Core's size limit is raised to 15 kB (14,957 B
  measured, +508 B for `resendOf`), and the app checks to 90 kB (89,949 B,
  +465 B) and 91.2 kB (91,155 B, +463 B). React's own code is unchanged.

### @ic-reactor/vite-plugin

#### Added

- A canister entry with a `canisterId` has its `didFile` fetched from the live
  canister when the file is not on disk (#852, phase 1). The plugin reads
  `candid:service` from certified state with `HttpAgent.readState`, checked
  against the network's root key, writes it to `didFile`, and generates the
  module from it; the file is committed with the app. A `didFile` on disk
  costs no network request, under `vite build` and `vite dev`, and is fetched
  again only on request: `IC_REACTOR_FETCH=<name>` (names separated by
  commas, or `all`). The new `network` field says where the canister is:
  `"ic"` (mainnet's root key, the default), `"local"` (icp-cli's
  `http://127.0.0.1:8000`, its root key fetched) or `{ host }` (its root key
  fetched only when the host is local, as `createClient` decides). An
  unreachable network, a refused read (private metadata), absent metadata, a
  canister that does not exist, a certificate that does not verify (naming
  the root key it was checked against) and no answer within 30 seconds each
  fail with their own message, naming the canister and what to do next, under
  `failOnError` as generation does. A `didFile` that cannot be written fails
  only the canisters that name it.
  No export is added.
- `@icp-sdk/core` `^6.1.0` is an optional peer, loaded only for a fetch.
  Every app on `@ic-reactor/core` has it already.

### Docs

- Getting started's "Get a canister's .did" leads with the plugin's
  `canisterId`, and keeps the script for an app without Vite. The Vite plugin
  guide has a section on the fetch: when it happens, `network` and its root
  keys, `IC_REACTOR_FETCH`, and its four failures.
- The errors guide shows `isReactorError(error, canister, method)` and what it
  checks; its duplicate-transfer recipe and the writes guide's direct
  transfer read the typed `err` instead of casting it. The consumer guide
  (`llms.txt`) and the skill say to use it after a direct call.

### CI (not published)

- Core's size limit was set to 14.4 kB gzipped, just above its measured 14,347 B,
  where it was 50 kB, as react's 1.28 kB already sits at its size. Two new
  checks measure what an app pays with the peers included, which the
  packages' own checks never see: `{ createClient }` (89,363 B against
  89.5 kB) and `createClient` with `ReactorProvider` and `useClient`, React
  itself left out (90,566 B against 90.7 kB). They run in `pnpm size`, CI's
  "Check package sizes" step, from `scripts/size-app/`. A pull request that
  moves a size states the delta and raises its limit deliberately
  (CONTRIBUTING.md, "Size budget"). Core's config moved from its
  `package.json` to `packages/core/.size-limit.js`, which is not published.
- Core's size limit is raised to 14.5 kB: the guard's canister check adds
  102 B (14,449 B measured). The app checks measure 89,484 B (+121 B) and
  90,692 B (+126 B), still under their limits.

## core, react, vite-plugin 4.0.0-beta.3

Prepared on 2026-10-07. It goes out under npm's `beta` dist-tag, as
`@ic-reactor/core@beta`; `latest` stays 3.x until 4.0 GA. Changes since
4.0.0-beta.2.

An app on beta.2 upgrades by bumping all three packages to `4.0.0-beta.3`. An
app on `network: "local"` against a dfx replica names it instead:
`network: { host: "http://127.0.0.1:4943" }`.

No export is added or removed (core 13, `@ic-reactor/core/testing` 2, react 4,
vite-plugin 2), no peer changed, and a module generated for beta.2 need not be
regenerated. Two things changed, as core's and the Vite plugin's entries
below say:

- The `auth` factory is handed the client's network, so
  `auth: (network) => new AuthClient(network)` signs users in on the network
  the client calls. Code that compiled against beta.2 compiles unchanged,
  unless it calls a function typed `ClientOptions["auth"]` with no argument,
  uses one where a function of no argument is expected, or passes as `auth` a
  factory whose optional first parameter is not the network.
- **BREAKING:** `network: "local"` is icp-cli's local network,
  `http://127.0.0.1:8000`, not dfx's `http://127.0.0.1:4943`. The test
  client's default host (where its fake replica answers) and the Vite
  plugin's fallback `/api` proxy moved with it. `"env"` on a server with
  dfx's `DFX_NETWORK=local` and no `ICP_NETWORK` keeps 4943.

The guide (`llms.txt`) and the skill now say they apply to 4.0.0-beta.3, and
the guide teaches the factory's argument. The four examples pin
`^4.0.0-beta.3`, and the two that sign in (`next-ssr`, `vite-wallet`) pass
the network to `AuthClient`.

It requires the stable candid-core pair, both pinned exactly, as in beta.2:

- `@ic-reactor/core`: peer `@candid-core/schema` at exactly `0.3.0`;
- `@ic-reactor/vite-plugin`: peer `@candid-core/cli` at exactly `0.2.0`.

```sh
npm install --save-exact @candid-core/schema@0.3.0
npm install --save-dev --save-exact @candid-core/cli@0.2.0
```

### @ic-reactor/core

#### Added

- The `auth` factory of `createClient` is called with one argument, the
  client's network, under `@icp-sdk/auth` 10's own option names, so
  `auth: (network) => new AuthClient(network)` signs users in on the network
  the client calls (#790). `() => new AuthClient()` and every other factory
  that takes no argument work as before, which for `AuthClient` means on
  mainnet only, since such a factory ignores the network. No export is added:
  the argument's type is written inline in `ClientOptions`.
  - `network.agentOptions` is the host, root key and `shouldFetchRootKey` of
    the client's own agents, and the client's `fetch` when one was given,
    which `AuthClient` makes its mint and revoke calls with.
  - `network.identityProvider` is, in order: the `ic_env` cookie's
    `INTERNET_IDENTITY_PROVIDER` where the client trusts the cookie, with the
    cookie's `PUBLIC_CANISTER_ID:internet_identity` or
    `rdmx6-jaaaa-aaaaa-aaadq-cai`; for `"local"` or a network object whose
    host is local, icp-cli's built-in Internet Identity,
    `http://id.ai.localhost:<port of the host>/authorize` with
    `rdmx6-jaaaa-aaaaa-aaadq-cai`; and otherwise absent, which `AuthClient`
    reads as mainnet's Internet Identity.
  - A replica that is not mainnet rejects every delegation mainnet's Internet
    Identity mints. Where no provider can be named on a network that does not
    verify against mainnet's root key (a trusted cookie that names an
    `internet_identity` canister but no URL, `"env"` on a local page whose
    cookie names no provider, or a replica with a root key of its own, given
    or fetched), the client warns once, in development, when the factory
    reads `network.identityProvider`, as `new AuthClient(network)` does, that
    sign-in cannot work there, with the line that names a provider:
    `(network) => new AuthClient({ ...network, identityProvider: { authorizeUrl, canisterId } })`.
    A factory that names its own provider, as that line does, or builds an
    auth that is not Internet Identity never sees it, and neither does a
    spread that adds other options and names no provider, such as
    `{ ...network, derivationOrigin }`, which must name one there. `"ic"` and
    `"env"` on a mainnet page never warn, and neither does the test client of
    `@ic-reactor/core/testing`, whose factory ignores the network.

  Code that compiled against 4.0.0-beta.2 and stops compiling: a call of a
  function typed `ClientOptions["auth"]` with no argument, or its use as a
  `() => AuthLike`. Pass it the network, or type the function
  `() => AuthLike`. A factory whose optional first parameter is not the
  network, such as `(x?: string) => ...`, stops compiling too.

#### Changed

- **BREAKING:** `network: "local"` is icp-cli's local network,
  `http://127.0.0.1:8000`, rather than dfx's replica on
  `http://127.0.0.1:4943` (#790). 8000 is icp-cli's default gateway port
  ([`gateway.port`](https://github.com/dfinity/icp-cli/blob/ffcb2235515bc5623e6c98ba0b9d24a303aaac36/docs/reference/configuration.md#L294),
  [the `local` network](https://github.com/dfinity/icp-cli/blob/ffcb2235515bc5623e6c98ba0b9d24a303aaac36/docs/reference/configuration.md#L513),
  [environments](https://github.com/dfinity/icp-cli/blob/ffcb2235515bc5623e6c98ba0b9d24a303aaac36/docs/concepts/environments.md#L73)).
  For a dfx replica, name it: `network: { host: "http://127.0.0.1:4943" }`.
  The same holds for:
  - `"env"` on a server with `ICP_NETWORK=local` and no `ICP_HOST` or
    `IC_HOST`, which now falls back to `http://127.0.0.1:8000`. With dfx's
    `DFX_NETWORK=local` and no `ICP_NETWORK` (which overrides it), the
    fallback stays dfx's `http://127.0.0.1:4943`, since that variable says
    the project runs dfx.
  - The Internet Identity the `auth` factory is handed for `"local"`, which
    is `http://id.ai.localhost:8000/authorize`, the Vite plugin's default.
  - `createTestClient` of `@ic-reactor/core/testing`, whose default host is
    `"local"`'s. With no `network`, outside a page, it now answers at
    `http://127.0.0.1:8000`, and its query keys carry that host as their
    network segment. A test that asserted `http://127.0.0.1:4943` there
    passes `network: { host: "http://127.0.0.1:4943" }` to keep it.

### @ic-reactor/react

#### Documentation

- The README and `ReactorProviderProps`' doc comments build the client with
  `auth: (network) => new AuthClient(network)`. The code is unchanged.

### @ic-reactor/vite-plugin

#### Changed

- **BREAKING:** When detection fails, `/api` goes to icp-cli's local network,
  `http://127.0.0.1:8000`, rather than `http://127.0.0.1:4943` (#790), as
  `"local"` does in core and as the cookie's fallback Internet Identity,
  `http://id.ai.localhost:8000/authorize`, already did. A project on a dfx
  replica proxies `/api` itself (`server.proxy["/api"]`), which the plugin
  leaves in place.

### Docs

- Every `auth` factory in the docs, the guide (`llms.txt`) and the READMEs
  is `(network) => new AuthClient(network)`. The Auth guide's 25-line local
  Internet Identity setup is that one line, with the rules above and the
  override for a project that deploys its own `internet_identity`.
- Getting started says where `icrc1.did` comes from, runs the first read
  with `npx tsx`, says to change the default `App` import of Vite's
  template, builds the transfer's argument in place, says to commit the
  `.did` and the generated module (Vite's `react-ts` template type-checks
  before the plugin generates), and names `injectEnvironment: false` for an
  app that only talks to mainnet. A new section, "Get a canister's .did",
  adds a script that saves a live canister's `.did` from certified state,
  with the `icp canister metadata` command that does the same.

### Examples (not published)

- The four examples pin `^4.0.0-beta.3`. The two that sign in pass the
  network to `AuthClient`: `next-ssr`'s provider and `vite-wallet`'s client
  build it with
  `(network) => new AuthClient(network)`. `vite-wallet`'s hand-built local
  Internet Identity (`src/auth/internet-identity.ts` and its test) is gone: on
  a local page the client hands its factory the cookie's provider and the
  local network, and on a deployed page no provider, which `AuthClient` reads
  as mainnet's. Its `isLocalPage` tests, which decide where the dev account is
  offered, moved to `src/auth/local-page.test.ts`. These edits waited for this
  release because each example installs the published packages, which carry
  the factory's argument from 4.0.0-beta.3 on.
- `node-agent-tool`'s network comment says `local` is icp-cli's
  `http://127.0.0.1:8000`.

## core, react, vite-plugin 4.0.0-beta.2

Prepared on 2026-10-06. It goes out under npm's `beta` dist-tag, as
`@ic-reactor/core@beta`; `latest` stays 3.x until 4.0 GA. Changes since
4.0.0-beta.1.

An app on beta.1 upgrades by bumping all three packages to `4.0.0-beta.2`, and
the candid-core pair to its stable releases, both exact:

```sh
npm install --save-exact @candid-core/schema@0.3.0
npm install --save-dev --save-exact @candid-core/cli@0.2.0
```

No export is added or removed (core 13, `@ic-reactor/core/testing` 2, react 4,
vite-plugin 2), and a module generated for beta.1 need not be regenerated.
Code that compiled against beta.1 compiles unchanged, unless it does one of
the four things core's Changed entry on `queryOptions` lists, or switches
exhaustively over candid-core's `ContractIssueCode`. What is new is
one error code a missing canister now carries, an aimed form of the test
client's `refuseNext`, and read options that TanStack Query's suspense hooks
take without a cast.

The 4 docs are at https://ic-reactor.b3pay.net/v4/: getting started, guides to
the client, reads, writes, errors, auth, SSR, testing, values and the Vite
plugin, a page per package, and "Migrating from 3.x" with the table of every
removed 3.x name and what replaces it (#789). Each package's `homepage` now
points at its page there.

### @ic-reactor/core

#### Added

- `ReactorError.code` is `"canister_not_found"` when the IC answers that the
  canister a call was routed to does not exist (#821), on a read or a write.
  The IC says it in two ways, and both get the code: a boundary node's HTTP
  400 whose body's error line is `canister_not_found`, for a canister id
  outside every subnet's range, and a replica's reject code 3 with the IC
  error code `IC0301`, for an id inside a subnet's range that holds no
  canister. Mainnet answers both ways, and the fake replica of
  `@ic-reactor/core/testing` answers the second. `kind` and `mayHaveExecuted`
  are unchanged from the classification table. Any other HTTP 400 and any
  other reject still has no `code`.
- `refuseNext(status, { method?, canister?, times? })` on the object
  `createTestClient()` returns (`@ic-reactor/core/testing`): a refusal aimed
  at the queries and calls that name `method` and are addressed to
  `canister`, each when it is given, so a test can throttle `icrc1_transfer`
  while the reads around it are answered (#822). A query and a replicated
  call of the same method both match; `canister` is the canister a request
  names, and need not be mocked; `times` (default 1) counts matching
  requests, each send of a call the client re-sends included. The status and
  `read_state` requests an agent makes on its own never match. A request that
  several refusals match is refused by the one armed first. An option it does
  not have, an empty `method` or a `canister` that is not a canister id
  throws a `TypeError`. `refuseNext(status, times?)` is unchanged: it refuses
  the next `times` queries or calls, whatever they are for. No export is
  added.

#### Changed

- `client.queryOptions(...)` built from variables that cannot be `skipToken`
  (a method without arguments called without them or with `undefined`, or
  variables of a type `skipToken` is not assignable to) returns options whose
  `queryFn` type excludes `SkipToken`, so TanStack Query's `useSuspenseQuery`
  and `useSuspenseQueries` take them without a cast (#828). Variables typed
  `V | SkipToken`, or `skipToken` itself, keep `SkipToken` in `queryFn`'s
  type, and the suspense hooks still refuse them. `queryOptions` has a second
  signature for that case, and `CanisterQueryOptions` a third type parameter
  that defaults to today's type. The options' `retry` also takes an error
  typed `unknown`, as `useQueries` and `useSuspenseQueries` type it, so those
  hooks take the options too; `useQuery` and a `QueryObserver` still type the
  query's error `ReactorError<E>`. Variables of a type `skipToken` is
  assignable to cannot be told from it: the options of such a method keep
  `SkipToken` whatever the variables: read it with `useQuery`, or cast its
  `queryFn` for a suspense read. Of what `candid-core-cli gen` writes, that is only a method whose one
  argument is Candid `reserved` (typed `unknown`): it writes `record {}` as
  `Record<string, never>`, which a suspense read takes. A type written by
  hand that `skipToken` fits, such as `{}`, is another. Types only: nothing
  changes at run time, and no export is added. Code that compiled against
  4.0.0-beta.1 and stops compiling:
  - `queryFn === skipToken` on options built from variables that cannot be
    `skipToken` is now TS2367 ("no overlap"). Such a check was always false,
    so remove it.
  - A function typed `Client["queryOptions"]` (one function cannot satisfy
    both signatures), and a call that spreads
    `Parameters<Client["queryOptions"]>` back into `client.queryOptions`
    (`Parameters` takes the last signature only). Call `client.queryOptions`
    with the canister and method, and spread its result to add options:
    `{ ...options, staleTime: 1 }`. `ReturnType<Client["queryOptions"]>`
    still compiles.
  - A `retry` written into the options' type with its error parameter
    annotated, such as `retry: (n: number, e: ReactorError<E>) => ...` in a
    value typed by the options: the options' `retry` must now also take an
    error typed `unknown`. Annotate it `unknown`, or leave the parameter to
    the context. Passing such a `retry` to `useQuery({ ...options, retry })`
    still compiles.
  - A variable inferred from the options of a read that cannot be skipped,
    given the options of one that can: `let o = client.queryOptions(c, m, v)`
    then `o = client.queryOptions(c, m, skipToken)` is now TS2322, and so is
    the same through a `useState` setter, a `push` onto an inferred array or
    a parameter typed `typeof o`. The two options are different types now.
    Build both in one expression,
    `ready ? client.queryOptions(c, m, v) : client.queryOptions(c, m, skipToken)`,
    whose union `useQuery` takes, or type the variables `V | SkipToken` so
    that both reads give the options that keep `SkipToken`.

  Wrong variables or an unknown method name are now reported as TS2769 ("No
  overload matches this call", listing both signatures), where they were
  TS2345.

- Peer dependency: `@candid-core/schema` at exactly `0.3.0`, the stable
  release of the 0.3 line, where beta.1 pinned `0.3.0-beta.1`. The other peers
  are unchanged. Migration: `npm install --save-exact @candid-core/schema@0.3.0`,
  with the plugin's `@candid-core/cli@0.2.0` below. What an app meets, from
  candid-core's [0.3.0 release notes](https://github.com/b3hr4d/candid-core/blob/acabe0fcfbd8019d14e2c2550c5e6cd872a3529a/.github/release-notes/npm/schema/0.3.0.md):
  - A `rec` hop is no longer charged against the decode limits, so the
    client's `maxDepth` (default 256) counts a reply's Candid nesting alone. A
    recursive reply, such as an ICRC-3 block's `Value`, may nest deeper at the
    same `maxDepth` than before; through a `schemaFromContract()` actor, about
    128 levels used to reach the default, and now 256 do.
  - Replies refused that were accepted, only at a limit: the `null` a reply
    gets for a field its message omits (`opt`, `null` or `reserved`) is now
    charged one depth level, at the field's own level, and one element. So
    such a field at exactly the client's `maxDepth` rejects `invalid_reply`
    with a `value_depth` issue, and a large reply whose records omit such
    fields can pass the decoder's 1,000,000-element bound, which the client
    does not change: 500,000 records that each omit one field now cost
    1,000,001 elements and reject `invalid_reply` with a `value_elements`
    issue. A test client checks its mocks' replies at its `maxDepth` too,
    where a tag-only variant (`{ tag }`) at exactly `maxDepth` is now
    refused. At the default `maxDepth`, only a reply 256 levels deep reaches
    the depth refusals.
  - `schemaFromContract()` refuses a Contract document with a key the format
    does not define, a type node nothing reaches, or type nodes and no root,
    as candid-core's own loader does. Every document `candid-core compile`
    writes still loads. Its `ContractIssueCode` gains `unknown_key`,
    `orphan_type_node` and `rootless_type_arena`.

#### Documentation

- The guide (`llms.txt`) said the `invalidates` option of
  `client.mutationOptions()` names other reads. The list replaces the
  default (every read of the canister written to): it now says so, and to
  name the written canister too if its reads change (#829). The code is
  unchanged.

### @ic-reactor/react

#### Documentation

- The README, `llms.txt` and `useClient()`'s doc comment told an app to
  ignore kind `"cancelled"` (code `"caller_changed"`) in a `QueryCache`
  `onError`, which no app can set: the client owns its `QueryClient` and
  takes no `QueryCache`. They now name the route an app has, a listener of
  `client.queryClient.getQueryCache().subscribe()`, whose `"updated"` event
  with `action.type` `"error"` carries the cancellation (#829). The code is
  unchanged.

### @ic-reactor/vite-plugin

CI now runs its typecheck and tests at the floor of each Vite major its `vite`
peer range accepts, 4.2.0, 5.0.0, 6.0.0, 7.0.0 and 8.0.0, where before it ran
on the newest Vite only (#823). The range is unchanged.

#### Changed

- Peer dependency: `@candid-core/cli` at exactly `0.2.0`, the stable generator
  that pairs with `@candid-core/schema` `0.3.0`, where beta.1 pinned
  `0.2.0-beta.1`. The plugin's install hints name it; nothing else in the
  plugin changed. Migration:
  `npm install --save-dev --save-exact @candid-core/cli@0.2.0`. It writes the
  same module as 0.2.0-beta.1 for every `.did` both accept, and refuses two
  that 0.2.0-beta.1 did not: a type on a cycle through `opt` alone
  (`type T = opt T;`, `did_type_check_error`) and a run of more than 256
  consecutive comments (`resource_limit_exceeded`). The plugin reports either
  as that canister's generation failure. See candid-core's
  [0.2.0 release notes](https://github.com/b3hr4d/candid-core/blob/acabe0fcfbd8019d14e2c2550c5e6cd872a3529a/.github/release-notes/npm/cli/0.2.0.md).

### Examples, e2e and evals (not published)

- The four examples pin `^4.0.0-beta.2`, and three use what it adds:
  `node-agent-tool`'s mock ledger throttles exactly `icrc1_transfer` with the
  aimed `refuseNext` instead of counting the reads before it, the
  `icrc-ledger` sandbox's HTTP 429 faults hit only the transfer, and
  `next-ssr`'s balance route answers a missing canister with a 502 that
  carries `code: "canister_not_found"` (#821, #822).
- A new script and workflow run each example the way someone who copies it
  out of the repository does, and as StackBlitz does: a plain `npm install`
  of the `@ic-reactor/*` beta published on npm, then its typecheck, tests,
  build and StackBlitz start command. The release workflow runs it once the
  packages are published (#788). Each example has a `.stackblitzrc`, and
  `jsdom` is pinned to `30.0.1`.
- `vite-wallet`'s and `icrc-ledger`'s transfers carry a memo of each
  transfer's own, kept for its re-send, so two transfers of the same amount
  in the same millisecond are never taken for each other's `Duplicate`; their
  test ledgers deduplicate on the whole argument, memo included (#833, #838).
- The e2e suite is rewritten for 4: twelve cases on an icp-cli 1.2.0 local
  network, over a `hello_actor` module generated by `candid-core-cli gen`
  (#787).
- The examples and the e2e suite pin `@candid-core/schema` `0.3.0` and
  `@candid-core/cli` `0.2.0`. Every module the examples, core's tests and the e2e
  suite generate is byte-identical under 0.2.0.
- The eval harness can build the `v4` condition from the published
  4.0.0-beta.1 tarballs, and the GA eval (Addendum 4 of
  `evals/PREREGISTRATION.md`) ran on the published 4.0.0-beta.1 (#790). GA
  ships on the result of Addendum 4, stated as recorded: rule 1 was not met as
  written, because the leak audit flagged react-wallet/`v4`#14's read of its
  own persisted tool output; all 80 runs were safe, and the pooled bound held
  in both analyses (−0.0897 main, −0.0876 intent-to-treat, against −0.10).

## core, react, vite-plugin 4.0.0-beta.1

The first prerelease of ic-reactor 4 (milestone 1, #790), published under
npm's `beta` dist-tag: install it as `@ic-reactor/core@beta`. `latest` stays
3.x until 4.0 GA. Changes since core and react 3.13.0 and vite-plugin 0.15.1.

ic-reactor 4 is a breaking rewrite, not an upgrade of 3.x. It is a thin layer
over the module `candid-core-cli gen` writes from a `.did` file, plus one
guide, `node_modules/@ic-reactor/core/llms.txt`, shipped in core's tarball.
An app calls canisters through a client from `createClient` and reads and
writes them with TanStack Query's own hooks and the options the client
builds. There are no reactors, hook factories or generated hooks. The three
packages release together, at one version.

3.x stays on `main` (security fixes only until 4.0 GA) and is documented at
https://ic-reactor.b3pay.net/v3/. Migration: there is no in-place upgrade;
generate each canister's module with `candid-core-cli gen` and port the calls
to the client by the guide. The table of every removed name and what replaces
it comes with the 4 docs (#789).

### @ic-reactor/core

#### Added

- `createClient(options)`: one client per browser tab, or per request on a
  server. It takes a `network` and exactly one caller: `identity` (an
  `Identity`, or `"anonymous"` for a read-only client) or `auth` (a factory
  of an `AuthLike`, such as `() => new AuthClient()` from `@icp-sdk/auth` 10,
  called once and only in a browser). `allowEnvConfig`, `fetch` and
  `maxDepth` (default 256) are optional. The client owns a TanStack
  `QueryClient` (`client.queryClient`) that dehydrates and hydrates `bigint`,
  `Uint8Array` and non-finite floats without loss.
- `network`: `"ic"` (mainnet and its built-in root key), `"local"`
  (`http://127.0.0.1:4943`, root key fetched), `"env"` (the page's network,
  with canisters named `{ name }` through the `ic_env` cookie), or
  `{ host, rootKey?, name?, fetchRootKey? }`. A given `rootKey` is used and
  never fetched; without one, a root key is fetched only from a loopback or
  `localhost` host, unless `fetchRootKey: true` is written out.
- `client.canister<Actor>(actor, { id } | { name })`: a frozen object of plain
  async methods, one per Candid method, typed from the generated `Actor` and
  memoized, so it can be called in render. A method whose result is
  `variant { Ok; Err }` resolves with the `Ok` value and rejects the `Err` as
  kind `canister_err`. `{ id, certified: true }` sends `query` methods through
  the certified path. A call to the management canister (`aaaaa-aa`) takes
  its effective canister id from its arguments.
- `client.queryOptions(canister, method, args | skipToken)`,
  `client.mutationOptions(canister, method, { invalidates? })` and
  `client.queryKey(canister, method?, args?)`, the options and keys for
  TanStack Query. `queryOptions` throws for an update method unless its
  fourth argument is `{ update: "idempotent" }`.
- `client.func<F>(funcSchema, ref)` calls a func reference a reply carried,
  such as an ICRC ledger's archive callback.
- `client.caller()`, `client.authState()`, `client.subscribe(fn)`,
  `client.signIn()`, `client.signOut()` and `client.dispose()`. Every call
  made after `dispose()`, writes included, rejects `cancelled` with code
  `client_disposed` and sends nothing (#818).
- `isReactorError(error)` and the types `ReactorError` and
  `ReactorErrorKind`. Every rejection of a client call is a `ReactorError`
  with one of eight kinds (`invalid_args`, `unauthenticated`,
  `not_delivered`, `outcome_unknown`, `rejected`, `invalid_reply`,
  `canister_err`, `cancelled`) and a `mayHaveExecuted` boolean, which a
  classifier sets from the reject code, the HTTP status and whether the call
  was an update. On the management canister, reject codes 1 to 3 do not prove
  that a write had no effect.
- `parseUnits(text, decimals, { signed? })` and
  `formatUnits(value, decimals, { maxFractionDigits?, minFractionDigits? })`
  convert token amounts exactly, in `bigint`. `parseUnits` throws for text
  that is not a plain decimal, for a negative unless `signed`, and for excess
  fraction digits.
- The types `Client`, `ClientOptions`, `Network`, `AuthLike`, `AuthState`,
  `Canister` and `CanisterTarget`. With the names above, the entry exports 13.
- `@ic-reactor/core/testing` exports `createTestClient` and `TestHandlers`: a
  real client over an in-memory replica that signs and verifies as a replica
  does, passed in through the client's `fetch` (nothing global is stubbed),
  with canisters written as functions of Candid values and a sign-in the test
  controls.

#### Changed

- The client keeps one immutable agent per principal and never replaces an
  agent's identity. A call goes out as the principal current when it was
  made. A read made for one caller that settles after a sign-in, sign-out or
  switch rejects `cancelled` instead of landing in the new caller's cache.
- Query keys name the caller:
  `["ic-reactor", network, caller, canisterId, method, args]`, so one
  principal's cached answer is never served to another. Build keys with
  `client.queryKey`, never by hand.
- An update is sent again only on proof that the canister never received it
  (reject code 2 or HTTP 429), at most twice, inside the call; any other
  failure is final. A read retries at most 3 times, only a `not_delivered`
  failure, and never on a server.
- A mutation is never retried: `mutationOptions` returns `retry: false`. By
  default it invalidates its canister's reads, for every caller, after a
  success, a `canister_err`, or a failure that may have executed.
- A write is refused before it is sent (`unauthenticated`) while nobody is
  signed in, and always on a client built with `identity: "anonymous"`.
- Values are candid-core's: a principal is branded text (`principal()` and
  `isPrincipal()` from `@candid-core/schema`), `opt T` is `T | null`, a
  variant is `{ tag, value }` and every `blob` is a `Uint8Array`.
- Peer dependencies: `@candid-core/schema` at exactly `0.3.0-beta.1` (new:
  install it with `--save-exact`), `@tanstack/query-core` `^5.62.0` (no longer
  optional), `@icp-sdk/core` `^6.1.0`, and `@noble/curves` `^2.2.0`, still
  optional and used only by `./testing`. `zod` is no longer a dependency.
  Migration: `npm install --save-exact @candid-core/schema@0.3.0-beta.1`.

#### Removed

- The 3.x runtime: `ClientManager`, `Reactor`, `DisplayReactor`, the display
  codecs and zod validation, the 3.x errors (`CanisterError`, `CallError`), the key and
  retry helpers (`generateKey`, `reactorRetry`), `formatTokenAmount`,
  `parseTokenAmount` and `isPrincipalText`, and the 3.x test helpers
  (`installFakeReplica`, `createTestCanister`). They stay on the 3.x line.

### @ic-reactor/react

#### Added

- `ReactorProvider({ client: () => Client, children })` calls its factory
  once per mounted tree, renders TanStack Query's `QueryClientProvider` with
  the client's `QueryClient`, and disposes a client its factory created when
  it unmounts (`StrictMode`-safe). A client the app owns, passed as
  `client={() => client}`, is borrowed and never disposed.
- `useClient()` returns the nearest provider's client, and throws outside one.
  Its component renders again whenever the caller's principal changes, and
  the keys it builds are the caller's that the render shows: on a server and
  while a page hydrates, the anonymous caller's. So a tab that holds a
  session hydrates from the keys the server prefetched, with no mismatch and
  nothing read again, then reads the session's keys (#813).
- `useAuth()` returns `{ status, principal, signIn, signOut }`. `status` is
  `"anonymous"`, `"signed-in"`, `"expired"` or `"signed-in-elsewhere"`; it is
  `"anonymous"` on a server and in a hydrating page's first render.
- Known limits of a signed-in reload, described in the README's "Keys follow
  the caller a render shows": a Suspense boundary still hydrating below a
  component that renders with the caller is rendered on the client when that
  component moves to the session (pass such a boundary as `children`), and a
  component that reads with `useSuspenseQuery` needs a Suspense boundary
  above it.
- The type `ReactorProviderProps`. The entry exports these 4 names and never
  re-exports `@ic-reactor/core`.

#### Changed

- `@ic-reactor/core` is a peer dependency at exactly this package's version
  (it was a dependency). The other peers are `@tanstack/react-query`
  `^5.90.2` and `react` `>=18.0.0`; `@icp-sdk/auth`, `@icp-sdk/core`,
  `@noble/curves` and `react-dom` are no longer peers.

#### Removed

- Every 3.x hook and factory: `defineReactor`, `createActorHooks`,
  `createReactorProvider`, `createQuery`, `createMutation`, the suspense and
  infinite variants, `createAuthHooks`, the identity-attribute hooks and the
  re-exported `skipToken`; and the auth classes behind them,
  `AuthenticationManager` and `IdentityAttributesManager`. Sign in with an
  `AuthLike` passed to `createClient` and `useAuth()`. Read and write with TanStack Query's `useQuery`
  and `useMutation` over `client.queryOptions` and `client.mutationOptions`.
- The `react-server` entry and `@ic-reactor/react/testing`.

### @ic-reactor/vite-plugin

The plugin joins the lane of core and react, at their version.

#### Changed

- Generation runs `candid-core-cli gen` from the app's own `@candid-core/cli`,
  in a child process per `.did` file, so a generator failure stops that
  process and not the dev server. It writes candid-core's module (named after
  the `.did` file, exporting `actor` and the type `Actor`) and its
  `.envelope.json` into `outDir`, by default `src/canisters`, and nothing
  else.
- `canisters` is a record keyed by canister name,
  `{ didFile?, outDir?, canisterId? }`, instead of an array of entries.
  `injectEnvironment` and `failOnError` work as before. The first line the
  plugin logs names `node_modules/@ic-reactor/core/llms.txt`. Migration:
  `canisters: [{ name: "ledger", didFile }]` becomes
  `canisters: { ledger: { didFile } }`.
- `@candid-core/cli` is a peer dependency at exactly `0.2.0-beta.1`, the
  generator that pairs with `@candid-core/schema` `0.3.0-beta.1`. The `vite`
  range is unchanged. Migration:
  `npm install --save-dev --save-exact @candid-core/cli@0.2.0-beta.1`.

#### Removed

- Generation through `@ic-reactor/codegen`, which is no longer a dependency:
  the generated reactor and hook files (`index.generated.ts`,
  `index.factories.generated.ts`, `index.ts`) and the options that shaped
  them (the top-level `outDir`, `clientManagerPath` and `target`, and each
  entry's `name`, `mode`, `target` and `factories`).

## core, react, candid 3.13.0

Changes since core, react and candid 3.12.5.

### @ic-reactor/core

#### Added

- `reactor.forCanister(canisterId)` returns a memoized sibling reactor for
  another canister of the same interface. It has the same class, `ClientManager`
  and validators, and its calls and query keys use its own canister. Use it
  instead of `setCanisterId` or one hand-built reactor per canister. A
  subclass's constructor must build on the `canisterId` it is given;
  `forCanister` throws when the new reactor lands on another canister.
- `ServiceOf`, `TransformOf`, `ReactorArgsOf`, `ReactorDataOf` and
  `ReactorErrorOf` read a method's types off `typeof reactor`.
- `formatTokenAmount(value, decimals, options?)` and
  `parseTokenAmount(text, decimals)` convert ledger base units exactly.
  `isPrincipalText(text)` validates typed principal text.
- `clientManager.fetchAcrossIdentitySwitch(fetch)` runs a hand-written
  `queryClient.fetchQuery` / `fetchInfiniteQuery` again when a sign-in or
  sign-out switches the principal while it runs (#647).
- `clientManager.explicitRootKey` reports a root key the app passed as
  `agentOptions.rootKey` (#713).
- `isRetryableUpdateError` and `reactorUpdateRetry` retry an update call only
  after a `SysTransient` rejection, and `Reactor.getQueryRetry()` gives the
  retry a query of a method falls back to (#622).
- `Reactor.fetchQuery(params, options?)` takes a second argument of TanStack
  Query fetch options (`retry`, `retryDelay`, `networkMode`, `meta`, ...); the
  key and query function still come from `params`. The query factories pass
  their config's options through it, so a subclass that overrides `fetchQuery`
  still sees their fetches (#502).
- `fromZodSchema(schema, { async: true })` accepts zod schemas with async
  refinements (#593).
- `createPollingStrategy({ timeoutMs })`, 5 minutes per request by default
  (#563).
- `@ic-reactor/core/testing` exports `installFakeReplica` and
  `createTestCanister`. The fake replica signs certificates and checks request
  signatures, so tests run the real `Reactor` and hooks. `@noble/curves` is a
  new optional peer dependency, used only by this entry.

#### Changed

- `Reactor.invalidateQueries()` returns TanStack Query's `Promise<void>`, which
  resolves once the active matches have refetched. Migration: `await` it, or
  prefix a call you do not wait for with `void`.
- `reactorRetry` no longer retries an HTTP 4xx other than 408 and 429, such as
  an expired delegation's 400 (#646). Migration: none; these errors now show
  after the agent's own attempts instead of about 20 seconds later.
- A query of an update method that sets no `retry` retries only a
  `SysTransient` rejection, within the QueryClient's retry default (#622).
  Migration: call state-changing methods through a mutation.
- `Reactor.fetchQuery()`, and so every query factory's `fetch()`, fetches again
  as the new principal when a sign-in or sign-out cancels it, instead of
  rejecting with TanStack's `CancelledError` (#647). When the first run and
  three runs again are each overtaken by a switch, it rejects with a
  `CallError`. Migration: remove `CancelledError` handling from loaders.
- `ClientManager.updateAgent()` keeps the cache when the new identity has the
  principal already installed, as a renewed delegation or a repeated sign-in
  does. Only entries that failed, or whose fetch in flight then fails, refetch
  (#719). Migration: after installing an identity that changes what canisters
  see under the same principal, such as an `AttributesIdentity`, invalidate the
  affected queries yourself.
- Codespaces (`*.github.dev`) and Gitpod (`*.gitpod.io`) pages without an
  `agentOptions.host` route through their own origin with network `"remote"`
  instead of `https://ic0.app`, and their `ic_env` cookie is no longer trusted
  (#643). Migration: pass `allowEnvConfig: true` to read the cookie on those
  hosts.
- In a development build, `ClientManager` skips query signature verification by
  default only for a local replica or a Codespaces or Gitpod tunnel to one. A
  dev page whose agent points at any other host, such as mainnet's
  `https://icp-api.io`, now verifies signatures, as a production build does,
  and a web worker follows the same default as its page. Migration: none; an
  explicit `verifyQuerySignatures` still wins.
- On a local host, `initialize()` keeps a root key passed as
  `agentOptions.rootKey` instead of replacing it with the replica's (#713).
  Migration: pass the replica's key, or no key.
- The args segment of a query key is no longer `JSON.stringify(args)`.
  `generateKey` sorts plain-object keys and writes `NaN`, `±Infinity` and `-0`
  behind a U+0000 tag. `generateQueryKey` also writes a blob as tagged hex,
  gives a `DisplayReactor` value one form whichever form was passed, and tags an
  argument the reactor would refuse (#515, #761, #762, #765). A query sent
  through `callConfig.agent`, when that is not the manager's own agent, is keyed
  with an `{ agent: n }` segment (#642). Migration: build keys with
  `reactor.generateQueryKey(...)` (or `generateKey`), never by hand or with
  `JSON.stringify`.
- A validator that throws or rejects is reported as a `CallError`
  ("Failed to validate the arguments of <method>") with the thrown value as
  `cause`, from `callMethod`, `callMethodWithValidation` and `validate` alike.
  A thrown `ValidationError` passes through unchanged (#593). Migration: read
  `error.cause` where code caught the raw error.
- `CanisterError.details` is typed as the error value's own `details` field
  (`CanisterErrorDetails<E>`), e.g. `[] | [Array<[string, string]>]` from a
  `Reactor`, instead of `Map<string, string>`, which Candid decoding never
  returns; runtime values are unchanged (#685). `CanisterError` reads an
  `opt text` message of an API-shaped error. `ApiError`'s `message` and
  `details` are type parameters that default to `unknown`, and
  `CanisterError.isApiError()` narrows them to `unknown` (#690). Migration: read
  `details` in the shape the canister returns it, not as a `Map`, and name the
  payload types, e.g. `ApiError<[] | [string], [] | [Array<[string, string]>]>`.
- `createPollingStrategy` keeps its attempt count, clock and timeout per
  request, so one instance can serve a whole reactor, and gives up after
  `timeoutMs` (#563). Migration: `timeoutMs: Infinity` restores polling without
  a limit.
- `DisplayReactor` sends `NaN`, `±Infinity` and `-0` floats back as it read
  them, instead of refusing a non-finite float (#632). Migration: none; text
  from a form must still spell a finite number.
- `DisplayReactor` displays `opt opt T`'s `some(none)` as `null` and none as
  `undefined`, so a cleared value differs from one never set, as Internet
  Identity's and Orbit's config types need (#486). Encoding is unchanged: `null`
  and `undefined` both send none, and `[null]` sends `some(none)`. Migration: to
  tell none from `some(none)`, check `=== undefined` and `=== null`; `== null`
  still covers both.
- `hexToUint8Array`, and so a `DisplayReactor` blob argument, refuses hex with
  an odd number of digits instead of padding it with a leading zero. Padding
  shifted every byte, so a subaccount or memo that lost its last digit was sent
  as different, valid-looking bytes. Migration: pass two hex digits per byte.
- `jsonToString` writes a `Principal` as its text and a `Uint8Array` as hex,
  instead of `{"__principal__": ...}` and an object keyed by index. Migration:
  drop a custom replacer that did this, and update code that parsed the old
  output.

#### Fixed

- Update calls: a v4 response whose certificate has no status for the request
  now falls back to polling. It used to fail with a `CallError` for a call that
  could still commit, which invited a retry that ran a transfer twice (#508). An
  anonymous call submitted before the first sign-in keeps polling as anonymous,
  so a sign-in during its polling no longer reports a committed call as failed.
  `pollingOptions.blsVerify` now also checks synchronous (v4) responses, not
  only polled ones.
- On a local replica with no root key supplied, the agent fetches the replica's
  key before its first request. A call made before `initialize()` finished no
  longer fails certificate verification, including an update call that had
  already run on the replica when it was reported as failed.
- `ClientManager` host detection: every loopback address (`127.0.0.0/8`,
  `[::1]`) counts as local (#512). A host without a scheme, such as
  `127.0.0.1:4943`, is read the way `HttpAgent` reads it instead of as mainnet.
  A web worker routes like the page that started it instead of falling back to
  `https://ic0.app`. Construction no longer throws in React Native or on a page
  with an opaque origin such as `file://` or `about:blank` (#510).
- `ClientManager` resolves `agentOptions` into a copy. A frozen options object
  no longer throws. One options object shared by two managers no longer carries
  the first manager's resolved settings, such as a root key from the `ic_env`
  cookie, into the second (#516).
- `ClientManager` subscriptions: calling the unsubscribe of a callback
  registered twice removes only that registration (#513). A subscriber that
  throws no longer stops later subscribers from being notified. A change made
  from inside a callback is no longer followed by the older value.
- `initializeAgent()` recovers when an agent-state subscriber throws. The failed
  attempt clears `isInitializing` and `isInitialized`, so the next call starts a
  fresh attempt instead of returning the old rejection or staying in error for
  the rest of the session. A subscriber that calls `initializeAgent()` on the
  `initializing` notification now waits for that attempt (#514).
- A sign-in or sign-out sweeps the query cache once instead of once per
  registered canister. With 1,000 canisters the sweep takes 0.7 ms instead of
  166 ms.
- Query keys follow the Candid value a call sends, so one call is no longer
  answered from another's cache entry:
  - records with the same fields in any order share a key, while `NaN`,
    `±Infinity` and `-0` no longer share one (#515);
  - a blob has one key whether it is passed as a `Uint8Array`, a `number[]` or
    hex text, and a 1 MB blob's key segment shrinks from 13.1 MB to 2.1 MB;
  - a `DisplayReactor` map object, bare or wrapped `opt`, or variant with or
    without `_type` is keyed by what it sends (#761, #762), and so is a record
    or variant given as a class instance or with a non-enumerable field (#768);
  - an argument the reactor refuses, such as `undefined` for `null` or a bigint
    for `text`, fails instead of returning a valid call's cached result (#765).
- A query sent through `callConfig.agent` (another identity or network) gets a
  cache entry of its own. It used to share the entry of the same query through
  the manager's agent, so whichever ran first answered both, such as a
  `whoami` for the wrong principal (#642).
- After `setCanisterId`, a retry or refetch of an existing query fetches the
  canister its key names. It used to cache the new canister's answer under the
  old canister's key (#509).
- `invalidateQueries()` without a `functionName` targets `callConfig.canisterId`
  when one is given. With params but no method, it now matches the canister's
  queries instead of none (#511).
- Only a Result variant is unwrapped. A record with an `ok` or `err` field, or
  with its own `_type` field beside one, is returned whole instead of resolving
  to that field or throwing a `CanisterError` on success. `OkResult` and
  `ErrResult` type it the same way (#517).
- `JSON.stringify` of a `CanisterError`, `CallError` or `ValidationError` that
  holds BigInts, such as any ICRC-1 transfer error, no longer throws. Each class
  has a `toJSON` that writes BigInts as decimal strings and hands a replacer the
  error's own values (#518).
- `isCanisterError`, `isCallError` and `isValidationError` recognise errors
  thrown by another copy of `@ic-reactor/core` loaded in the same app, so a
  mutation's `onCanisterError` runs and `reactorRetry` retries their transport
  failures. Such a `ValidationError` or `CanisterError` also keeps its type
  through `callMethod`, `callMethodWithValidation` and `validate` (#593).
- Validation: a validator for a method that takes no arguments now runs when
  `args` is omitted. When `callMethod()` refuses an async validator, it no
  longer leaves an unhandled rejection. `ValidationError.getIssuesForPath` and
  `hasErrorForPath` find whole-argument issues under `""` and accept a numeric
  array index, matching `1` and `"1"` alike (#592).
- Methods typed by a recursive func alias (`type f = func (f) -> (f)`) work.
  `callMethod`, `fetchQuery` and `isQueryMethod` no longer fail on them (#608).
  `DisplayReactor` builds their codecs instead of dropping the codecs of that
  method and every method after it (#557).
- The display types of a type that contains itself through `opt`, `vec`, a tuple
  or a map, such as Motoko's `List`, now resolve. They used to fail with TS2589
  in every hook and call on that method (#566).
- `DisplayReactor` arguments:
  - a one-element `opt` value is no longer mistaken for the `[value]` wrapper,
    so a value the codec decoded encodes back. This fixes the cycles ledger's
    `opt vec record { Account; nat }` with one balance, `opt vec vec T`,
    `opt vec blob` given `[bytes]`, `opt opt vec text`, and a text-keyed map
    passed in wrapper form (#484);
  - a record field or variant arm named like an `Object.prototype` member
    (`constructor`, `toString`, ...) is treated as absent when it is left out,
    even for a value from another realm, instead of sending the inherited
    function. `getVariantValue` and `getVariantKeyValue` no longer return the
    inherited function either (#483);
  - a `Map` given for a `vec record { text; T }` is sent with its entries
    instead of as an empty vector (#767).
- `DisplayReactor` on large recursive values: a recursive type's codec is built
  once instead of for every node, so 1,000 ICRC-3 blocks display in about 16 ms
  instead of 470 ms (#485). Long lists such as a Motoko `List` display and
  encode up to 1,875 elements. They used to fail past about 586 elements and
  return the raw Candid value.
- Under Deno, `reactorRetry` retries nothing, as on any other server and as
  TanStack Query's own default does. Deno can define `window`, so a failed
  call during Deno server rendering was retried three times with backoff.
  `reactorUpdateRetry` and an update method's query retry follow the same
  rule.
- Docs corrected to match the package. `Reactor.fetchQuery()` is cache-first and
  returns a stale or invalidated entry as is (#595). An empty `opt` displays as
  `undefined` (#589). The packages need TypeScript 5.7 or later, which their
  declarations already required (#591).

### @ic-reactor/react

#### Added

- `defineDisplayReactor(options)` takes `defineReactor`'s options and builds a
  `DisplayReactor` (#746).
- `createReactorProvider(factory, options?)` returns
  `{ ReactorProvider, useReactor }`. It builds the reactors once per mounted
  provider, so once per request on a server, and disposes the
  `AuthenticationManager`s built for its value on unmount (#745). When the
  value holds one `QueryClient`, it also renders a `QueryClientProvider` for
  it; `queryClientProvider: false` opts out.
- A `react-server` export condition. React Server Components, server actions
  and route handlers import the core runtime (`Reactor`, `DisplayReactor`,
  `ClientManager`, the token helpers) from `@ic-reactor/react`; hooks and
  factories are missing exports there (#679).
- `skipToken`, re-exported from TanStack Query, in place of args in
  `useActorQuery`, `useActorInfiniteQuery` (`getArgs`) and `createQueryFactory`.
- `invalidateQueries` on `createMutation`, `.useMutation()`,
  `useActorMutation` and `useActorMethod` takes query objects, query factories
  and typed `{ functionName, args? }` descriptors. Query factory functions gain
  `getQueryKey()` and `invalidate()`. New types: `InvalidationTarget`,
  `QueryKeySource`, `QueryDescriptor`, `QueryFactoryFn`, `QueryFactoryMethods`.
- Query objects, those of the infinite factories included, gain `cancel()`,
  `reset()` and `optimisticUpdate(updater)`, which resolves with
  `{ rollback() }`.
- `callConfig` in `createQuery`, `createSuspenseQuery` and their factories.
- `AuthenticationManager.dispose()` releases the auth client the manager built
  (#745).
- Support for `@icp-sdk/auth` v10 alongside v8. The peer range is
  `^8.0.0 || ^10.0.0` (v9 is excluded), so npm installs the set without an
  `overrides` block. `identityProvider` is still a URL. On v10 a custom provider
  also needs `internetIdentityId`, the canister that mints its delegations, or
  `login()` throws an error that names the option. Off mainnet, v10's minting
  agent is given the app's replica host and root key, so local sign-in works.
- Two options that only v10 uses: `maxTimeToIdle` for `login()` and
  `IdentityAttributesManager.request()`, and `disableBrowserActivity` for the
  auth client. v8 drops both with a one-time warning. On v10, `storage`,
  `keyType`, `idleOptions` and `identity` are dropped with a one-time warning,
  and `login({ targets })` warns on every sign-in because v10 ignores `targets`
  and returns a broader delegation.
- `@ic-reactor/react/testing` re-exports `@ic-reactor/core/testing`.
  `@noble/curves` is a new optional peer dependency here too, used only by
  this entry.

#### Changed

- The `@tanstack/react-query` peer is now `^5.90.2` (was `^5.0.0`); older
  releases fail to compile against the package or fail its tests (#475).
  Migration: upgrade `@tanstack/react-query` to 5.90.2 or later.
- Every query and mutation hook (raw, bound and factory-made) mounts its
  reactor's `QueryClient` while it is mounted, as `QueryClientProvider` does,
  and a suspense hook also while it is suspended. Without a provider,
  `refetchOnWindowFocus` and `refetchOnReconnect` now fire, and a query or
  mutation paused while offline resumes when the connection returns (#498).
  Migration: if the app relied on no refetch on focus or reconnect, set
  `refetchOnWindowFocus` / `refetchOnReconnect` to `false` on the query or in
  the QueryClient's defaults.
- `useAuth()` and `useUserPrincipal()` report `isAuthenticating: true` until
  the first session restore settles, in server renders too (#621). Migration:
  check `isAuthenticating` before redirecting on `!isAuthenticated`.
- `createMutation(...).execute()` runs in the QueryClient's MutationCache: the
  cache's global callbacks, `useIsMutating`, the factory's `retry`,
  `networkMode`, `onMutate` and `onSettled`, and the QueryClient's mutation
  defaults now apply to it (#564). Migration: a `mutations.retry` default now
  retries `execute()` too; use `reactorUpdateRetry` for update methods.
- `useActorMethod` awaits `invalidateQueries` before `onSuccess`, and `call()`
  resolves after the invalidated queries have refetched (#564). Migration:
  none; `onSuccess` now reads fresh data.
- `useActorMethod` applies its `retry`, `retryDelay`, `networkMode` and `meta`
  to `call()`, for an update method as for a query method's `call(args)` (#564).
  Migration: replace a numeric `retry` on a hook that calls an update method
  with `reactorUpdateRetry`.
- A query method's `call()` and `refetch()` from `useActorMethod` fetch again
  for the new principal when a sign-in or sign-out lands mid-call, and resolve
  with that answer instead of the previous principal's cached data or
  TanStack's `CancelledError`. When their fetch fails they resolve `undefined`
  (and report the error to `onError`) instead of the entry's last answer.
  Migration: treat an `undefined` result as a failed call.
- A query object's `prefetch()` fetches again for the new principal when a
  sign-in or sign-out overtakes it, so the cache never keeps the previous
  principal's answer. Migration: none.
- On `@icp-sdk/auth` v10, `AuthenticationManager` follows sign-outs and account
  switches made in other tabs and updates the agent (#754). Migration: none;
  expect `useAuth()` to change when another tab signs out.
- `authentication.logout()` on a manager with no client builds one instead of
  throwing "Authentication module is missing". Migration: remove a `catch`
  for that error.

#### Deprecated

- `defineReactor({ display: true })`, its overload and
  `DefineDisplayReactorParameters`. Use `defineDisplayReactor(...)`. They will
  be removed at the next major. Plain `defineReactor` is not deprecated.

#### Fixed

- `useActorMethod`:
  - `call`, `refetch` and `reset` keep one identity for the component's
    lifetime. An effect that lists `call` no longer runs again after every
    render, which could call an update method endlessly. They also run with the
    last committed render's method, args and callbacks (#497);
  - `call(args)` with the hook's own args runs `onSuccess` / `onError` once
    instead of twice. A call that settles in the same millisecond as the
    previous result is still reported (#497);
  - `onSuccess` no longer runs for `placeholderData`, such as `keepPreviousData`
    (#501), or for `initialData` that no call returned (#564);
  - an `undefined` entry of `invalidateQueries` is skipped, as the mutation
    hooks skip it, instead of invalidating every query in the client.
- Hooks and factories:
  - `useActorInfiniteQuery` and `useActorSuspenseInfiniteQuery` apply
    `getKeyArgs` as the factories do. An `initialPageParam` that changes on
    every render, such as `Date.now()`, no longer refetches the first page
    endlessly (#499);
  - infinite queries, both hooks and factories, fetch their pages from the
    canister their key names. Before, a later `setCanisterId` redirected the
    fetch (#558);
  - a query object's `fetch()` and `prefetch()`, and the infinite factories'
    `fetch()`, use the config's `networkMode`, `retry`, `retryDelay` and `meta`,
    as `useQuery()` does (#502);
  - `useActorMutation` keys its mutations like `createMutation` and
    `useActorMethod`, so `useIsMutating({ mutationKey })`, `useMutationState`
    and `setMutationDefaults` now match them (#564).
- Validation helpers: `mapValidationErrors`, `extractValidationErrors` and
  `handleValidationError` keep issues on fields named `constructor`, `toString`
  or `__proto__`. Before, those issues were dropped, and with
  `{ multiple: true }` the call threw. `mapValidationErrors` now also accepts
  any `{ multiple?: boolean }` value, `{}` or `undefined`, and `getFieldError` /
  `getFieldErrors` find an issue about the whole argument under `""` (#592).
- `AuthenticationManager`:
  - several `useAuth()` consumers that mount together share one auth client
    instead of building one each (#479), and the v10 clients a call replaces
    when its options differ are disposed (#729). On v8 an idle period runs
    `idleOptions.onIdle` once instead of once per client built;
  - the session restore runs once per manager instead of once per `useAuth()`,
    so mounting a consumer no longer flips `isAuthenticating`, and a component
    that hides consumers while authenticating no longer loops. A restore reads
    the identity from the client the manager still uses, and a restore of a
    manager disposed before it finished builds no client (#745);
  - when `logout()` fails after the client has already dropped the session, as a
    v10 revoke does while offline, the manager signs out locally: the agent gets
    the anonymous identity and the signed-out state is published. `logout()`
    still rejects with the error (#478);
  - a failed `login()` records its error and clears `isAuthenticating` before
    `onError` runs, so an `onError` that throws no longer leaves
    `isAuthenticating: true` (#480);
  - an `ic_env` cookie that is not valid percent-encoding is ignored. Before, it
    made `new AuthenticationManager()`, and so `useAuth()`, throw `URIError`
    (#482);
  - the unsubscribe that `subscribeAuthState` returns removes only its own
    registration. A subscriber that throws no longer stops later subscribers,
    including `useAuth()`, from hearing the change; the first error is rethrown
    after all of them have run;
  - when the local Internet Identity canister serves no sign-in page, the error
    tells a v10 app to serve an II frontend and set `identityProvider` and
    `internetIdentityId`. Before, it pointed to an II build that only v8 can use
    (#561).
- `useAuth`, `useUserPrincipal` and `useAgentState` render a fixed server
  snapshot, so a component that hydrates after the session restore no longer
  causes a hydration mismatch. Each consumer also subscribes once when it
  mounts, not on every render.
- Lapsed and multi-tab sessions no longer leave an identity on the agent that
  the auth client does not vouch for:
  - a manager built over a caller's `authClient` whose session has lapsed puts
    the anonymous identity on the agent;
  - on v10, a lapsed session is ended in this tab only, without calling the
    client's `signOut()`, which acts on the whole origin and could end or
    revoke a sign-in made in another tab;
  - on v8, a tab whose own delegation has lapsed signs out even after another
    tab signs in again (#755). A signed-out tab no longer reports signed in as
    the anonymous principal once another tab signs in.
- Identity attributes:
  - Internet Identity's attribute message is decoded as the ICRC-3 map it is.
    Emails and names no longer come back with stray length characters, cut short
    at the first non-ASCII character, or read from the wrong key (#477);
  - when an attribute request fails but its sign-in completes, the sign-in is
    kept, and `useIdentityAttributes` shows the error (#481);
  - a sign-out or account switch made while an attribute request is pending is
    no longer undone when the request resolves. If the client's session ended
    meanwhile, for example because another tab signed out, the request signs the
    manager out. `useIdentityAttributes` no longer shows the attributes after
    such a sign-out.

### @ic-reactor/candid

#### Added

- `forCanister(canisterId)` on `CandidReactor`, `CandidDisplayReactor`,
  `MetadataReactor` and `MetadataDisplayReactor`; the sibling shares the
  Candid source and adapter.
- A `defaultArgs` option (`"display"` or `"candid"`) on `ResultFieldVisitor`.

#### Changed

- `MetadataReactor` gives func-record `defaultArgs` in Candid form, so
  `callMethod({ args: defaultArgs })` on a reactor built from the node's
  `funcClass` works (#611). `MetadataDisplayReactor` keeps display defaults.
  Migration: use `MetadataDisplayReactor` where the code expects display
  defaults.
- `CandidFormVisitor` and `FieldVisitor` accept `""` for a `text` field. A text
  field with a format, a number and a func reference's method name are still
  required (#611). Migration: none.
- `isPrincipalId` calls `isPrincipalText`, so it refuses a principal longer
  than 29 bytes and the `{"__principal__": ...}` JSON form. Migration: pass
  principal text.

#### Deprecated

- `CandidAdapter.unsubscribe` is a no-op; remove the call (#644).

#### Fixed

- `registerMethod`, and `callDynamic`, `queryDynamic` and `fetchQueryDynamic`,
  which call it, now accept Candid they used to reject: type declarations that
  do not each start a line, as in the documented indented example (#540); a
  whole service definition written `service: {…}`, with a line break before the
  colon, or named (`service greeter : {…}`) (#545); a quoted name that ends in
  an escaped backslash (#576); and a method name holding a quote, backslash or
  control character, which is now escaped instead of breaking the service or
  naming another method (#635). Rejecting an unclosed quoted name now takes
  milliseconds instead of seconds, and `MetadataReactor.buildForValueType` reads
  a type that ends in a `//` comment.
- The argument forms (`FieldVisitor`, `CandidFormVisitor`) now accept only what
  the call can send. A func reference inside an argument is a
  `[principal, method name]` field (`candidType: "func"`) and a service
  reference is a principal field (`candidType: "service"`); before,
  `initialize()` threw or the schema refused every valid value (#539). A blob
  field takes only hex text with two digits per byte (optional `0x`), integers
  from 0 to 255 or a `Uint8Array`, so odd-length hex is refused instead of being
  sent shifted by one digit (#543). A float field refuses blank text, non-finite
  numbers and a float32 overflow (#542). An `empty` field refuses every value,
  and a variant no longer defaults to an option that holds `empty` (#544). A
  text field labelled as a URL also accepts a request path starting with `/`,
  such as `http_request`'s `url`.
- A service with a method typed by a recursive func alias
  (`type f = func (f) -> (f)`) now works. `CandidDisplayReactor.initialize()` no
  longer fails for the whole service, and a method whose display codec cannot be
  built is skipped with an error naming it. `MetadataReactor` and
  `MetadataDisplayReactor` no longer throw "Cannot read properties of undefined
  (reading 'includes')", and they describe, hydrate and offer candidates for
  that method (#557).
- Names from `Object.prototype`: `getInputMeta` and `getOutputMeta` return
  `undefined` for a name such as `"toString"`, `"constructor"` or `"__proto__"`
  that the service does not declare. A method, record field or variant tag named
  `__proto__` is now kept in the metadata, defaults, schema, result tree and
  hydration. A left-out field named like an inherited member resolves as
  missing, and resolving a variant tag that the type does not have throws
  `Option "<tag>" not found` (#610, #659).
- A result node's `resolve()` accepts values already in display form: an `opt`
  whose display value is an array (`opt vec text` as `["a", "b"]`) and a
  `vec record { text; V }` shown as an object. A null variant arm now resolves
  to `null` instead of `undefined` (#546).
- `buildMethodVariableCandidates` now opens a recursive result, so an ICRC-3
  ledger's `icrc3_get_blocks` offers `.log_length`, `.blocks` and
  `.archived_blocks`. It names a func reference's members by index
  (`$get_callback.0`, `$get_callback.1`), which the value resolves by, instead
  of `.canisterId` and `.methodName`, which resolved to `undefined`.
- `MetadataReactor` and `MetadataDisplayReactor` now use far less memory and
  time: a dropped reactor's service types are freed (about 42 KB each were kept
  before); `registerMethod` describes only the method it adds, and a repeat
  registration, which every `callDynamic`, `queryDynamic`, `fetchQueryDynamic`
  and `callDynamicWithMeta` makes, changes nothing (600 registrations went from
  11.7 s to 148 ms); and resolving a recursive value builds one result node per
  type and label instead of one per value (a 2,000-element Motoko List kept 7.6
  MB).
- Candid reactors no longer leave an identity subscription on their
  `ClientManager` for good, and an assigned `adapter.didjsCanisterId` survives
  identity changes (#644).
- Loading Candid: "Failed to retrieve Candid source by any method" now says why
  each attempt failed (#541). A rejected query from the tmp-hack fetch or the
  didjs compile reports "Query failed (reject code N, error code ICnnnn):
  <message>" instead of "Do not know how to serialize a BigInt". A parse that
  starts while the parser is still loading now waits for it instead of sending
  the Candid to the didjs canister, which failed offline and on a local replica.
  `importCandidDefinition` (used by `CandidReactor` and `CandidDisplayReactor`)
  no longer rewrites a Candid name that contains `export const` or
  `export function`, which sent that field under another hash.

## codegen, cli, vite-plugin 0.15.1

Changes since codegen, cli and vite-plugin 0.14.0. Version 0.15.0 was tagged
but never published: its release job stopped before publishing, because
codegen's tests needed packages that job did not build. 0.15.1 is the first
release with these changes.

### @ic-reactor/codegen

#### Added

- `factories: true` on a canister config (with `target: "react"`) writes a
  managed `index.factories.generated.ts`: `<method>Query` (`createQuery`, or
  `createQueryFactory` when the method takes args) per query method and
  `<method>Mutation` (`createMutation`) per update or oneway method, each call
  marked `/* @__PURE__ */`. Exports `getFactoryExportNames`,
  `generateFactoriesFile` and `FACTORIES_FILE_NAME`.
- `PipelineResult.warnings`, for problems a successful run could not fix, such
  as an edited `index.ts` that does not re-export the factories.
- `findSharedOutDirs` and `sharedOutDirMessage`, moved here from the CLI.

#### Changed

- `index.generated.ts`, and the `index.ts` wrapper that generation creates, are
  formatted with the project's Prettier and config, like the declarations.
  `prettier --check` passes right after generation, and a formatted file is no
  longer rewritten on the next run. Migration: none; commit the reformatted
  `index.generated.ts` that the next run writes.
- The `index.ts` that generation creates once now points agents at the
  `ic-reactor` Agent Skill published from this repository
  (`/plugin install ic-reactor@ic-reactor` in Claude Code after
  `/plugin marketplace add B3Pay/ic-reactor`, or
  `npx skills add B3Pay/ic-reactor --skill ic-reactor`) instead of the
  contributor skill in `B3Pay/ic-reactor-skills`. Migration: none; an existing
  `index.ts` is never rewritten, so edit its comment by hand if you want the
  new pointer.
- A `didFile` inside `<outDir>/declarations` (the generated declarations
  directory) is refused with an error before anything is written. Before, the
  first run deleted a `.did` kept in a folder there, and every later run failed
  with "DID file not found". Migration: move the `.did` out of
  `<outDir>/declarations` and point `didFile` at it;
  `src/declarations/<canister>/<canister>.did` still works.

#### Fixed

- With `mode` set to `CandidReactor`, `CandidDisplayReactor` or
  `MetadataDisplayReactor`, the generated `index.generated.ts` now passes
  `createActorHooks` its type arguments. A service with a recursive type
  (Motoko's `List`) or one as large as Internet Identity's no longer fails `tsc`
  with TS2589. The hooks' types are unchanged (#503).
- A run now leaves alone every generated file whose bytes are unchanged,
  `declarations/` included. `tsc --watch`, bundlers and editors no longer wake
  on a regeneration that changed nothing (#666).
- A `.did` saved with a UTF-8 byte order mark (PowerShell, or "UTF-8 with BOM"
  editors) now generates instead of failing with `Unknown token <U+FEFF>`. The
  `declarations/` copy keeps the file's bytes.

### @ic-reactor/cli

#### Added

- `"factories"` per canister in `ic-reactor.json` and `schema.json`. A value
  that is not a boolean is rejected. `generate` prints codegen's warnings.

#### Fixed

- An `ic-reactor.json` saved with a UTF-8 byte order mark (such as PowerShell's
  `Set-Content -Encoding UTF8` writes) now loads instead of failing every
  command with "not valid JSON" (#665).
- `generate --clean` no longer deletes the output of a configured canister whose
  `outDir` reaches the global `outDir` through a symlink, or differs from it
  only in case on a case-insensitive volume. That output includes the
  hand-written `index.ts` (#505).
- `init -y` with an `--out-dir` that is not directly inside `src/` now writes
  the `clientManagerPath` that reaches `src/clients.ts`, so the first `generate`
  output compiles instead of failing with TS2307 (#559).
- `generate --canister toString` (or `constructor`, `hasOwnProperty`,
  `__proto__`) now reports "Canister <name> not found in config." instead of an
  unrelated error. The `--bindgen-only` help now names the files it writes
  instead of a `.did.d.ts` that is never written (#666).

### @ic-reactor/vite-plugin

#### Added

- `factories` per canister entry. The plugin prints codegen's warnings to the
  terminal without failing the build.

#### Changed

- An entry that shares its output directory with an earlier one (same `name`
  and `outDir`) fails, as it does in the CLI; under `vite build` that fails the
  build (#565). Migration: give each entry its own `outDir`.
- `injectEnvironment` sets the `ic_env` cookie on each response. While `icp`
  reports no network or a configured canister has no id, each page load asks
  `icp` again, so deploying after `vite dev` started needs only a reload
  (#664). The `/api` proxy follows the detected network unless the Vite config
  or another plugin sets its own `/api` proxy. `vite preview` gets the same
  cookie. Migration: none.

#### Fixed

- Under `vite dev`, the plugin now regenerates from the dev server's file
  watcher. A `.did` created after startup now regenerates, and so does one
  deleted and written again by a build tool or `git checkout`. Saves with
  `server.hmr: false` also regenerate now.
- Under `vite build --watch`, saving a `.did` now rebuilds with the new
  bindings, and editing another file no longer starts rebuilds that never end. A
  watch rebuild regenerates only the entries whose `.did` changed, and it
  retries an entry that failed.
- Two entries with the same canister `name` (for example one `DisplayReactor`
  and one `Reactor` output in different `outDir`s) now both regenerate when
  their `.did` is saved. The second entry's failure is still shown to browsers
  that connect later (#504).

## parser 0.6.0

Changes since parser 0.5.0.

### @ic-reactor/parser

#### Added

- The package ships `llms.txt`, a usage guide for coding agents, as the other
  packages do (`node_modules/@ic-reactor/parser/llms.txt`).

#### Changed

- `didToJs` and `didToTs` key a record field or variant tag whose name looks
  like a numeric id (`_0_`) by the hash of its name (`_4735054_`), and
  `parseDid` names it the same way, matching what a canister expects (#631).
  Migration: a hand-written `.did` that spells a Motoko numeric field `_0_`
  must write `0`.
- A Candid type named `_SERVICE`, like a TypeScript type keyword (`string`,
  `number`, `bigint`, ...) or like a type operator (`keyof`, `readonly`,
  `unique`, `infer`) is renamed with `_` appended, e.g. `string_` (#737).
  Migration: import the renamed type.

#### Fixed

- `didToJs` and `didToTs` output now loads and compiles in more cases. A field,
  variant tag or method named `__proto__` is kept, printed as `['__proto__']`
  (#560). U+0000 in a name prints as `\x00` instead of `\0`, which read as an
  octal escape: it failed in strict mode or changed the field's hash. A type
  named `IDL`, `Principal`, `ActorMethod`, `Array` or a typed array no longer
  clashes with the binding's own names. A service whose actor type is named like
  a JavaScript keyword (`type class = service {…}; service : class`) now refers
  to the printed `class_` (#738).
- `parseDid` returns `service: null`, as its type says, instead of `undefined`
  for Candid that declares no service (#506). Code that checks `=== undefined`
  must check `null` instead; `== null` works either way.
- Docs: the README now says `validateIDL` returns `true` or throws the parser's
  error as a string. It never returned `false` as the README had said; use
  `CandidAdapter.validateCandid` for a boolean.
