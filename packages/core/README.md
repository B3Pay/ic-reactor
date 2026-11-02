# @ic-reactor/core

> **This is ic-reactor 4.** It replaces the 3.x runtime with a thin layer over
> a module Meant generates. 3.x is documented at
> https://ic-reactor.b3pay.net/v3/packages/core and takes security fixes until
> 90 days after the 4.0 release.

[![npm version](https://img.shields.io/npm/v/@ic-reactor/core.svg)](https://www.npmjs.com/package/@ic-reactor/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)](https://www.typescriptlang.org/)

ic-reactor 4 is a thin layer over a `meant gen` module: a client with
caller-scoped query keys, one error union that says whether a call may have
executed, network resolution, strict token-unit helpers and a test client.

**The guide is [`llms.txt`](./llms.txt)**, shipped in this package
(`node_modules/@ic-reactor/core/llms.txt`): setup, values, reads, writes,
errors and a complete React example, for people and coding agents alike. The
docs site covers the same ground in pages, starting with
[Getting started](https://ic-reactor.b3pay.net/v4/guides/getting-started/),
and [this package's page](https://ic-reactor.b3pay.net/v4/packages/core/)
lists its exports and peers.

## Install

```bash
npm install @ic-reactor/core @icp-sdk/core @tanstack/query-core
npm install --save-exact @meantjs/schema@0.6.0
npm install --save-dev --save-exact @meantjs/cli@0.5.0
```

`@meantjs/schema` is a peer at exactly that version: the module `meant gen`
writes imports it, so the generator (`@meantjs/cli@0.5.0`) has to pair with it
too. Install the CLI at that version: without a version, npm installs the
newest CLI, and when that one pairs with another schema, npm stops with
`ERESOLVE`.

With React, install `@tanstack/query-core` at the exact version your
`@tanstack/react-query` depends on (`npm view @tanstack/react-query@<version>
dependencies`), and check that `npm ls @tanstack/query-core` shows one copy.
With two copies, core and the hooks each have their own `skipToken`:
`client.queryOptions()` throws a `TypeError` for the hooks' one, and in
development `ReactorProvider` throws when it is handed such a client.

## A first read

Generate a module from the canister's `.did` file, here the ICRC-1 ledger's
`icrc1.did`:

```bash
npx @meantjs/cli gen icrc1.did -o src/generated
```

Then call the canister. A client with `identity: "anonymous"` only reads, and
amounts are `bigint` in base units:

```ts
// src/read.ts
import { createClient, formatUnits } from "@ic-reactor/core"
import { actor, type Actor } from "./generated/icrc1"

const client = createClient({ network: "ic", identity: "anonymous" })
const ledger = client.canister<Actor>(actor, {
  id: "ryjl3-tyaaa-aaaaa-aaaba-cai", // the ICP ledger
})

const fee = await ledger.icrc1_fee() // 10000n
console.log(formatUnits(fee, await ledger.icrc1_decimals())) // "0.0001"
```

Run it with `npx tsx src/read.ts`, in a package with `"type": "module"`: the
package is an ES module only, and the script uses top-level `await`.

Reads and writes through TanStack Query, sign-in, errors and the test client
are in the guide and on the docs site.
[`@ic-reactor/react`](https://www.npmjs.com/package/@ic-reactor/react) is the
React bindings, and
[`@ic-reactor/vite-plugin`](https://www.npmjs.com/package/@ic-reactor/vite-plugin)
generates the module in a Vite app.

## 3.x

The released 3.x package is documented at https://ic-reactor.b3pay.net/v3/packages/core. Its source and
security fixes live on the `v3` branch.
