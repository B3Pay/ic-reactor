# @ic-reactor/core

> **ic-reactor 4 is in development on the `v4` branch.** This package is at a
> `4.0.0-alpha` version that is not published: the 3.x runtime was removed so
> that the 4 API can be built on a candid-core generated module, one slice at
> a time (milestone 1,
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

## 3.x

The released 3.x package is documented at https://ic-reactor.b3pay.net/v3/packages/core. Its source and
security fixes live on the `main` branch.
