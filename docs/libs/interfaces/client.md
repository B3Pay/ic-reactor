---
title: Client
editUrl: false
next: true
prev: true
---

Defined in: [core/src/client.ts:305](https://github.com/B3Pay/ic-reactor/blob/9512387dfbbf0aba41ccad436de0ce3e590052b8/packages/core/src/client.ts#L305)

A client made by [createClient](/docs/ic-reactor/libs/functions/createclient/): one per browser tab, or one per
request on a server, so that no cache or agent is shared between users.

## Properties

### network

> `readonly` **network**: `string`

Defined in: [core/src/client.ts:307](https://github.com/B3Pay/ic-reactor/blob/9512387dfbbf0aba41ccad436de0ce3e590052b8/packages/core/src/client.ts#L307)

The network's segment in query keys: `"ic"`, `"local"`, a custom network's `name ?? host`, or the resolved host for `"env"`.

***

### queryClient

> `readonly` **queryClient**: `QueryClient`

Defined in: [core/src/client.ts:317](https://github.com/B3Pay/ic-reactor/blob/9512387dfbbf0aba41ccad436de0ce3e590052b8/packages/core/src/client.ts#L317)

The `QueryClient` this client owns. Its default `retry` retries a
`ReactorError` only after a failure that proves it was not delivered, and
any other error (an app's own REST query on this `QueryClient`) as
TanStack Query does by default: up to 3 times; neither is retried on a
server. Its dehydrate and hydrate defaults keep `bigint`, `Uint8Array`
and the floats JSON cannot write, so a server's `dehydrate()` survives
`JSON.stringify` and comes back exact.

## Methods

### caller()

> **caller**(): `string`

Defined in: [core/src/client.ts:319](https://github.com/B3Pay/ic-reactor/blob/9512387dfbbf0aba41ccad436de0ce3e590052b8/packages/core/src/client.ts#L319)

The principal calls go out as now, as text: the anonymous principal unless signed in.

#### Returns

`string`

***

### authState()

> **authState**(): [`AuthState`](/docs/ic-reactor/libs/interfaces/authstate/)

Defined in: [core/src/client.ts:325](https://github.com/B3Pay/ic-reactor/blob/9512387dfbbf0aba41ccad436de0ce3e590052b8/packages/core/src/client.ts#L325)

Who calls go out as, and why. The object is the same until the status,
the principal or `expiresAt` changes, so it can be read with
`useSyncExternalStore`.

#### Returns

[`AuthState`](/docs/ic-reactor/libs/interfaces/authstate/)

***

### subscribe()

> **subscribe**(`listener`): () => `void`

Defined in: [core/src/client.ts:337](https://github.com/B3Pay/ic-reactor/blob/9512387dfbbf0aba41ccad436de0ce3e590052b8/packages/core/src/client.ts#L337)

Calls `listener` once after each change of [Client.authState](#authstate), and
never for a notification of the auth that changed none of the status,
the principal and `expiresAt` (a renewed delegation, for one). A session
that ends by the clock is a change too: the client sets a timer for its
[AuthState.expiresAt](/docs/ic-reactor/libs/interfaces/authstate/#expiresat), so listeners hear of it without any
notification of the auth, and a read of [Client.caller](#caller) or
[Client.authState](#authstate) that sees a change first tells them in a
microtask. Returns a function that stops listening. On a disposed client
it adds nothing.

#### Parameters

##### listener

() => `void`

#### Returns

() => `void`

***

### signIn()

> **signIn**(`options?`): `Promise`\<`void`\>

Defined in: [core/src/client.ts:354](https://github.com/B3Pay/ic-reactor/blob/9512387dfbbf0aba41ccad436de0ce3e590052b8/packages/core/src/client.ts#L354)

Signs in through the client's auth, passing `options` on. Listeners are
told once the auth settles, even if the auth itself did not notify.
Rejects a `TypeError` on a client built with `identity`, which has no
sign-in, an `Error` on a server or after [Client.dispose](#dispose), and
with what the auth factory threw when it threw (a `TypeError` when it
returned something other than an [AuthLike](/docs/ic-reactor/libs/interfaces/authlike/)).

A call in the same synchronous run as an earlier one with the same
options (the same value, or an object with the same own enumerable keys
and values) returns that call's promise and does not ask the auth again.
React's `StrictMode` runs an effect twice in one run, and an Internet
Identity sign-in over `transport: "redirect"` that starts twice fails on
the load it comes back to. A call in a later run, such as a second click,
signs in again.

#### Parameters

##### options?

`unknown`

#### Returns

`Promise`\<`void`\>

***

### signOut()

> **signOut**(`options?`): `Promise`\<`void`\>

Defined in: [core/src/client.ts:359](https://github.com/B3Pay/ic-reactor/blob/9512387dfbbf0aba41ccad436de0ce3e590052b8/packages/core/src/client.ts#L359)

Signs out through the client's auth, passing `options` on (such as
`AuthClient`'s `{ returnTo }`). Rejects like [Client.signIn](#signin).

#### Parameters

##### options?

`unknown`

#### Returns

`Promise`\<`void`\>

***

### dispose()

> **dispose**(): `void`

Defined in: [core/src/client.ts:373](https://github.com/B3Pay/ic-reactor/blob/9512387dfbbf0aba41ccad436de0ce3e590052b8/packages/core/src/client.ts#L373)

Releases everything the client holds: it stops listening to its auth and
disposes it, clears the `QueryClient`, and drops its agents. Calling it
again does nothing.

Every call made on the client afterwards, a write included, rejects
`cancelled` with code `client_disposed` and `mayHaveExecuted: false`, and
sends nothing: a direct call, a query or mutation function, a func
reference's function. A call still waiting to be sent (for its caller's
identity, or to be sent again) is cancelled the same way. A direct call
already sent settles as the replica answers; a read the client's
`QueryClient` was running is dropped with the cache.

#### Returns

`void`

***

### canister()

> **canister**\<`A`\>(`service`, `target`): [`Canister`](/docs/ic-reactor/libs/type-aliases/canister/)\<`A`\>

Defined in: [core/src/client.ts:406](https://github.com/B3Pay/ic-reactor/blob/9512387dfbbf0aba41ccad436de0ce3e590052b8/packages/core/src/client.ts#L406)

A canister to call: a frozen object with one plain async method per
Candid method of `service`, typed from the generated `Actor` you name.

```ts
import { actor, type Actor } from "./canisters/icrc1"
const ledger = client.canister<Actor>(actor, { id: LEDGER_ID })
const balance = await ledger.icrc1_balance_of({ owner, subaccount: null })
```

`service` is the `actor` export of a module `candid-core-cli gen` wrote,
or the `actor` of `schemaFromContract()`: both make the same calls and the
same keys. `<A>` is not checked against `service`; pass the `Actor` of
the same module.

A method sends its call as the caller signed in at the moment it is
called, decodes the reply, and resolves with it as the `Actor` types it,
except that a method whose one result is an `Ok`/`Err` variant resolves
with the `Ok` payload and rejects `canister_err` with the `Err` one. An
update or a oneway by a caller who is not signed in rejects
`unauthenticated` and sends nothing. Every failure is a `ReactorError`;
see [Canister](/docs/ic-reactor/libs/type-aliases/canister/) for what is re-sent.

The same service object and the same target give the same canister
object on every call, so it can be made during render. See
[CanisterTarget](/docs/ic-reactor/libs/type-aliases/canistertarget/) for `{ id }`, `{ name }` and `certified`.

#### Type Parameters

##### A

`A`

#### Parameters

##### service

`Schema`\<`Principal`\>

##### target

[`CanisterTarget`](/docs/ic-reactor/libs/type-aliases/canistertarget/)

#### Returns

[`Canister`](/docs/ic-reactor/libs/type-aliases/canister/)\<`A`\>

#### Throws

TypeError for a `service` that is not a service schema, or a
target that is not one of the allowed shapes or whose `id` is not
principal text.

***

### canisterId()

> **canisterId**(`target`): \{ `ok`: `true`; `id`: `string`; \} \| \{ `ok`: `false`; `reason`: `"no_browser"` \| `"untrusted_host"` \| `"absent"`; `message`: `string`; \}

Defined in: [core/src/client.ts:438](https://github.com/B3Pay/ic-reactor/blob/9512387dfbbf0aba41ccad436de0ce3e590052b8/packages/core/src/client.ts#L438)

The canister id a target resolves to now, by the same resolver the calls
of `client.canister(service, target)` use, without making a call.

```ts
const backend = client.canisterId({ name: "backend" })
if (!backend.ok && backend.reason === "untrusted_host") showSetupHint()
```

`{ id }` gives that id. `{ name }` is read from the `ic_env` cookie, as a
call reads it, and gives the id or one of three reasons, each with its
own fix:

- `no_browser`: there is no page, so no cookie to read (a server render,
  a web worker).
- `untrusted_host`: the cookie is not trusted for this network, so it was
  not read; or a page that is not local holds more than one `ic_env`
  cookie and they differ, so none is believed.
- `absent`: the cookie was read and has no principal text under that
  name.

`message` is the resolver's reason, the text a call on that target puts
in its error after the method and target. The answer is not kept: each call reads the cookie again, as each call of a
`{ name }` canister does. It sends nothing, and a `certified` flag in the
target is ignored. An id it gives is the one the cookie names; whether a
canister answers there is not checked.

#### Parameters

##### target

[`CanisterTarget`](/docs/ic-reactor/libs/type-aliases/canistertarget/)

#### Returns

\{ `ok`: `true`; `id`: `string`; \} \| \{ `ok`: `false`; `reason`: `"no_browser"` \| `"untrusted_host"` \| `"absent"`; `message`: `string`; \}

#### Throws

TypeError for a target that is not one of the allowed shapes or
whose `id` is not principal text.

***

### queryKey()

> **queryKey**\<`A`, `M`\>(`canister`, `method?`, `vars?`): readonly `unknown`[]

Defined in: [core/src/client.ts:472](https://github.com/B3Pay/ic-reactor/blob/9512387dfbbf0aba41ccad436de0ce3e590052b8/packages/core/src/client.ts#L472)

The query key of a read, or the prefix of a group of reads, for
`queryClient.invalidateQueries`, `getQueryData` and filters:

- `queryKey(c)`: every read of the canister by the current caller.
- `queryKey(c, method)`: every read of that method by the current caller,
  whatever its arguments. For a method without arguments, which has one
  read, this is that read's key, the same as `queryKey(c, method,
  undefined)`, so `queryClient.getQueryData(client.queryKey(ledger,
  "icrc1_fee"))` finds what `queryOptions(ledger, "icrc1_fee")` cached.
- `queryKey(c, method, vars)`: the key `queryOptions(c, method, vars)`
  gives, as built now.

`getQueryData` and `setQueryData` match a key exactly: hand them a read's
whole key, never a prefix (a method's with arguments, or a canister's).

Keys are `['ic-reactor', network, caller, canisterId, method, args]` plus
`'certified'` for a certified canister (DECISIONS Q5). Build them with
this method, never by hand: a key typed out as an array literal is a
`QueryKey` like any other, and matches nothing the client invalidates.
It never throws for `vars` that do not encode: the key then holds
`'$invalid'` and a text of the value.

#### Type Parameters

##### A

`A`

##### M

`M` *extends* `string`

#### Parameters

##### canister

[`Canister`](/docs/ic-reactor/libs/type-aliases/canister/)\<`A`\>

##### method?

`M`

##### vars?

`VarsOf`\<`A`, `M`\>

#### Returns

readonly `unknown`[]

#### Throws

TypeError for a canister of another client, or a method the
service does not have.

***

### queryOptions()

#### Call Signature

> **queryOptions**\<`A`, `M`\>(`canister`, `method`, ...`args`): `CanisterQueryOptions`\<`DataOf`\<`A`, `M`\>, `ErrorOf`\<`A`, `M`\>, `never`\>

Defined in: [core/src/client.ts:547](https://github.com/B3Pay/ic-reactor/blob/9512387dfbbf0aba41ccad436de0ce3e590052b8/packages/core/src/client.ts#L547)

TanStack Query options for a read: `useQuery(client.queryOptions(ledger,
"icrc1_balance_of", account))`, `queryClient.fetchQuery(...)`, a
`QueryObserver`.

The variables after `method` follow one rule (DECISIONS Q3): nothing for
a method without arguments, the value for one argument, the tuple for two
or more. Pass `skipToken` (from `@tanstack/query-core` or
`@tanstack/react-query`) in their place while they are not known yet.

The read is made as the caller current when the options are built: the
key holds their principal, and the query function refuses to run
(`cancelled`, nothing sent) once someone else is signed in. Build the
options again when the caller changes, as a component does on every
render, and the read moves to the new caller's key: one principal's data
is never shown under another's.

Arguments that do not encode give a key tagged `'$invalid'` and a query
function that rejects `invalid_args` with the codec's issues, so a render
never throws on half-typed input.

`retry` retries only a failure that proves the call was not delivered, at
most 3 times, and never on a server.

An update or a oneway method of a generated `Actor` does not compile
here (`method` is a `ReadMethod<A>`): a query refetches, and every
refetch would run the update again. Use [Client.mutationOptions](#mutationoptions)
for a write. The generated `Actor` says each method's mode; a method of
an `Actor` written by hand says none and compiles, and this checks it at
run time instead, throwing a `TypeError` for an update or a oneway. An
update that returns the same answer however often it runs (ckBTC's
`get_btc_address`) can be read with `{ update: "idempotent" }` as the
fourth argument (the third signature; a oneway does not compile even
then): it is fetched once per key and caller (`staleTime: Infinity`, no
refetch on mount, focus or reconnect), needs a signed-in caller like any
update, and is retried only after a failure that proves it never got in
(DECISIONS Q2). It is still a read of its canister, so a write to that
canister through [Client.mutationOptions](#mutationoptions) invalidates it by default
and it runs once more, as a replicated call: safe for an idempotent
method, but a cost. To keep it cached across writes, name the reads a
write changes in `invalidates`.

A method TypeScript cannot tell is a `ReadMethod<A>` does not compile,
even when every value of it names a query: a type parameter
(`M extends keyof A & string`), a union that may name an update
(`keyof Actor & string`), or any method of a `Canister<A>` whose `A` is
itself generic. Give the type arguments,
`queryOptions<A, any>(canister, method, vars)`, which keeps the run-time
check and types the data `unknown`.

A method without results (`() -> () query`) has nothing to cache: its
call resolves `undefined`, which TanStack Query takes for a failed read.
This throws a `TypeError` for it too; call it directly, as
`await canister.method()`.

Built from variables that cannot be `skipToken`, the options' `queryFn`
is never `skipToken` either, so `useSuspenseQuery` and
`useSuspenseQueries` take them as they are. Variables of a type
`skipToken` is assignable to, such as `unknown` (a Candid `reserved`
argument) or `{}`, may be, so every read of such a method takes the next
signature and keeps `SkipToken`.

##### Type Parameters

###### A

`A`

###### M

`M` *extends* `string`

##### Parameters

###### canister

[`Canister`](/docs/ic-reactor/libs/type-aliases/canister/)\<`A`\>

###### method

`M`

###### args

...`QueryArgs`\<`A`, `M`, `never`\>

##### Returns

`CanisterQueryOptions`\<`DataOf`\<`A`, `M`\>, `ErrorOf`\<`A`, `M`\>, `never`\>

##### Throws

TypeError for an update or oneway method without the opt-in, a
method without results, a composite query of a certified canister, a
canister of another client, a method the service does not have, or a
fourth argument other than `{ update: "idempotent" }`. An update or a
oneway reaches this check only through an `Actor` that does not say the
method's mode.

#### Call Signature

> **queryOptions**\<`A`, `M`\>(`canister`, `method`, ...`args`): `CanisterQueryOptions`\<`DataOf`\<`A`, `M`\>, `ErrorOf`\<`A`, `M`\>\>

Defined in: [core/src/client.ts:561](https://github.com/B3Pay/ic-reactor/blob/9512387dfbbf0aba41ccad436de0ce3e590052b8/packages/core/src/client.ts#L561)

TanStack Query options for a read whose variables may be `skipToken`
(`V | SkipToken`, or `skipToken` itself): the options' `queryFn` is
`skipToken` for a skipped read, which `useQuery` takes and
`useSuspenseQuery` does not. Otherwise the same as the call with
variables that cannot be skipped: see that signature for the rules.

##### Type Parameters

###### A

`A`

###### M

`M` *extends* `string`

##### Parameters

###### canister

[`Canister`](/docs/ic-reactor/libs/type-aliases/canister/)\<`A`\>

###### method

`M`

###### args

...`QueryArgs`\<`A`, `M`\>

##### Returns

`CanisterQueryOptions`\<`DataOf`\<`A`, `M`\>, `ErrorOf`\<`A`, `M`\>\>

##### Throws

TypeError as the call with variables that cannot be skipped.

#### Call Signature

> **queryOptions**\<`A`, `M`\>(`canister`, `method`, ...`args`): `CanisterQueryOptions`\<`DataOf`\<`A`, `M`\>, `ErrorOf`\<`A`, `M`\>, `never`\>

Defined in: [core/src/client.ts:583](https://github.com/B3Pay/ic-reactor/blob/9512387dfbbf0aba41ccad436de0ce3e590052b8/packages/core/src/client.ts#L583)

TanStack Query options for an update read like a query, with
`{ update: "idempotent" }`: only for an update that returns the same
answer however often it runs, such as ckBTC's `get_btc_address`.

```ts
useQuery(client.queryOptions(minter, "get_btc_address", arg, { update: "idempotent" }))
```

The variables come first, even `undefined` for a method without
arguments. A oneway method does not compile here either (`method` is an
`OptInMethod<A>`): it has no reply to cache. The read is fetched once per
key and caller; see the first signature for the rules every read
follows.

##### Type Parameters

###### A

`A`

###### M

`M` *extends* `string`

##### Parameters

###### canister

[`Canister`](/docs/ic-reactor/libs/type-aliases/canister/)\<`A`\>

###### method

`M`

###### args

...`OptInQueryArgs`\<`A`, `M`, `never`\>

##### Returns

`CanisterQueryOptions`\<`DataOf`\<`A`, `M`\>, `ErrorOf`\<`A`, `M`\>, `never`\>

##### Throws

TypeError as the call without the opt-in, except for an update.

#### Call Signature

> **queryOptions**\<`A`, `M`\>(`canister`, `method`, ...`args`): `CanisterQueryOptions`\<`DataOf`\<`A`, `M`\>, `ErrorOf`\<`A`, `M`\>\>

Defined in: [core/src/client.ts:595](https://github.com/B3Pay/ic-reactor/blob/9512387dfbbf0aba41ccad436de0ce3e590052b8/packages/core/src/client.ts#L595)

The opt-in read of an update, with variables that may be `skipToken`:
its `queryFn` is `skipToken` for a skipped read. Otherwise the same as
the opt-in call with variables that cannot be skipped.

##### Type Parameters

###### A

`A`

###### M

`M` *extends* `string`

##### Parameters

###### canister

[`Canister`](/docs/ic-reactor/libs/type-aliases/canister/)\<`A`\>

###### method

`M`

###### args

...`OptInQueryArgs`\<`A`, `M`\>

##### Returns

`CanisterQueryOptions`\<`DataOf`\<`A`, `M`\>, `ErrorOf`\<`A`, `M`\>\>

##### Throws

TypeError as the call without the opt-in, except for an update.

***

### mutationOptions()

> **mutationOptions**\<`A`, `M`\>(`canister`, `method`, `options?`): `CanisterMutationOptions`\<`VarsOf`\<`A`, `M`\>, `DataOf`\<`A`, `M`\>, `ErrorOf`\<`A`, `M`\>\>

Defined in: [core/src/client.ts:659](https://github.com/B3Pay/ic-reactor/blob/9512387dfbbf0aba41ccad436de0ce3e590052b8/packages/core/src/client.ts#L659)

TanStack Query options for a write: `useMutation(client.mutationOptions(
ledger, "icrc1_transfer"))`, then `mutate(arg)` with the same argument
convention as [Client.queryOptions](#queryoptions).

The mutation function calls the method as the caller current when
`mutate()` was called (read in `onMutate`), or not at all: a write that
TanStack Query holds back (offline, or behind another mutation of its
`scope`) while the account changes rejects `cancelled`, code
`caller_changed`, `mayHaveExecuted: false`, and sends nothing; so does a
mutation restored from a persister, whose caller is not known. The
client's own `queryClient` reads each run's caller in its
`MutationCache`, so this holds with an `onMutate` of the app's that
replaces this one; the JSDoc of the returned `mutationFn` covers a run on
another `QueryClient`. The options of a view (what `useClient()` returns)
also call only as the view's principal, and end their `mutationKey` with
it: while someone else is current their mutation function rejects
`cancelled` the same way. An update by a caller who is not signed in
rejects `unauthenticated` before anything is sent. `retry` is `false`: an
update
re-sends itself only when the failure proves the first attempt never got
in (see [Canister](/docs/ic-reactor/libs/type-aliases/canister/)), and a TanStack retry would re-send after
failures that do not prove it, running the write twice.

`onSettled` invalidates the reads the write may have changed, on the
`QueryClient` the mutation ran on (which TanStack Query 5.89 and later
hands it; an app's own `QueryClientProvider` nested inside the client's)
and on this client's `queryClient`, for every caller, certified or not,
and waits for the active ones to refetch: after a success, a
`canister_err`, and any failure whose `mayHaveExecuted` is `true` (a lost
reply: the re-read shows whether it happened). Not after a failure that proves nothing ran
(`invalid_args`, `unauthenticated`, `not_delivered`, a reject 1 or 3, a
`cancelled` before sending). The reads are every read of the canister
written to (DECISIONS Q10), or those listed in `invalidates`: canisters
and `[canister, method]` pairs of this client; `[]` invalidates nothing.
"Every read" includes an update read with `{ update: "idempotent" }`
(such as a ckBTC minter's `get_btc_address` after `update_balance`),
whose re-read is one more replicated call; list the reads in
`invalidates` to leave it cached.

A `{ name }` (the canister written to, or one in `invalidates`) is
resolved once per run, in `onMutate`, which TanStack Query runs first
and whose result it hands to `onSettled`: a write whose `ic_env` cookie
entry changes before it settles (a local redeploy) invalidates the reads
of the canister it wrote to. To add your own `onSettled`, call this one
from it with every argument it gets; to add your own `onMutate`, call
this one from it with both and spread its result into yours:
`{ ...options.onMutate(variables, context), previous }`. An `onMutate`
that replaces this one keeps the write and its invalidation together
from TanStack Query 5.89 on, which hands `mutationFn` and `onSettled` the
same run context: `mutationFn` resolves the targets when it starts, and
`onSettled` reads them from there. Before 5.89 it leaves `mutationFn` and
`onSettled` each to resolve the targets when it runs, so a cookie
rewritten between the two can split the write from its invalidation.

#### Type Parameters

##### A

`A`

##### M

`M` *extends* `string`

#### Parameters

##### canister

[`Canister`](/docs/ic-reactor/libs/type-aliases/canister/)\<`A`\>

##### method

`M`

##### options?

`MutationOptionsOptions`

#### Returns

`CanisterMutationOptions`\<`VarsOf`\<`A`, `M`\>, `DataOf`\<`A`, `M`\>, `ErrorOf`\<`A`, `M`\>\>

#### Throws

TypeError for a canister of another client, a method a service
does not have, or a third argument other than `{ invalidates }`.

***

### resendOf()

> **resendOf**\<`A`, `M`\>(`error`, `canister`, `method`, `options`): `Resend`\<`VarsOf`\<`A`, `M`\>, `DataOf`\<`A`, `M`\>\> \| `undefined`

Defined in: [core/src/client.ts:726](https://github.com/B3Pay/ic-reactor/blob/9512387dfbbf0aba41ccad436de0ce3e590052b8/packages/core/src/client.ts#L726)

The write `error` reports, offered to send again exactly as it was sent,
by whoever sent it, when its outcome is unknown; `undefined` when there
is nothing to offer.

Only for a method that deduplicates: one that runs the same argument
from the same sender at most once, as an ICRC-1 ledger does for a
transfer with `created_at_time` set (it answers `Duplicate` the second
time). Sending again a write that does not deduplicate can run it twice:
there, read the state back instead. `dedupedBy` states what the canister
deduplicates on, read from the argument:

```ts
const transfer = useMutation(client.mutationOptions(ledger, "icrc1_transfer"))
const again = client.resendOf(transfer.error, ledger, "icrc1_transfer", {
  dedupedBy: (arg) => arg.created_at_time,
})
// again && <button onClick={() => transfer.mutate(again.arg)}>Send the same transfer again</button>
```

It offers a re-send only when all of these hold, and is read again on
every call, so read it during render, in a component that re-renders
when the caller changes (one that calls `useAuth()`):

- `error` is one a write of `method` on `canister` rejected with (a
  direct call, or a mutation function built from the canister), with
  `mayHaveExecuted: true`. Any other failure proves the outcome, and a
  success needs no re-send.
- Its argument is an object: a record or a variant, or the list of
  several arguments.
- `dedupedBy(arg)` is neither `undefined` nor `null`.
- The argument still encodes to the bytes the attempt sent: an argument
  object changed since then is not offered.
- `canister` still resolves to the canister id the attempt went to: a
  `{ name }` the `ic_env` cookie maps elsewhere since is not offered.
- The principal that sent it is the caller now. After a sign-out, or a
  sign-in as another principal, nothing is offered: the same argument
  from another sender is a new write. Signing in again as the sender
  offers it again. A view of the client pinned to a principal (what
  `useClient()` returns) answers for the live caller, whom a write goes
  out as.

The offer goes out only as the same write. `send()` sends the bytes the
attempt sent, to the canister id it went to. `mutate(arg)`, on the
mutation that failed (which keeps its pending state and invalidation) or
any other of this client, sends `arg` only to the method and canister id
the attempt went to, and only while it encodes to the same bytes. Either
one goes out only as `from`. Each refusal sends nothing, and the code
says which it is: `caller_changed` once someone else is the caller,
`target_changed` for another method or canister id, and `arg_changed`
for an argument changed since it was sent. A re-send that is refused, or
turned away when sent (an HTTP 4xx, reject code 1 to 3), still rejects
`outcome_unknown` with `mayHaveExecuted: true`, because the attempt it
re-sends may have run, and this method offers that write again for that
error, under the same conditions as for the first. Once
offered, that object stays held to that write: build a new argument for
a new write, rather than change this one or send it from another account.

#### Type Parameters

##### A

`A`

##### M

`M` *extends* `string`

#### Parameters

##### error

`unknown`

##### canister

[`Canister`](/docs/ic-reactor/libs/type-aliases/canister/)\<`A`\>

##### method

`M`

##### options

`ResendOptions`\<`VarsOf`\<`A`, `M`\>\>

#### Returns

`Resend`\<`VarsOf`\<`A`, `M`\>, `DataOf`\<`A`, `M`\>\> \| `undefined`

#### Throws

TypeError for a canister of another client, a method the service
does not have, or no `dedupedBy` function.

***

### encode()

> **encode**\<`A`, `M`\>(`canister`, `method`, `vars`): `Uint8Array`

Defined in: [core/src/client.ts:761](https://github.com/B3Pay/ic-reactor/blob/9512387dfbbf0aba41ccad436de0ce3e590052b8/packages/core/src/client.ts#L761)

The Candid bytes a call of `method` with `vars` sends, as a `Uint8Array`:
made by the call path's own encoder with its own variables rule (the
value for one argument, the tuple for several, nothing for none), so
they are the bytes that go out, not a second encoding. Pass them where
the exact argument is wanted, such as an ICRC-21 consent request's `arg`:

```ts
const arg = client.encode(ledger, "icrc1_transfer", transfer)
const consent = await ledger.icrc21_canister_call_consent_message({
  method: "icrc1_transfer",
  arg,
  user_preferences: preferences,
})
```

It sends nothing and needs no canister id, so a `{ name }` the `ic_env`
cookie does not resolve encodes too.

It checks only the variables: not the caller, the canister id or
whether the client is disposed, which a call checks before it encodes.

#### Type Parameters

##### A

`A`

##### M

`M` *extends* `string`

#### Parameters

##### canister

[`Canister`](/docs/ic-reactor/libs/type-aliases/canister/)\<`A`\>

##### method

`M`

##### vars

`VarsOf`\<`A`, `M`\>

#### Returns

`Uint8Array`

#### Throws

ReactorError `invalid_args` for variables that do not encode,
with the `issues` and `reason` a call rejects with when its variables are
all that is wrong.

#### Throws

TypeError for a canister of another client, or a method the
service does not have.

***

### func()

> **func**\<`F`\>(`funcSchema`, `ref`): `F`

Defined in: [core/src/client.ts:789](https://github.com/B3Pay/ic-reactor/blob/9512387dfbbf0aba41ccad436de0ce3e590052b8/packages/core/src/client.ts#L789)

An async function for a func reference a reply carried, such as an ICRC
ledger's archive callback:

```ts
import { QueryArchiveFn, type GetBlocksArgs, type BlockRange } from "./canisters/ledger"
for (const range of reply.archived_blocks) {
  const read = client.func<(arg: GetBlocksArgs) => Promise<BlockRange>>(QueryArchiveFn, range.callback)
  const { blocks } = await read({ start: range.start, length: range.length })
}
```

The call goes to `ref.principal` and `ref.method`, with the arguments,
results and mode of `funcSchema` (the generated schema of the func type),
through the same path as a canister's methods: the same errors, the same
caller rules, the same unwrapping. `F` is not checked against
`funcSchema`: a generated func type carries no signature, so write the
one its `.did` gives, with the `Ok` payload as the reply of a result.

#### Type Parameters

##### F

`F` *extends* (...`args`) => `Promise`\<`unknown`\>

#### Parameters

##### funcSchema

`Schema`\<`FuncValue`\>

##### ref

`FuncValue`

#### Returns

`F`

#### Throws

TypeError for a schema that is not a func schema, or a `ref`
whose principal is not principal text or whose method is not a name.

***

### time()

> **time**(`canister`): `Promise`\<`bigint`\>

Defined in: [core/src/client.ts:831](https://github.com/B3Pay/ic-reactor/blob/9512387dfbbf0aba41ccad436de0ce3e590052b8/packages/core/src/client.ts#L831)

The IC's time, in nanoseconds since the epoch (the unit of an ICRC-1
`created_at_time`), from a certified `read_state` of the `time` path,
routed by `canister`'s subnet. Stamp a deduplication key with it rather
than with the host's clock, which a ledger checks against its own.

```ts
const created_at_time = await client.time(ledger)
```

The IC's time moves about once a second (once per round), so two writes
stamped close together can carry the same time: give each its own
`memo` as well.

Its request carries an ingress expiry from the host's clock, as every
request does: a host clock so far off that the IC refuses its requests
gets `not_delivered` here too.

The certificate is verified against the network's root key, as every
reply is; its age is not compared with the host's clock, which may be the
clock that is wrong. A certificate that does not verify rejects
`not_delivered` with `mayHaveExecuted: false`, and its time is never
returned. It needs no signed-in caller, and is sent by the caller's
agent, as a read does. A `{ name }` the `ic_env` cookie
does not resolve rejects `invalid_args` (`canister_id_unresolved`), as
does the management canister `aaaaa-aa` (`management_canister`), which no
`read_state` is routed by, and a disposed client rejects `cancelled`
(`client_disposed`); nothing is sent then.

A canister object made with `timeoutMs` bounds the wait, counted from the
moment `time()` is called, as it bounds a call through it. When the bound
passes, `time()` rejects `cancelled` with code `"timeout"` and
`mayHaveExecuted: false`; a request already out is not torn down, only
the waiting stops, and one not sent yet is never sent. Without
`timeoutMs`, a `read_state` that gets no HTTP answer waits as long as the
`fetch` in use does.

#### Parameters

##### canister

[`Canister`](/docs/ic-reactor/libs/type-aliases/canister/)\<`object`\>

#### Returns

`Promise`\<`bigint`\>
