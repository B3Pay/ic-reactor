**Title:** Update: Dynamic Canister Interactions & One-Shot Calls in v3 Beta

Hey everyone! 👋

Following up on the v3 beta announcement, I'm excited to share a major addition to the library: **Dynamic Candid Support**.

We realized that while type-safety is amazing for your own canisters, sometimes you need to interact with 3rd-party canisters, build explorers, or create generic tools where you don't have the IDL files at compile time.

We've added a new package `@ic-reactor/candid` that lets you do exactly that.

### 1. Dynamic Actor Creation

You can now initialize a reactor by simply providing the Candid string (or letting it fetch from the network automatically).

```typescript
import { CandidReactor } from "@ic-reactor/candid"

// Option A: Fetch IDL from the network automatically
const reactor = new CandidReactor({
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai", // ICP Ledger
  clientManager,
})
await reactor.initialize()

// Option B: Provide Candid string directly
const reactor = new CandidReactor({
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
  clientManager,
  candid: `service : {
    icrc1_balance_of : (record { owner : principal }) -> (nat) query;
  }`,
})
await reactor.initialize()
```

Once initialized, **all standard Reactor features work automatically**—including TanStack Query caching (`fetchQuery`), hooks, and type safety (generic types).

### 2. One-Shot Dynamic Calls

If you just need to make a single call without setting up a full reactor, we added "One-Shot" methods. These register the method signature on-the-fly and execute the call in one step.

**Query with caching (TanStack Query):**

```typescript
const balance = await reactor.fetchQueryDynamic({
  functionName: "icrc1_balance_of",
  candid: "(record { owner : principal }) -> (nat) query",
  args: [{ owner: Principal.fromText("...") }],
})
```

**Direct Query:**

```typescript
const symbol = await reactor.queryDynamic({
  functionName: "icrc1_symbol",
  candid: "() -> (text) query",
})
```

**Update Call:**

```typescript
const result = await reactor.callDynamic({
  functionName: "transfer",
  candid:
    "(record { to : principal; amount : nat }) -> (variant { Ok : nat; Err : text })",
  args: [{ to: recipient, amount: 100n }],
})
```

### Why this matters

This completely removes the need for `didc` or code generation steps when building generic tools or quick scripts. You can literally just paste a Candid signature string and start interacting with the blockchain.

The documentation for these new packages is now live:
[https://b3pay.github.io/ic-reactor/v3/packages/candid/](https://b3pay.github.io/ic-reactor/v3/packages/candid/)

We'd love to hear your thoughts on this approach!
