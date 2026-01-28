# Argument Field Visitor

The `ArgumentFieldVisitor` traverses Candid IDL types to generate two things:

1. **Field Metadata**: Structure, labels, names (for form binding), and default values for rendering form fields.
2. **Validation Schema**: A Zod schema for validating form inputs.

## Usage

### 1. Initialize the Visitor

```typescript
import { ArgumentFieldVisitor } from "@ic-reactor/candid"
import { IDL } from "@icp-sdk/core/candid"

const visitor = new ArgumentFieldVisitor()
```

### 2. Generate Metadata & Schema

You can visit a single function or an entire service.

#### For a Service

```typescript
const serviceMeta = visitor.visitService(idlFactory({ IDL }))
const transferMeta = serviceMeta["icrc1_transfer"]

console.log(transferMeta)
// Output:
// {
//   functionName: "icrc1_transfer",
//   functionType: "update",
//   fields: [...],        // Field definitions for rendering
//   defaultValues: [...], // Default values for the form (array of argument defaults)
//   schema: ZodSchema,    // Zod schema for validation
//   argCount: 1,          // Number of arguments
//   isNoArgs: false       // Whether the function takes no arguments
// }
```

#### For a Single Function

```typescript
const funcType = IDL.Func([IDL.Text, IDL.Nat], [], [])
const meta = visitor.visitFunc(funcType, "myMethod")
```

### 3. Field Properties

Each field in `meta.fields` has the following properties:

```typescript
{
  type: "text" | "number" | "boolean" | "principal" | "record" | "variant" | ...,
  label: "fieldName",           // Human-readable label
  name: "[0].field.nested",     // TanStack Form compatible path
  defaultValue: ...,            // Default value for this field
  schema: ZodSchema,            // Zod schema for this field
  candidType: "text",           // Original Candid type
  ui: {                         // Optional UI hints
    placeholder: "e.g. 100",
  },
  // Type-specific properties:
  // - For "number" fields (Nat8, Int32, Float): min, max, unsigned, isFloat, bits
  // - For "text" fields (Nat, Int, Nat64): (handled as text for BigInt support)
  // - For variants: options, optionMap, getOptionDefault()
  // - For vectors: itemField, getItemDefault()
  // - For optionals: innerField, getInnerDefault()
  // - For records: fields, fieldMap
}
```

### 4. Special Handling & Validation

#### BigInts as Text

Large integer types (`Nat`, `Int`, `Nat64`, `Int64`, `Nat32` > 32-bit representations) are generated with `type: "text"`.

- **Reason**: Standard JavaScript numbers lose precision for values > `2^53 - 1`. HTML number inputs can be unreliable for large integers.
- **Validation**: The Zod schema strictly validates these as **strings containing only digits** (or sign for signed types).
- **Label**: They retain their `candidType` (e.g. `nat`) for reference.

#### Strict Validation

- **Required Fields**: Text and Number fields include `.min(1, "Required")`. Empty strings are rejected.
  - **Integers**: Regex validation ensures only digits (no decimals).
  - **Floats**: Float32/Float64 allow decimal points (e.g., `123.1`) and are validated using standard `!isNaN(Number(val))`.
- **Principals**: Validated using `Principal.fromText()`. Empty strings are rejected.

#### Optional Fields

- **Behavior**: Optional fields (`Opt`) wrap the inner schema.
- **Empty Handling**: An empty string input (`""`) is automatically transformed to `null` (Candid `null` / `None`), ensuring optional fields can be cleared.

### 5. Integration with TanStack Form

The visitor is optimized for standard form libraries like TanStack Form.

```tsx
import { useForm } from "@tanstack/react-form"

function MethodForm({ meta }) {
  const form = useForm({
    defaultValues: meta.defaultValues,
    validators: {
      onChange: meta.schema, // Use generated Zod schema for validation
    },
    onSubmit: async ({ value }) => {
      console.log("Structured Data:", value)
      // value is ready to be passed to strict Candid adapters
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
    >
      {meta.fields.map((field) => (
        <form.Field key={field.name} name={field.name}>
          {(fieldApi) => (
            <div>
              <label>{field.label}</label>
              <input
                type={
                  field.type === "text" || field.type === "principal"
                    ? "text"
                    : field.type
                }
                value={fieldApi.state.value}
                onChange={(e) => fieldApi.handleChange(e.target.value)}
                placeholder={field.ui?.placeholder}
              />
              {fieldApi.state.meta.errors.map((err) => (
                <span key={err} className="error">
                  {err}
                </span>
              ))}
            </div>
          )}
        </form.Field>
      ))}
      <button type="submit">Submit</button>
    </form>
  )
}
```

### 6. Dynamic Fields

For **Vectors** and **Variants**, you can access helper paths dynamically:

- **Vector**: Field name `items` -> Item name `items[0]`, `items[1]`.
- **Record**: Field name `user` -> Nested `user.name`.

The `name` property in the metadata is pre-calculated to match this structure (e.g., `[0].args.user.name` if it's the first argument).

### 7. Working with Vectors (Arrays)

Use helper methods like `getItemDefault()` to manage array items.

```tsx
function VectorField({ field, form }) {
  return (
    <form.Field name={field.name} mode="array">
      {(arrayFieldApi) => (
        <div>
          {arrayFieldApi.state.value.map((_, index) => (
             /* Render items using field.name + [index] */
          ))}
          <button
             onClick={() => arrayFieldApi.pushValue(field.getItemDefault())}
          >
             Add Item
          </button>
        </div>
      )}
    </form.Field>
  )
}
```

### 8. Working with Variants

Use `optionMap` for lookup and `getOptionDefault()` for switching types.

```tsx
<select
  onChange={(e) => {
    // Switch variant type and default value
    const newValue = field.getOptionDefault(e.target.value)
    form.setFieldValue(field.name, newValue)
  }}
>
  {field.options.map((opt) => (
    <option key={opt}>{opt}</option>
  ))}
</select>
```

### 9. Type Guards

The library exports type guard utilities for safer type narrowing:

```typescript
import {
  isFieldType,
  isCompoundField,
  isPrimitiveField,
} from "@ic-reactor/candid"

if (isFieldType(field, "record")) {
  // field is RecordArgumentField
}
```

### 10. Recursive Types

Recursive types (like linked lists) use `z.lazy()` schemas. Use `field.extract()` to get the inner definition when rendering.

```tsx
function RecursiveField({ field }) {
  const innerField = useMemo(() => field.extract(), [field])
  return <DynamicField field={innerField} ... />
}
```
