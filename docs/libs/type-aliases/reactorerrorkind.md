---
title: ReactorErrorKind
editUrl: false
next: true
prev: true
---

> **ReactorErrorKind** = `"invalid_args"` \| `"unauthenticated"` \| `"not_delivered"` \| `"outcome_unknown"` \| `"rejected"` \| `"invalid_reply"` \| `"canister_err"` \| `"cancelled"`

Defined in: [core/src/errors.ts:54](https://github.com/B3Pay/ic-reactor/blob/189aba57cfa0e99738cd0bfc7e05c28c8ff94a26/packages/core/src/errors.ts#L54)

What kind of failure a [ReactorError](/docs/ic-reactor/libs/type-aliases/reactorerror/) reports.

- `invalid_args`: the arguments could not be encoded, or the target canister
  id could not be resolved. Nothing was sent.
- `unauthenticated`: an update was attempted while not signed in. Nothing was
  sent.
- `not_delivered`: nothing that matters ran. Either the request was refused
  or never taken in (the replica or a boundary node turned it away, or the
  system could not take it in), or it was a query, which changes nothing, and
  no answer came back. A failed query may well have reached the canister,
  so `mayHaveExecuted` carries the guarantee: it is `false` on every
  `not_delivered`, because a refused update never ran and a query changes
  nothing.
- `outcome_unknown`: an update went out and no trustworthy answer came back,
  so the canister may or may not have run it. So does a re-send of a write
  `client.resendOf()` offered that did not run, refused before it went out
  or turned away: the write it re-sends may have run all the same. Its
  `code`, `httpStatus` and `rejectCode` say why the re-send did not run
  (such as `caller_changed`, `target_changed` or `arg_changed`), and its
  `cause` is the re-send's own error.
- `rejected`: the IC or the canister rejected the call; `rejectCode` says which.
- `invalid_reply`: a reply arrived but did not decode as the method's result.
- `canister_err`: the canister ran the call and replied with the `Err` arm of
  its result; `err` is typed. The outcome is that answer, so
  `mayHaveExecuted` is `false`: re-sending is a new decision, not a retry.
- `cancelled`: the caller abandoned the call (an aborted query, a key whose
  principal is no longer current, a call on a disposed client
  (`client_disposed`), a read or an unsent write whose `timeoutMs` passed
  (`timeout`), or an update aborted in flight). A write whose `timeoutMs` passed after its request went out
  is `outcome_unknown` (`timeout`) instead.
  `mayHaveExecuted` is `false` when nothing was sent, and `true` for an
  update aborted after its request may already have been delivered.
