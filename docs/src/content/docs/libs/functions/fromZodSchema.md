---
title: fromZodSchema
editUrl: false
next: true
prev: true
---

> **fromZodSchema**\<`T`\>(`schema`): [`Validator`](../type-aliases/Validator.md)\<`T`[]\>

Defined in: [display-reactor.ts:440](https://github.com/B3Pay/ic-reactor/blob/7036734963f96dc0d6af031acb9e17758f8a7cd1/packages/core/src/display-reactor.ts#L440)

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
