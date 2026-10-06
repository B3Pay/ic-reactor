# @ic-reactor/core

> **ic-reactor 4 is a prerelease.** `4.0.0-beta.2` is published under npm's
> `beta` dist-tag, and `latest` stays 3.x until 4.0 GA: install it as
> `@ic-reactor/core@beta`. It replaces the 3.x runtime with a thin layer over a
> candid-core generated module (milestone 1,
> [#790](https://github.com/B3Pay/ic-reactor/issues/790)).

[![npm version](https://img.shields.io/npm/v/@ic-reactor/core.svg)](https://www.npmjs.com/package/@ic-reactor/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)](https://www.typescriptlang.org/)

ic-reactor 4 is a thin layer over a `candid-core-cli gen` module: a client with
caller-scoped query keys, one error union that says whether a call may have
executed, network resolution, strict token-unit helpers and a test client.

**The guide is [`llms.txt`](./llms.txt)**, shipped in this package
(`node_modules/@ic-reactor/core/llms.txt`): setup, values, reads, writes,
errors and a complete React example, for people and coding agents alike.

## Install

```bash
npm install @ic-reactor/core@beta @icp-sdk/core @tanstack/query-core
npm install --save-exact @candid-core/schema@0.3.0
```

`@candid-core/schema` is a peer at exactly that version: the module
`candid-core-cli gen` writes imports it, so the generator
(`@candid-core/cli@0.2.0`) has to pair with it too.

## 3.x

The released 3.x package is documented at https://ic-reactor.b3pay.net/v3/packages/core. Its source and
security fixes live on the `main` branch.
