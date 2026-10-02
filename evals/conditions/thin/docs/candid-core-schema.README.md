# @candid-core/schema

A Zod-style schema runtime for [Candid], driven by [candid-core]'s canonical
Contract model: schema builders with static inference, structural validation,
a TypeScript-native Candid binary codec, typed actors over a transport-only
agent, and UI-agnostic form metadata.

```sh
npm install @candid-core/schema
```

That is the whole install. The `@icp-sdk/core` peer is needed only by the
[`./transport-icp`](#calling-a-canister) subpath, at runtime, for exactly
whoever imports it — every other module is self-contained, principal typing
included ([the decoded-value contract](#the-icp-sdk-peer) below).

```ts
import { c, type Infer } from "@candid-core/schema";
import { validate } from "@candid-core/schema/validate";
import { encode, decode } from "@candid-core/schema/codec";

const Account = c.record({ owner: c.principal, balance: c.nat });
type Account = Infer<typeof Account>; // { owner: PrincipalValue; balance: bigint }

const value: Account = { owner: { toText: () => "aaaaa-aa" }, balance: 5n };

validate(Account, value); // { ok: true } | { ok: false, issues }
const encoded = encode(Account, value); // { ok: true, bytes } | { ok: false, issues }
if (encoded.ok) {
  decode(Account, encoded.bytes);
}
```

Modules, each a subpath export:

- **`.`** — the schema core: the `c` builders, `Schema<in out T>` (deliberately
  invariant), `Infer`, and the node interfaces walkers narrow on — plus
  `resolveSchema` and `serviceMethods` for reading one back, since a schema
  reached by name is a `rec` indirection and a service's methods are a table.
- **`./validate`** — bounded, fail-closed structural validation; never throws
  on any value; issues carry stable codes and `$`-rooted paths — plus
  `isResultSchema` and `unwrapResult`, the schema-directed read of the
  `variant { ok; err }` convention [below](#unwrapping-okerr-results).
- **`./contract`** — build the same schemas at runtime from a canonical
  Contract JSON document — or from a one-document `ContractEnvelope` carrying
  its hash-enforced field-name table.
- **`./codec`** — the Candid binary wire format, schema-directed, with the
  spec's coercion relation on decode and explicit resource budgets. Verified
  bidirectionally against the reference implementation's vectors.
- **`./actor`** — `createActor`/`callFunc` over a two-method byte-pipe
  `Transport`; the agent never sees a schema.
- **`./transport-icp`** — the compiled, tested `Transport` adapter over
  `@icp-sdk/core`'s `HttpAgent` (peer `>= 6`; importing this subpath is what
  makes the peer a runtime requirement).
- **`./forms`** — form-generation metadata: per-kind controls, constraints,
  labels, lazy recursion, and validation-issue-to-form-node resolution.
- **`./labels`** — the Candid label hash and the `_N_` rendering convention.

## The icp-sdk peer

`@icp-sdk/core` is a peer only the [`./transport-icp`](#calling-a-canister)
subpath uses — at runtime, `>= 6`, for exactly whoever imports it. No other
shipped module imports the SDK at all, at runtime or in its declarations, so
every other subpath compiles and runs with no `@icp-sdk/core` installed —
under strict TypeScript with `skipLibCheck` off included. (Earlier releases
typed `c.principal` against the SDK's `Principal` class, which made the peer
a silent type-level requirement everywhere; the structural `PrincipalValue`
removed it.)

### Decoded principal values

`c.principal` types as `PrincipalValue` — `{ toText(): string }`, exported
from the root — which is the truth in both directions:

- **What you get.** The codec is self-contained and never constructs an SDK
  class: a decoded principal carries exactly `toText()`. It is *not* a
  `Principal` instance — `instanceof` is `false`, and class methods like
  `.toUint8Array()` do not exist on it. Code that wants the class re-wraps:
  `Principal.fromText(value.toText())`.
- **What you can give.** Validation and encoding are structural — any object
  whose `toText()` returns canonical principal text — and the SDK class
  satisfies that shape, so values built with `Principal.fromText(…)` encode
  unchanged.

## From a `.did` file

There is no JavaScript-only path from Candid source to schemas yet — compiling
`.did` needs the Rust crate — but the route that exists today produces exactly
the schemas the generated modules carry, and it is two commands.

Install the compiler. `candid-core` is pre-1.0 with only prereleases on
crates.io, so the version has to be explicit: a bare `cargo install
candid-core` fails with `could not find candid-core in registry crates-io with
version *`.

```sh
cargo install candid-core --version 0.1.0-beta.3 --locked
candid-core compile ./service.did --envelope > ./service.json
```

`compile --envelope` prints one self-describing document: a `ContractEnvelope`
holding the canonical `contract` plus an `extensions` map whose
`org.candid-core.field-names/v1` entry carries the field-name table. A
semantic Contract stores authoritative field-label *ids*, not text, so names
travel side-band — and envelope extensions live outside the canonical
identities by design, so carrying them never moves a `contract_id`.
`schemaFromContract` consumes the document whole:

```ts
import { readFileSync } from "node:fs";
import { schemaFromContract } from "@candid-core/schema/contract";

const built = schemaFromContract(JSON.parse(readFileSync("./service.json", "utf8")));
if (!built.ok) {
  throw new Error(JSON.stringify(built.issues));
}

built.schemas.Account; // one Schema per declaration, in declaration order
built.actor; // the service schema, when the document has one
```

The two-file flow also works: plain `compile` (no `--envelope`) prints
`{ ok, contract, source_info }`, and the named `[container, id, name]` triples in
`source_info.field_labels` — entries whose `label.kind` is `"named"` — pass as
the `names` option alongside the bare `contract`:

```ts
import { schemaFromContract, type FieldNameEntry } from "@candid-core/schema/contract";

declare const compiled: { contract: unknown };
declare const names: FieldNameEntry[];

schemaFromContract(compiled.contract, { names });
```

Both routes yield verdict-for-verdict identical schemas, and an explicit
`names` option always wins over envelope-carried names — the envelope's table
is then not consulted at all.

Positional and numeric labels carry no name and are skipped; those fields
render by the ecosystem's `_id_` convention, exactly as the generator renders
them. Every name — envelope-carried or caller-supplied alike — is
hash-enforced: it must be the Candid preimage of its id, so a table that lies
fails closed instead of quietly renaming a field. Passing no table at all is
legal and renders every field as `_id_`, which is also what
`compile --no-source-info` leaves you with.

## Calling a canister

`createActor` needs a `Transport`: two methods that move Candid bytes, nothing
more. Identity, ingress expiry, polling, certificate verification, and reject
classification all stay on the agent's side of that pipe, and the agent never
sees a schema. The `@icp-sdk/core` adapter ships compiled and tested as its
own subpath, `./transport-icp`:

```ts
import { c, type Infer } from "@candid-core/schema";
import { createActor } from "@candid-core/schema/actor";
import { httpTransport } from "@candid-core/schema/transport-icp";

const Tokens = c.record({ e8s: c.nat64 });
const Account = c.record({ owner: c.principal, subaccount: c.opt(c.vec(c.nat8)) });

const Ledger = c.service({
  balance_of: c.func([Account], [Tokens], "query"),
  transfer: c.func([Account, Tokens], [c.nat], "update"),
});

type Ledger = {
  balance_of(account: Infer<typeof Account>): Promise<Infer<typeof Tokens>>;
  transfer(to: Infer<typeof Account>, amount: Infer<typeof Tokens>): Promise<bigint>;
};

export const ledger = createActor<Ledger>(
  Ledger,
  "ryjl3-tyaaa-aaaaa-aaaba-cai",
  httpTransport({ host: "https://icp-api.io" }),
);
```

Importing `./transport-icp` is what makes `@icp-sdk/core` a **runtime**
requirement, and the peer range `>= 6` is load-bearing: on v6 `agent.update`
submits, polls to completion, and verifies the certificate in one shot, which
is exactly what the adapter's `call` relies on — older majors resolved at
submission and need their own submit-and-poll adapter, deliberately not
written here. Consumers who never import this subpath need no `@icp-sdk/core`
at all — [the peer](#the-icp-sdk-peer) exists for exactly this module.

`httpTransport` exposes the two knobs a plain consumer needs — `host`, and
`rootKey` for local networks (omit it on mainnet). Everything beyond them —
identity, retries, ingress options — belongs to an agent you build yourself
and pass as `agent`, alone: configuring a supplied agent from the other
options would silently discard what it was built with, so the combination
throws `TypeError`. There is deliberately no logging hook; wrapping the
returned `Transport` composes cleanly.

The actor interface travels explicitly because `c.rec` erases method
structure from a schema's *type* — schemas carry values, not calls — so it
cannot be re-derived from `typeof`. Generated modules emit it as
`export type Actor = { … }`; hand-written it looks like the `Ledger` type
above.

A codec failure rejects the call promise with an `ActorError` carrying the
issues; transport failures propagate untouched, including the plain `Error`
the adapter throws for a rejected query — `` `${methodName} rejected
(${code}): ${message}` ``.

## Unwrapping ok/err results

`variant { ok : T; err : E }` is the universal canister result convention, and
the usual way to unwrap one generically is to probe the decoded *value* for
`ok`/`err` keys — a guess that misfires on any record legitimately carrying
those field names, and one that cannot type the error payload. Whether a reply
*is* a result, and what each arm carries, is a schema fact:

```ts
import { c, type Infer } from "@candid-core/schema";
import { isResultSchema, unwrapResult } from "@candid-core/schema/validate";

const TransferError = c.variant({
  bad_fee: c.record({ expected_fee: c.nat }),
  too_old: c.null,
});
const TransferResult = c.variant({ ok: c.nat, err: TransferError });

isResultSchema(TransferResult); // true
isResultSchema(c.record({ ok: c.bool, err: c.opt(c.text) })); // false: a record is not a variant

declare const reply: unknown; // whatever the call decoded to

const outcome = unwrapResult(TransferResult, reply);
if (outcome.issues) {
  // Not a value of this schema at all: the issues `validate` would report.
  throw new Error(outcome.issues[0].message);
} else if (outcome.ok) {
  const blockIndex: bigint = outcome.value;
  void blockIndex;
} else {
  const failure: Infer<typeof TransferError> = outcome.error;
  void failure;
}
```

Both spellings are recognised, as *pairs*: `ok`/`err`, which Motoko's
`Result.Result` produces, and `Ok`/`Err`, which Rust's candid derive produces
— in either arm order, and with exactly those two arms. A variant that adds a
third arm is not a result, because mapping it onto two states would drop one.
A bare-tag arm (`variant { ok; err : text }`) unwraps to `null`, the single
value of the Candid `null` it declares.

An `err` arm is a value, not an exception: nothing throws for one, and a
malformed value comes back as `{ ok: false, issues }` rather than as an
exception either. A schema that is not a result variant *is* a programmer
error, and throws `TypeError`.

## Support matrix

Measured against the packed tarball — the artifact `npm pack` produces,
extracted and consumed as a dependency — with `@arethetypeswrong/cli` and
direct compiles, not inferred from the manifest.

| | |
| --- | --- |
| TypeScript | **≥ 5.0** |
| `moduleResolution` | `node16`, `nodenext`, `bundler` |
| Module format | **ESM only** — no CommonJS build ships |
| Node, from ESM | **≥ 16** for the seven peer-free subpaths (16.20, 18.20, 20.19, 22.12, 25.9 exercised) |
| Node, for `./transport-icp` | **≥ 20.19** — what the pinned `@icp-sdk/core` tree's own `engines` declare |
| Node, from CommonJS `require()` | **≥ 20.19 / ≥ 22.12**, else `await import()` |
| TypeScript, from a CommonJS project | **≥ 5.8 with `"module": "nodenext"`** |

**TypeScript 5.0** is a hard floor, and it is a *parse* error below it, not a
type error: `c.tuple` is declared with a `const` type parameter — the 5.0
feature that keeps a tuple's element types from widening — so 4.9 stops at
`error TS1139: Type parameter declaration expected.` in `dist/schema.d.ts`
before it type-checks anything.

**`node10` resolution cannot see this package at all.** There is no top-level
`main` or `types` field, only an `exports` map, so every import fails with
`TS2307` — TypeScript's own message tells you to move to `node16`, `nodenext`,
or `bundler`.

**Supporting ESM is not by itself enough for Node.** The build targets ES2020
and does not down-level, so optional chaining and nullish coalescing reach
`dist/` verbatim — they appear in six of the eight modules — and those are
V8 8.0 syntax, which no Node before 14 can parse. The floor above is the
oldest release this package is actually run on rather than the oldest that
might work: 16.20.2 is exercised and passes every peer-free subpath, and
nothing older is claimed. `./transport-icp` is the exception and has its own
row: it is the one subpath that loads `@icp-sdk/core`, whose pinned dependency
tree declares `node >= 20.19.0`, so the peer's floor governs there rather than
this package's syntax.

**From CommonJS**, the two floors are independent. At runtime, `require()` of
an ES module is what Node added in 20.19 and 22.12; below those it throws
`ERR_REQUIRE_ESM`, while `await import("@candid-core/schema")` succeeded on
every version tested. At the type level, a `"type": "commonjs"` project needs
TypeScript 5.8 *and* `"module": "nodenext"` — `"module": "node16"` is pinned
to Node 16 semantics and still refuses with `TS1479` on every compiler tested,
up to and including 7.0.

There is deliberately **no `engines` field**. Both floors are narrow — an
ES2020-capable Node for ESM, a `require(esm)`-capable one for CommonJS — and
enforcing either in install metadata would warn, or fail under
`engine-strict`, for consumers it does not apply to. They are documented here
instead.

## The domain shapes (a deliberate decision)

Types describe the modern domain, not the agent-js runtime shapes: `opt T` is
`T | null` (collapsing opts fail closed at generation), variants are
`{ tag, value }` discriminated unions, anonymous `vec nat8` is `Uint8Array`,
`nat`/`int`/64-bit integers are `bigint`, and principals are the structural
[`PrincipalValue`](#decoded-principal-values) the codec actually delivers.
Compatibility with agent-js value shapes is an explicit non-goal, recorded on
the project's issue tracker.

## Verification

Every release runs a packaged-consumer gate on the commit it publishes from,
before anything is uploaded: the tarball `npm pack` produces at that commit is
extracted into a clean project, compiled under strict TypeScript with
`skipLibCheck` off, and executed — root and every subpath export, a real
encode/validate round-trip. The publish step then builds and uploads from that
same commit. The TypeScript in this file
is compiled by that same gate, against the packed artifact, so an example here
cannot drift away from the package it documents. The codec is additionally
verified in both directions against the reference implementation's own wire
vectors.

## Provenance

Generated bindings, the Contract model, and the conformance gates live in the
[candid-core] repository; this package versions independently (pre-1.0).
[CHANGELOG.md](./CHANGELOG.md) ships in the tarball and records, for every
release, the `candid-core` generator version it pairs with.

[Candid]: https://github.com/dfinity/candid
[candid-core]: https://github.com/b3hr4d/candid-core
