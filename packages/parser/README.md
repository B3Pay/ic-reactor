# @ic-reactor/parser

A high-performance **WASM-based parser** for the DFINITY Candid language, built for the `ic-reactor` ecosystem.

This package compiles Candid interface definitions (`.did` files) into JavaScript and TypeScript bindings directly in the browser or Node.js environment, without needing to interact with a remote canister.

## Features

- **Blazing Fast**: Built with Rust and compiled to WebAssembly.
- **Offline Capable**: Parse Candid strings entirely on the client side.
- **Zero Dependencies**: Does not rely on the `didjs` canister.
- **Universal**: Works in the browser and Node.js.

## Installation

```bash
npm install @ic-reactor/parser
```

## Usage

### Converting Candid to JavaScript

```typescript
import { didToJs } from "@ic-reactor/parser"

const candid = `service : {
  greet : (text) -> (text) query;
}`

const jsCode = didToJs(candid)
console.log(jsCode)
```

**Output:**

```javascript
export const idlFactory = ({ IDL }) => {
  return IDL.Service({ greet: IDL.Func([IDL.Text], [IDL.Text], ["query"]) })
}
export const init = ({ IDL }) => {
  return []
}
```

### Converting Candid to TypeScript

```typescript
import { didToTs } from "@ic-reactor/parser"

const tsCode = didToTs(candid)
console.log(tsCode)
```

**Output:**

```typescript
import type { Principal } from "@icp-sdk/core/principal"
import type { ActorMethod } from "@icp-sdk/core/agent"
import type { IDL } from "@icp-sdk/core/candid"

export interface _SERVICE {
  greet: ActorMethod<[string], string>
}
export declare const idlFactory: IDL.InterfaceFactory
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[]
```

## Integration with IC-Reactor

This package is used internally by `@ic-reactor/candid` and `@ic-reactor/core` to enable local parsing strategies.

```typescript
import { createCandidAdapter } from "@ic-reactor/core"
// The parser is dynamically imported if available
```

## License

MIT
