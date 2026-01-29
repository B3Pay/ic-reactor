---
title: fromZodSchema
editUrl: false
next: true
prev: true
---

> **fromZodSchema**\<`T`\>(`schema`): [`Validator`](../type-aliases/Validator.md)\<`T`[]\>

Defined in: [utils/zod.ts:28](https://github.com/B3Pay/ic-reactor/blob/4d02e8d8d928d42fa1d6f6a89a0eba4531459b4e/packages/core/src/utils/zod.ts#L28)

Create a validator from a Zod schema.
This is a utility function to easily integrate Zod schemas as validators.

## Type Parameters

### T

`T`

## Parameters

### schema

A Zod schema to validate against

#### safeParse

(`data`) => `object`

## Returns

[`Validator`](../type-aliases/Validator.md)\<`T`[]\>

A Validator function compatible with DisplayReactor

## Example

```typescript
import { z } from "zod"
import { fromZodSchema } from "@ic-reactor/core"

const transferSchema = z.object({
  to: z.string().min(1, "Recipient is required"),
  amount: z.string().regex(/^\d+$/, "Must be a valid number"),
})

reactor.registerValidator("transfer", fromZodSchema(transferSchema))
```
