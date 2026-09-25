# Changelog

Notable changes to the published `@ic-reactor/*` packages. The packages
release in three lanes, each with its own version:

- runtime: `@ic-reactor/core`, `@ic-reactor/react`, `@ic-reactor/candid`
- codegen: `@ic-reactor/codegen`, `@ic-reactor/cli`, `@ic-reactor/vite-plugin`
- parser: `@ic-reactor/parser`

The GitHub release of each tag also lists every pull request it contains.
Issue numbers below refer to https://github.com/B3Pay/ic-reactor/issues.

## Unreleased

Changes on `main` after core, react and candid 3.12.5, codegen, cli and
vite-plugin 0.14.0, and parser 0.5.0. This section covers the work merged after
pull request #766. The fixes merged between those release tags and #766 are
unreleased too, and are not listed here.

### @ic-reactor/core

#### Added

- `reactor.forCanister(canisterId)` returns a memoized sibling reactor for
  another canister of the same interface. It has the same class, `ClientManager`
  and validators, and its calls and query keys use its own canister. Use it
  instead of `setCanisterId` or one hand-built reactor per canister.
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
  rejecting with TanStack's `CancelledError` (#647). After three switches in a
  row it rejects with a `CallError`. Migration: remove `CancelledError`
  handling from loaders.
- `ClientManager.updateAgent()` keeps the cache when the new identity has the
  principal already installed, as a renewed delegation or a repeated sign-in
  does; only failed entries refetch (#719). Migration: after installing an
  identity that changes what canisters see under the same principal, such as
  an `AttributesIdentity`, invalidate the affected queries yourself.
- Codespaces (`*.github.dev`) and Gitpod (`*.gitpod.io`) pages route through
  their own origin with network `"remote"`, and their `ic_env` cookie is no
  longer trusted (#643). Migration: pass `allowEnvConfig: true` to read the
  cookie on those hosts.
- On a local host, `initialize()` keeps a root key passed as
  `agentOptions.rootKey` instead of replacing it with the replica's (#713).
  Migration: pass the replica's key, or no key.
- A query sent through `callConfig.agent`, when that is not the manager's own
  agent, is keyed with an `{ agent: n }` segment (#642). Migration: build keys
  with `reactor.generateQueryKey(...)`, never by hand.
- A validator that throws or rejects is reported as a `CallError`
  ("Failed to validate the arguments of <method>") with the thrown value as
  `cause`, from `callMethod`, `callMethodWithValidation` and `validate` alike.
  A thrown `ValidationError` passes through unchanged (#593). Migration: read
  `error.cause` where code caught the raw error.
- `CanisterError` reads an `opt text` message of an API-shaped error.
  `ApiError`'s `message` and `details` are type parameters that default to
  `unknown`, and `CanisterError.isApiError()` narrows them to `unknown` (#690).
  Migration: name the payload types, e.g.
  `ApiError<[] | [string], [] | [Array<[string, string]>]>`.
- `createPollingStrategy` keeps its attempt count, clock and timeout per
  request, so one instance can serve a whole reactor, and gives up after
  `timeoutMs` (#563). Migration: `timeoutMs: Infinity` restores polling without
  a limit.
- `DisplayReactor` sends `NaN`, `±Infinity` and `-0` floats back as it read
  them (#632).
- `jsonToString` writes a `Principal` as its text and a `Uint8Array` as hex.

#### Fixed

- `DisplayReactor` arguments and query keys:
  - a `Map` given for a `vec record { text; T }` is sent with its entries
    instead of as an empty vector (#767);
  - a record or variant given as a class instance, or with a non-enumerable
    field, is keyed by the value it sends, so two different calls no longer
    share one cache entry (#768).
- A same-principal renewal refetches a query whose fetch in flight then fails,
  instead of leaving it in error (#719).
- A `ValidationError` or `CanisterError` from another copy of the package keeps
  its type through `callMethod`, `callMethodWithValidation` and `validate`
  (#593).

### @ic-reactor/react

#### Added

- `defineDisplayReactor(options)` takes `defineReactor`'s options and builds a
  `DisplayReactor` (#746).
- `createReactorProvider(factory, options?)` returns
  `{ ReactorProvider, useReactor }`. It builds the reactors once per mounted provider, so once per
  request on a server, and disposes the `AuthenticationManager`s built for its
  value on unmount (#745).
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
- Query objects gain `cancel()`, `reset()` and `optimisticUpdate(updater)`,
  which resolves with `{ rollback() }`.
- `callConfig` in `createQuery`, `createSuspenseQuery` and their factories.
- `AuthenticationManager.dispose()` releases the auth client the manager built
  (#745).
- `@ic-reactor/react/testing` re-exports `@ic-reactor/core/testing`.

#### Changed

- `useAuth()` and `useUserPrincipal()` report `isAuthenticating: true` until
  the first session restore settles, in server renders too (#621). Migration:
  check `isAuthenticating` before redirecting on `!isAuthenticated`.
- `createMutation(...).execute()` runs in the QueryClient's MutationCache: the
  cache's global callbacks, `useIsMutating`, the factory's `retry`,
  `networkMode`, `onMutate` and `onSettled`, and the QueryClient's mutation
  defaults now apply to it (#564). Migration: a `mutations.retry` default now
  retries `execute()` too; use `reactorUpdateRetry` for update methods.
- `useActorMethod` awaits `invalidateQueries` before `onSuccess`, and `call()`
  resolves after the invalidated queries have refetched (#564).
- `useActorMethod` applies its `retry`, `retryDelay`, `networkMode` and `meta`
  to an update method's `call()` (#564). Migration: replace a numeric `retry`
  on a hook that calls an update method with `reactorUpdateRetry`.
- `useActorMethod` skips an `undefined` entry of `invalidateQueries` instead of
  invalidating every query.
- On `@icp-sdk/auth` v10, `AuthenticationManager` follows sign-outs and account
  switches made in other tabs and updates the agent (#754).
- `authentication.logout()` on a manager with no client builds one instead of
  throwing "Authentication module is missing".

#### Deprecated

- `defineReactor({ display: true })`, its overload and
  `DefineDisplayReactorParameters`. Use `defineDisplayReactor(...)`. They will
  be removed at the next major. Plain `defineReactor` is not deprecated.

#### Fixed

- `AuthenticationManager` disposes the v10 auth clients it replaces when a
  call's options differ, and on v8 an idle period runs `idleOptions.onIdle`
  once instead of once per client built (#729).
- A session restore reads the identity from the client the manager still uses,
  and a restore of a manager disposed before it finished builds no client
  (#745).

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
- `CandidFormVisitor` and `FieldVisitor` accept `""` for a `text` field. A text
  field with a format, a number and a func reference's method name are still
  required (#611).
- `isPrincipalId` calls `isPrincipalText`, so it refuses a principal longer
  than 29 bytes and the `{"__principal__": ...}` JSON form.

#### Deprecated

- `CandidAdapter.unsubscribe` is a no-op; remove the call (#644).

#### Fixed

- Candid reactors no longer leave an identity subscription on their
  `ClientManager` for good, and an assigned `adapter.didjsCanisterId` survives
  identity changes (#644).

### @ic-reactor/parser

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

### @ic-reactor/cli

#### Added

- `"factories"` per canister in `ic-reactor.json` and `schema.json`. A value
  that is not a boolean is rejected. `generate` prints codegen's warnings.

### @ic-reactor/vite-plugin

#### Added

- `factories` per canister entry. The plugin prints codegen's warnings to the
  terminal without failing the build.

#### Changed

- An entry that shares its output directory with an earlier one (same `name`
  and `outDir`) fails, as it does in the CLI; under `vite build` that fails the
  build (#565).
- `injectEnvironment` sets the `ic_env` cookie on each response. While `icp`
  reports no network or a configured canister has no id, each page load asks
  `icp` again, so deploying after `vite dev` started needs only a reload
  (#664). The `/api` proxy follows the detected network unless the Vite config
  or another plugin sets its own `/api` proxy. `vite preview` gets the same
  cookie.
