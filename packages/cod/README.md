# @ic-reactor/cod (Candid Object Definition)

**COD** (**Candid Object Definition**) is a Zod-inspired, type-safe runtime schema builder and codec library for the Internet Computer (IC), designed as a core component of the **IC Reactor v4** framework.

Just as **Zod** defines JavaScript and TypeScript schemas, **COD** lets you define **Candid** interfaces programmatically in TypeScript. It performs dual roles at runtime:

1. **Compiles to Standard IDL**: Generates spec-compliant `IDL.InterfaceFactory` structures compatible with `@dfinity/agent` / `@icp-sdk`.
2. **Generates Introspectable Manifests**: Produces structured JSON descriptions of your types and methods—ideal for forms, documentation generators, and dynamic UI renderers.

---

## Features

- **Zod-like API**: Familiar chainable API for building primitive and complex Candid structures.
- **Static Type Inference**: Infer native TypeScript types directly from your codec definitions using `c.infer<typeof Codec>`.
- **Canister Services**: Declare query, update, and oneway method signatures directly.
- **Metadata Chaining**: Attach descriptions, human-readable labels, and mock examples to your fields in an immutable, chainable fashion.
- **Spec-Compliant**: Built on top of `@icp-sdk/core` type representations.

---

## Installation

```sh
pnpm add @ic-reactor/cod
```

---

## Getting Started

### 1. Define Composite Types

Using the `c` namespace, you can declare complex structures like records, variants, options, vectors, and tuples:

```ts
import { c } from "@ic-reactor/cod"

// Declare a type-safe record schema
export const Account = c.record({
  owner: c.principal().describe("The Principal identity of the account owner"),
  subaccount: c.opt(c.blob()).label("Subaccount Bytes"),
})

// Infer the static TypeScript type
// Output type: { owner: Principal; subaccount: [] | [Uint8Array | number[]] }
export type Account = c.infer<typeof Account>

// Declare a variant type
export const TransferResult = c.variant({
  Ok: c.nat().describe("Transaction index block"),
  Err: c.text().describe("Error reason description"),
})

export type TransferResult = c.infer<typeof TransferResult>
```

### 2. Declare Canister Services

Attach query, update, or oneway methods to a top-level service schema:

```ts
export const LedgerService = c.service({
  icrc1_balance_of: c.query([Account], c.nat()),
  icrc1_transfer: c.update(
    // Arguments: Account destination, amount, and optional memo
    [
      c.record({
        to: Account,
        amount: c.nat(),
        memo: c.opt(c.blob()),
      }),
    ],
    TransferResult
  ),
  notify_mint: c.oneway([c.principal()]), // Oneway methods have no return type
})

// Infer the full actor method interface
export type LedgerService = c.ServiceOf<typeof LedgerService>
```

### 3. Usage & Interoperability

Once defined, you can compile the service to an `idlFactory` or inspect its manifest:

```ts
// A. Pass to `@dfinity/agent` or `@ic-reactor/core` Actor creators
const idlFactory = LedgerService.idlFactory

// B. Introspect the Candid service structure dynamically (e.g. for dynamic form generators)
const manifest = LedgerService.manifest()
console.log(JSON.stringify(manifest, null, 2))
```

---

## Metadata Chaining (Immutable)

Every codec inherits helper methods that allow you to attach rich UI/documentation context. Chaining always returns a **new, immutable** copy:

```ts
const nameCodec = c
  .text()
  .describe("The user's full display name")
  .label("Full Name")
  .example("Alice Vance")

console.log(nameCodec.metadata.description) // "The user's full display name"
console.log(nameCodec.metadata.label) // "Full Name"
console.log(nameCodec.metadata.examples) // ["Alice Vance"]
```

---

## Supported Types Map

| Candid Type       | COD Constructor      | Runtime JS/TS Type       |
| ----------------- | -------------------- | ------------------------ |
| `text`            | `c.text()`           | `string`                 |
| `bool`            | `c.bool()`           | `boolean`                |
| `nat`             | `c.nat()`            | `bigint`                 |
| `nat8`            | `c.nat8()`           | `number`                 |
| `nat16`           | `c.nat16()`          | `number`                 |
| `nat32`           | `c.nat32()`          | `number`                 |
| `nat64`           | `c.nat64()`          | `bigint`                 |
| `int`             | `c.int()`            | `bigint`                 |
| `int8`            | `c.int8()`           | `number`                 |
| `int16`           | `c.int16()`          | `number`                 |
| `int32`           | `c.int32()`          | `number`                 |
| `int64`           | `c.int64()`          | `bigint`                 |
| `float32`         | `c.float32()`        | `number`                 |
| `float64`         | `c.float64()`        | `number`                 |
| `principal`       | `c.principal()`      | `Principal`              |
| `null`            | `c.null()`           | `null`                   |
| `reserved`        | `c.reserved()`       | `any`                    |
| `empty`           | `c.empty()`          | `never`                  |
| `blob`            | `c.blob()`           | `Uint8Array \| number[]` |
| `opt T`           | `c.opt(T)`           | `[] \| [T]`              |
| `vec T`           | `c.vec(T)`           | `T[]`                    |
| `record { ... }`  | `c.record({ ... })`  | `Record<string, T>`      |
| `variant { ... }` | `c.variant({ ... })` | Union of `{ Arm: T }`    |
| `tuple { A; B }`  | `c.tuple([A, B])`    | `[A, B]`                 |
