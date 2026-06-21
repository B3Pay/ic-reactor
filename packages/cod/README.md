# @ic-reactor/cod

Zod-inspired Candid codec API for the Internet Computer, designed for IC Reactor v4.

## Installation

```sh
pnpm add @ic-reactor/cod
```

## Usage

```ts
import { c } from "@ic-reactor/cod"

export const Account = c.record({
  owner: c.principal(),
  subaccount: c.opt(c.blob()),
})

export type Account = c.infer<typeof Account>
```
