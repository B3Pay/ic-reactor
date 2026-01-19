# IC Reactor DisplayReactor Demo

This example demonstrates the **automatic type transformation** features of IC Reactor v3. The `DisplayReactor` class provides bidirectional transformations between raw Candid types and user-friendly Display types.

## 🚀 Features Demonstrated

### 1. Reactor vs DisplayReactor

Compare the difference between `Reactor` (raw Candid types) and `DisplayReactor` (display-friendly types):

```typescript
import { ClientManager, Reactor, DisplayReactor } from "@ic-reactor/core"
import { QueryClient } from "@tanstack/query-core"

const queryClient = new QueryClient()
const clientManager = new ClientManager({ queryClient, withProcessEnv: true })

// Raw Reactor - returns Candid types
const rawReactor = new Reactor<Ledger>({
  clientManager,
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
  idlFactory,
})

const rawSupply = await rawReactor.callMethod({
  functionName: "icrc1_total_supply",
})
console.log(typeof rawSupply) // "bigint"
console.log(rawSupply) // 123456789000000000n

// DisplayReactor - returns Display types
const displayReactor = new DisplayReactor<Ledger>({
  clientManager,
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
  idlFactory,
})

const displaySupply = await displayReactor.callMethod({
  functionName: "icrc1_total_supply",
})
console.log(typeof displaySupply) // "string"
console.log(displaySupply) // "123456789000000000"
```

### 2. Automatic Result Unwrapping

Both `Reactor` and `DisplayReactor` automatically unwrap `Result` types:

- **On `Ok`**: Returns the value directly
- **On `Err`**: Throws a `CanisterError`

```typescript
import { DisplayReactor, CanisterError } from "@ic-reactor/core"

const reactor = new DisplayReactor<Ledger>({
  clientManager,
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
  idlFactory,
})

try {
  // Success: you get the value directly!
  const blockIndex = await reactor.callMethod({
    functionName: "icrc1_transfer",
    args: [transferArgs],
  })
  console.log(`Transfer successful! Block: ${blockIndex}`)
  // blockIndex is "12345" (string, not { Ok: 12345n })
} catch (error) {
  // Error: the Err variant is thrown
  if (error instanceof CanisterError) {
    if ("InsufficientFunds" in error.err) {
      console.error("Not enough balance:", error.err.InsufficientFunds.balance)
    }
  }
}
```

### 3. Manual Codec Access

You can access codecs manually for custom transformations:

```typescript
// Get a codec for a specific method
const codec = reactor.getCodec("icrc1_balance_of")

// Transform from Candid → Display
const displayBalance = codec.result.toDisplay(1000000000000n) // "1000000000000"

// Transform from Display → Candid
const candidBalance = codec.result.toCandid("1000000000000") // 1000000000000n
```

## 📊 Type Transformations

| Candid Type                                | TypeScript          | Display                | Notes                      |
| ------------------------------------------ | ------------------- | ---------------------- | -------------------------- |
| `nat`, `int`, `nat64`, `int64`             | `bigint`            | `string`               | Large numbers stay precise |
| `nat8-32`, `int8-32`, `float32`, `float64` | `number`            | `number`               | Small numbers unchanged    |
| `principal`                                | `Principal`         | `string`               | Ready for display          |
| `blob` (≤512 bytes)                        | `Uint8Array`        | `string` (`0x...`)     | Hex encoded                |
| `blob` (>512 bytes)                        | `Uint8Array`        | `Uint8Array`           | Too large for hex          |
| `opt T`                                    | `[] \| [T]`         | `T \| null`            | Cleaner nullability        |
| `vec (text, T)`                            | `Array<[text, T]>`  | `Map<string, T>`       | Key-value pairs            |
| `variant { A }`                            | `{ A: null }`       | `{ _type: "A" }`       | Normalized variants        |
| `Result<Ok, Err>`                          | `{ Ok } \| { Err }` | `Ok` (throws on `Err`) | Auto unwrapping            |

## 🏃 Running the Example

```bash
# From the project root
cd examples/codec-demo

# Install dependencies
pnpm install

# Run the development server
pnpm dev
```

## 📁 File Structure

```
codec-demo/
├── src/
│   ├── main.ts          # Main demo with DisplayReactor examples
│   ├── style.css        # Modern UI styling
│   └── declarations/    # Ledger canister type definitions
│       ├── ledger.js    # IDL factory
│       ├── ledger.d.ts  # Type declarations
│       └── ledger.type.ts # Type definitions
├── index.html           # Demo HTML page
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 🔧 Key Code Patterns

### Creating a DisplayReactor

```typescript
import { ClientManager, DisplayReactor } from "@ic-reactor/core"
import { QueryClient } from "@tanstack/query-core"
import { idlFactory, type Ledger } from "./declarations/ledger"

const queryClient = new QueryClient()

const clientManager = new ClientManager({
  queryClient,
  withProcessEnv: true, // Auto-detect local vs IC network
})

const ledger = new DisplayReactor<Ledger>({
  clientManager,
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
  idlFactory,
  name: "ICP Ledger", // Optional: for debugging
})

// All results are automatically transformed to Display types
const name = await ledger.callMethod({ functionName: "icrc1_name" })
const symbol = await ledger.callMethod({ functionName: "icrc1_symbol" })
const totalSupply = await ledger.callMethod({
  functionName: "icrc1_total_supply",
})

console.log(`${name} (${symbol}): ${totalSupply}`) // ICP (ICP): 123456789000000000
```

### Using Display Types in Arguments

```typescript
import { DisplayOf } from "@ic-reactor/core"
import { TransferArg } from "./declarations/ledger"

// Define args using Display types (strings instead of bigint/Principal)
const displayArgs: DisplayOf<TransferArg> = {
  to: {
    owner: "aaaaa-aa", // string instead of Principal
    subaccount: null, // null instead of []
  },
  amount: "100000000", // string instead of bigint
  fee: null,
  memo: null,
  from_subaccount: null,
  created_at_time: null,
}

// DisplayReactor automatically converts to Candid before sending
const blockIndex = await ledger.callMethod({
  functionName: "icrc1_transfer",
  args: [displayArgs],
})
```

## 🎯 Why Use DisplayReactor?

1. **JSON Compatibility**: `bigint` values can't be serialized to JSON directly. With DisplayReactor, they become strings automatically.

2. **UI Display**: Principal and blob values become readable text instead of opaque objects.

3. **Type Safety**: Full TypeScript support via `DisplayOf<T>` type helper.

4. **Bidirectional**: Transform data in both directions - from backend to frontend and vice versa.

5. **Result Unwrapping**: No need to check for `{ Ok }` or `{ Err }` - it's handled automatically.

## 📚 Learn More

- [IC Reactor Documentation](https://ic-reactor.dev)
- [DisplayReactor Reference](https://ic-reactor.dev/reference/displayreactor)
- [Type Safety Guide](https://ic-reactor.dev/type-safety)
- [Error Handling](https://ic-reactor.dev/error-handling)
