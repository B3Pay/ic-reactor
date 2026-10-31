---
title: AuthState
editUrl: false
next: true
prev: true
---

Defined in: [core/src/client.ts:156](https://github.com/B3Pay/ic-reactor/blob/ce557f08e58ca542badaab65172d569c0ec0c62a/packages/core/src/client.ts#L156)

Who a client calls as, and why. [Client.authState](/docs/ic-reactor/libs/interfaces/client/#authstate) returns it.

`principal` is always the principal calls go out as, the same text
[Client.caller](/docs/ic-reactor/libs/interfaces/client/#caller) returns: the signed-in user's when `status` is
`"signed-in"`, and the anonymous principal (`2vxsx-fae`) in every other
state. An expired session, or one signed in on a sibling origin that this
origin holds no credential for, cannot sign a call, so it does not name its
principal here either: a check such as `principal !== anonymous` means what
it looks like it means. To say whose session ended, read the auth's own
`getStatus()`, which keeps the principal in those states.

A client built with an `identity` reports `"signed-in"` with that
identity's principal, or `"anonymous"` for `identity: "anonymous"` and for
an explicit `AnonymousIdentity`. A client on a server reports
`"anonymous"`.

## Properties

### status

> `readonly` **status**: `"signed-in"` \| `"signed-in-elsewhere"` \| `"expired"` \| `"anonymous"`

Defined in: [core/src/client.ts:166](https://github.com/B3Pay/ic-reactor/blob/ce557f08e58ca542badaab65172d569c0ec0c62a/packages/core/src/client.ts#L166)

- `anonymous`: nobody is signed in (the auth says `signed-out`, or a state
  the client does not know), the client runs on a server, or it was built
  anonymous.
- `signed-in`: calls are signed by `principal`.
- `expired`: the session ended; calls are anonymous until a sign-in.
- `signed-in-elsewhere`: someone is signed in on this domain but this
  origin holds no credential for them yet; calls are anonymous.

***

### principal

> `readonly` **principal**: `string`

Defined in: [core/src/client.ts:168](https://github.com/B3Pay/ic-reactor/blob/ce557f08e58ca542badaab65172d569c0ec0c62a/packages/core/src/client.ts#L168)

The principal calls go out as, as text.

***

### expiresAt?

> `readonly` `optional` **expiresAt?**: `number`

Defined in: [core/src/client.ts:182](https://github.com/B3Pay/ic-reactor/blob/ce557f08e58ca542badaab65172d569c0ec0c62a/packages/core/src/client.ts#L182)

When the session ends, in milliseconds since the epoch (`Date.now()`'s
scale; `new Date(expiresAt)` for a date), so an app can show "signed in
until". Present only while `status` is `"signed-in"` through an auth whose
`getStatus()` carries `expiresAtMs`, as `AuthClient` 10's does; absent for
a client built with `identity`. The client tells its listeners when that
time passes, and the status turns `"expired"`.

A `"signed-in"` session may still be read-only: Internet Identity can
scope a session to queries, `AuthClient` reports it `"signed-in"` all the
same, and the network refuses its updates. Nothing here tells the two
apart yet.
