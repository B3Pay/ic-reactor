# MetadataDisplayReactor Guide

> Complete guide to generating dynamic forms and rendering results from Candid interfaces

The **MetadataDisplayReactor** is a powerful system for working with Internet Computer (IC) canisters that provides runtime metadata generation for building dynamic forms and rendering results. It enables you to create form interfaces that adapt to any canister's Candid interface without compile-time type definitions.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Arguments Metadata](#arguments-metadata)
- [Result Metadata](#result-metadata)
- [Format Detection](#format-detection)
- [Usage Examples](#usage-examples)
  - [Basic Setup](#basic-setup)
  - [Building Dynamic Forms](#building-dynamic-forms)
  - [With TanStack Form](#with-tanstack-form)
  - [Rendering Results](#rendering-results)
- [Helper Functions](#helper-functions)
- [API Reference](#api-reference)

## Overview

MetadataDisplayReactor solves a fundamental challenge: **How do you build a UI for a canister when you don't know its interface at compile time?**

It provides:

- 🔍 **Dynamic Candid parsing** - Parse canister interfaces at runtime
- 📝 **Form metadata generation** - Generate comprehensive metadata for building input forms
- 🎨 **Result resolution** - Transform raw canister responses into display-friendly structures
- 🔄 **Type transformations** - Convert between Candid types (bigint, Principal) and UI types (strings)
- ✅ **Validation schemas** - Built-in Zod schemas for each field type

## Quick Start

```typescript
import { ClientManager } from "@ic-reactor/core"
import { createMetadataReactor } from "@ic-reactor/candid"
import { QueryClient } from "@tanstack/query-core"

// Setup
const clientManager = new ClientManager({
  queryClient: new QueryClient(),
  withProcessEnv: true,
})
await clientManager.initialize()

// Create and initialize reactor with factory function
const reactor = await createMetadataReactor({
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
  clientManager,
  name: "ICPLedger",
})

// Get available methods
const methods = reactor.getMethodNames()

// Get form metadata
const inputMeta = reactor.getInputMeta("icrc1_balance_of")

// Call with display types (strings instead of bigint/Principal)
const result = await reactor.callMethod({
  functionName: "icrc1_balance_of",
  args: [{ owner: "aaaaa-aa" }],
})
```

## Architecture

### Class Hierarchy

```
DisplayReactor (from @ic-reactor/core)
    └── CandidDisplayReactor
            └── MetadataDisplayReactor
```

### Design Principles

1. **Visitor Pattern** - Traverses Candid IDL types to generate metadata
2. **Stateless Visitors** - Visitors are reusable and generate metadata at initialization
3. **Form-Framework Agnostic** - Output works with TanStack Form, React Hook Form, or vanilla JS
4. **Display Type Transformations** - `bigint → string`, `Principal → string` for easy UI handling
5. **Lazy Evaluation** - Recursive types use lazy extraction to prevent infinite loops

## Arguments Metadata

When you call `getInputMeta(methodName)`, you receive comprehensive metadata for building input forms:

### ArgumentsMeta Structure

```typescript
interface ArgumentsMeta<A, Name> {
  functionType: "query" | "update"
  functionName: Name
  args: FieldNode[] // One FieldNode per argument
  defaults: unknown[] // Default values for form initialization
  schema: z.ZodTuple // Zod schema for validation
  argCount: number
  isEmpty: boolean // True if method takes no arguments
}
```

### FieldNode Structure

Each `FieldNode` contains everything needed to render a form field:

```typescript
interface FieldNode {
  type: VisitorDataType // "record" | "variant" | "text" | "number" | etc.
  label: string // Raw Candid label (e.g., "__arg0", "owner")
  displayLabel: string // Human-readable label (e.g., "Arg 0", "Owner")
  name: string // TanStack Form path (e.g., "[0]", "[0].owner")
  component: FieldComponentType // Suggested component
  renderHint: RenderHint // UI hints
  defaultValue: unknown // Initial form value
  schema: z.ZodTypeAny // Zod validation schema
  candidType: string // Original Candid type name
  // Plus type-specific extras
}
```

### Field Types

| Type        | Component          | Description                               |
| ----------- | ------------------ | ----------------------------------------- |
| `record`    | `record-container` | Nested object with named fields           |
| `variant`   | `variant-select`   | Discriminated union (like enum with data) |
| `tuple`     | `tuple-container`  | Fixed-length array                        |
| `optional`  | `optional-toggle`  | Nullable field                            |
| `vector`    | `vector-list`      | Dynamic array                             |
| `blob`      | `blob-upload`      | Binary data (vec nat8)                    |
| `recursive` | `recursive-lazy`   | Self-referential type                     |
| `principal` | `principal-input`  | IC Principal                              |
| `text`      | `text-input`       | String                                    |
| `number`    | `number-input`     | Integer or float                          |
| `boolean`   | `boolean-checkbox` | Boolean                                   |
| `null`      | `null-hidden`      | Null type                                 |

### Type-Specific Extras

#### Record

```typescript
interface RecordField {
  type: "record"
  fields: FieldNode[] // Child fields
  defaultValue: Record<string, unknown> // Object default
}
```

#### Variant

```typescript
interface VariantField {
  type: "variant"
  options: FieldNode[] // Option fields
  defaultOption: string // First option key
  defaultValue: Record<string, unknown> // Selected option value
  getOptionDefault(option: string): Record<string, unknown>
  getOption(option: string): FieldNode
  getSelectedKey(value): string
  getSelectedOption(value): FieldNode
}
```

#### Vector

```typescript
interface VectorField {
  type: "vector"
  itemField: FieldNode // Template for items
  defaultValue: unknown[] // Empty array
  getItemDefault(): unknown // New item default
  createItemField(index: number): FieldNode // Create indexed field
}
```

#### Optional

```typescript
interface OptionalField {
  type: "optional"
  innerField: FieldNode // Inner type field
  defaultValue: null // Always null
  getInnerDefault(): unknown // Get inner default when enabling
  isEnabled(value): boolean // Check if value is set
}
```

#### Number

```typescript
interface NumberField {
  type: "number"
  unsigned: boolean // nat vs int
  isFloat: boolean // float32/64
  bits?: number // 8, 16, 32, 64
  min?: string // Min value as string
  max?: string // Max value as string
  format: NumberFormat // "timestamp" | "cycle" | "normal"
  inputProps: PrimitiveInputProps
}
```

#### Text

```typescript
interface TextField {
  type: "text"
  minLength?: number
  maxLength?: number
  multiline?: boolean
  format: TextFormat // "email" | "url" | "phone" | "plain" | etc.
  inputProps: PrimitiveInputProps
}
```

## Result Metadata

### MethodMeta Structure

When you call `getOutputMeta(methodName)`:

```typescript
interface MethodMeta<A, Name> {
  functionType: FunctionType
  functionName: Name
  returns: ResultNode[] // Schema for return values
  returnCount: number
  resolve(data): MethodResult<A> // Transform raw → display
}
```

### ResultNode Structure

```typescript
interface ResultNode {
  type: VisitorDataType // Same types as arguments
  label: string // Field label
  displayLabel: string // Human-readable label
  candidType: string // Original Candid type
  displayType: DisplayType // "string" | "number" | "object" | etc.
  resolve(data): ResolvedNode // Transform raw value
}
```

### Display Types

| DisplayType | Description                                |
| ----------- | ------------------------------------------ |
| `string`    | Text, Principal, large numbers (as string) |
| `number`    | Small integers, floats                     |
| `boolean`   | Boolean values                             |
| `null`      | Null values                                |
| `object`    | Records                                    |
| `array`     | Vectors, Tuples                            |
| `variant`   | Variant types                              |
| `result`    | Special case for `Ok`/`Err` variants       |
| `nullable`  | Optional types                             |
| `blob`      | Binary data with hash                      |
| `func`      | Function references (canister ID + method) |

### Resolution Example

```typescript
// Raw canister response
const rawResult = { Ok: 1000000000n } // bigint

// Get metadata
const meta = reactor.getOutputMeta("icrc1_transfer")

// Resolve to display types
const resolved = meta.resolve(rawResult)
// resolved = {
//   functionType: "update",
//   functionName: "icrc1_transfer",
//   results: [{
//     type: "variant",
//     selected: "Ok",
//     selectedValue: {  // The resolved value of the selected option
//       type: "number",
//       value: "1000000000",  // String, not bigint!
//       displayType: "string"
//     },
//     raw: { Ok: 1000000000n }
//   }],
//   raw: { Ok: 1000000000n }
// }
```

### Func Reference Resolution

Candid `func` types can appear as data fields in records, commonly seen in callback references like those returned by `get_transactions` on ICRC-1 ledgers:

```typescript
// Raw canister response with func reference
const rawResult = {
  transactions: [...],
  archived_transactions: [{
    start: 0n,
    length: 100n,
    callback: [Principal.fromText("sa4so-piaaa-aaaar-qacnq-cai"), "get_transactions"]
  }]
}

// The callback field is resolved to:
{
  type: "func",
  displayType: "func",
  canisterId: "sa4so-piaaa-aaaar-qacnq-cai",
  methodName: "get_transactions",
  raw: [Principal, "get_transactions"]
}
```

## Format Detection

The system automatically detects formats from field labels:

### Text Formats

| Format       | Detected From                                 |
| ------------ | --------------------------------------------- |
| `timestamp`  | `created_at`, `updated_at`, `timestamp_nanos` |
| `email`      | `email`, `mail`                               |
| `url`        | `url`, `link`, `website`                      |
| `phone`      | `phone`, `tel`, `mobile`                      |
| `uuid`       | `uuid`, `guid`                                |
| `btc`        | `btc`, `bitcoin`                              |
| `eth`        | `eth`, `ethereum`                             |
| `principal`  | `principal`, `canister`                       |
| `account-id` | `account_identifier`, `ledger_account`        |

### Number Formats

| Format      | Detected From                |
| ----------- | ---------------------------- |
| `timestamp` | `time`, `date`, `created_at` |
| `cycle`     | `cycle`, `cycles`            |
| `normal`    | Everything else              |

## Usage Examples

### Basic Setup

```typescript
import { ClientManager } from "@ic-reactor/core"
import {
  createMetadataReactor,
  MetadataDisplayReactor,
} from "@ic-reactor/candid"
import { QueryClient } from "@tanstack/query-core"

// 1. Create client manager
const clientManager = new ClientManager({
  queryClient: new QueryClient(),
  withProcessEnv: true,
})
await clientManager.initialize()

// Option 1: Use factory function (recommended)
const reactor = await createMetadataReactor({
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
  clientManager,
  name: "ICPLedger",
})

// Option 2: Manual initialization
const reactor2 = new MetadataDisplayReactor({
  canisterId: "ryjl3-tyaaa-aaaaa-aaaba-cai",
  clientManager,
  name: "ICPLedger",
})
await reactor2.initialize()

// Get available methods
const methods = reactor.getMethodNames()
console.log(methods) // ["icrc1_balance_of", "icrc1_transfer", ...]
```

### Building Dynamic Forms

```typescript
// Get input metadata for a method
const inputMeta = reactor.getInputMeta("icrc1_transfer")

console.log(inputMeta.functionName) // "icrc1_transfer"
console.log(inputMeta.functionType) // "update"
console.log(inputMeta.argCount) // 1
console.log(inputMeta.defaults) // [{ to: { owner: "", ... }, ... }]

// Iterate over args to build form
for (const field of inputMeta.args) {
  console.log(field.type) // "record"
  console.log(field.displayLabel) // "Arg 0"
  console.log(field.component) // "record-container"

  // For records, access nested fields
  if (field.type === "record") {
    for (const childField of field.fields) {
      console.log(childField.name) // "[0].to", "[0].amount"
      console.log(childField.displayLabel) // "To", "Amount"
    }
  }
}
```

### With TanStack Form

```tsx
import { useForm } from "@tanstack/react-form"
import { isFieldType } from "@ic-reactor/candid"

// Get metadata
const inputMeta = reactor.getInputMeta("icrc1_transfer")

// Create form
const form = useForm({
  defaultValues: inputMeta.defaults,
  validators: { onBlur: inputMeta.schema },
  onSubmit: async ({ value }) => {
    const result = await reactor.callMethod({
      functionName: "icrc1_transfer",
      args: value,
    })
    console.log(result)
  },
})

// Dynamic field renderer
function DynamicFieldInput({ field, fieldApi }) {
  if (isFieldType(field, "record")) {
    return (
      <fieldset>
        <legend>{field.displayLabel}</legend>
        {field.fields.map((childField, i) => (
          <fieldApi.Field key={i} name={childField.label}>
            {(childApi) => (
              <DynamicFieldInput field={childField} fieldApi={childApi} />
            )}
          </fieldApi.Field>
        ))}
      </fieldset>
    )
  }

  if (isFieldType(field, "variant")) {
    const selectedKey = field.getSelectedKey(fieldApi.state.value)
    return (
      <div>
        <label>{field.displayLabel}</label>
        <select
          value={selectedKey}
          onChange={(e) => {
            fieldApi.handleChange(field.getOptionDefault(e.target.value))
          }}
        >
          {field.options.map((opt) => (
            <option key={opt.label} value={opt.label}>
              {opt.displayLabel}
            </option>
          ))}
        </select>
      </div>
    )
  }

  if (isFieldType(field, "optional")) {
    const isEnabled = field.isEnabled(fieldApi.state.value)
    return (
      <div>
        <label>
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => {
              fieldApi.handleChange(
                e.target.checked ? field.getInnerDefault() : null
              )
            }}
          />
          {field.displayLabel}
        </label>
        {isEnabled && (
          <DynamicFieldInput field={field.innerField} fieldApi={fieldApi} />
        )}
      </div>
    )
  }

  // Primitive types
  if (isFieldType(field, "text") || isFieldType(field, "principal")) {
    return (
      <div>
        <label>{field.displayLabel}</label>
        <input
          {...field.inputProps}
          value={fieldApi.state.value ?? ""}
          onChange={(e) => fieldApi.handleChange(e.target.value)}
        />
      </div>
    )
  }

  if (isFieldType(field, "number")) {
    return (
      <div>
        <label>{field.displayLabel}</label>
        <input
          {...field.inputProps}
          value={fieldApi.state.value ?? ""}
          onChange={(e) => fieldApi.handleChange(e.target.value)}
        />
      </div>
    )
  }

  if (isFieldType(field, "boolean")) {
    return (
      <label>
        <input
          type="checkbox"
          checked={fieldApi.state.value ?? false}
          onChange={(e) => fieldApi.handleChange(e.target.checked)}
        />
        {field.displayLabel}
      </label>
    )
  }

  return <span>Unsupported: {field.type}</span>
}

// Usage
function Form() {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
    >
      {inputMeta.args.map((field, index) => (
        <form.Field key={index} name={`[${index}]`}>
          {(fieldApi) => (
            <DynamicFieldInput field={field} fieldApi={fieldApi} />
          )}
        </form.Field>
      ))}
      <button type="submit">Submit</button>
    </form>
  )
}
```

### Rendering Results

```tsx
// Call method and get resolved result
const result = await reactor.callMethod({
  functionName: "icrc1_balance_of",
  args: [{ owner: "aaaaa-aa" }],
})

// result is automatically resolved
console.log(result)
// {
//   functionType: "query",
//   functionName: "icrc1_balance_of",
//   results: [{ type: "number", value: "1000000000", ... }],
//   raw: 1000000000n
// }

// Render results
function ResultNode({ node }) {
  switch (node.displayType) {
    case "string":
    case "number":
      return (
        <div>
          <strong>{node.label}:</strong> {node.value}
        </div>
      )

    case "boolean":
      return (
        <div>
          <strong>{node.label}:</strong> {node.value ? "Yes" : "No"}
        </div>
      )

    case "null":
      return (
        <div>
          <strong>{node.label}:</strong> <em>null</em>
        </div>
      )

    case "object":
      return (
        <div>
          <strong>{node.label}:</strong>
          <div style={{ marginLeft: 20 }}>
            {Object.entries(node.fields).map(([key, field]) => (
              <ResultNode key={key} node={field} />
            ))}
          </div>
        </div>
      )

    case "array":
      return (
        <div>
          <strong>{node.label}:</strong>
          <ul>
            {node.items.map((item, i) => (
              <li key={i}>
                <ResultNode node={item} />
              </li>
            ))}
          </ul>
        </div>
      )

    case "result":
    case "variant":
      return (
        <div>
          <strong>{node.label}:</strong> <em>{node.selected}</em>
          <div style={{ marginLeft: 20 }}>
            <ResultNode node={node.selectedValue} />
          </div>
        </div>
      )

    case "nullable":
      if (node.value === null) {
        return (
          <div>
            <strong>{node.label}:</strong> <em>not set</em>
          </div>
        )
      }
      return <ResultNode node={node.value} />

    case "blob":
      return (
        <div>
          <strong>{node.label}:</strong>
          <code>
            {node.length} bytes (hash: {node.hash.slice(0, 16)}...)
          </code>
        </div>
      )

    case "func":
      return (
        <div>
          <strong>{node.label}:</strong>
          <span>
            Callback: {node.canisterId}.{node.methodName}()
          </span>
        </div>
      )

    default:
      return <pre>{JSON.stringify(node.raw, null, 2)}</pre>
  }
}
```

## Helper Functions

```typescript
import {
  isFieldType,
  isCompoundField,
  isPrimitiveField,
  hasChildFields,
  hasOptions,
  formatLabel,
} from "@ic-reactor/candid"

// Type guards
if (isFieldType(field, "record")) {
  // field is typed as RecordField
}

if (isCompoundField(field)) {
  // field is record | variant | tuple | optional | vector | recursive
}

if (isPrimitiveField(field)) {
  // field is principal | number | text | boolean | null
}

if (hasChildFields(field)) {
  // field has .fields array (record, tuple)
}

if (hasOptions(field)) {
  // field has .options array (variant)
}

// Label formatting
formatLabel("__arg0") // "Arg 0"
formatLabel("_0_") // "Item 0"
formatLabel("created_at") // "Created At"
formatLabel("userAddress") // "User Address"
```

## API Reference

### MetadataDisplayReactor

| Method                         | Description                                    |
| ------------------------------ | ---------------------------------------------- |
| `initialize()`                 | Parse Candid and generate metadata             |
| `getMethodNames()`             | Get list of available method names             |
| `getInputMeta(name)`           | Get input form metadata for a method           |
| `getOutputMeta(name)`          | Get output display metadata for a method       |
| `getAllInputMeta()`            | Get input metadata for all methods             |
| `getAllOutputMeta()`           | Get output metadata for all methods            |
| `registerMethod(options)`      | Register a dynamic method at runtime           |
| `callMethod(options)`          | Call a method with display type transformation |
| `callDynamicWithMeta(options)` | Register, call, and return metadata            |

### Factory Function

```typescript
// Recommended way to create a reactor
const reactor = await createMetadataReactor(options)
```

### Constructor Options

```typescript
interface CandidDisplayReactorParameters<A> {
  canisterId: string
  clientManager: ClientManager
  name?: string
  candid?: string // Optional: provide Candid source directly
  adapter?: CandidAdapter
}
```

### FieldNode Properties

| Property       | Type                 | Description                     |
| -------------- | -------------------- | ------------------------------- |
| `type`         | `VisitorDataType`    | Field type identifier           |
| `label`        | `string`             | Raw Candid label                |
| `displayLabel` | `string`             | Human-readable label            |
| `name`         | `string`             | Form path (TanStack compatible) |
| `component`    | `FieldComponentType` | Suggested component             |
| `renderHint`   | `RenderHint`         | UI rendering hints              |
| `defaultValue` | `unknown`            | Initial value                   |
| `schema`       | `z.ZodTypeAny`       | Validation schema               |
| `candidType`   | `string`             | Original Candid type            |

### ResultNode Properties

| Property        | Type              | Description              |
| --------------- | ----------------- | ------------------------ |
| `type`          | `VisitorDataType` | Node type identifier     |
| `label`         | `string`          | Field label              |
| `displayLabel`  | `string`          | Human-readable label     |
| `candidType`    | `string`          | Original Candid type     |
| `displayType`   | `DisplayType`     | Display category         |
| `resolve(data)` | `Function`        | Transform raw to display |

## License

MIT
