# Changelog

Notable changes to the published `@ic-reactor/*` packages. The packages
release in three lanes, each with its own version:

- runtime: `@ic-reactor/core`, `@ic-reactor/react`, `@ic-reactor/candid`
- codegen: `@ic-reactor/codegen`, `@ic-reactor/cli`, `@ic-reactor/vite-plugin`
- parser: `@ic-reactor/parser`

The GitHub release of each tag also lists every pull request it contains.
Issue numbers below refer to https://github.com/B3Pay/ic-reactor/issues.

## Unreleased

This section covers everything merged on `main` since core, react and candid
3.12.5, codegen, cli and vite-plugin 0.14.0, and parser 0.5.0.

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
