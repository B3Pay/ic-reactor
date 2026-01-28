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
//   defaultValue: [...],  // Default values for the form (array of argument defaults)
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
    placeholder: "...",
    description: "...",
  },
  // Type-specific properties:
  // - For numbers: min, max, unsigned, isFloat, bits
  // - For variants: options, optionMap, getOptionDefault()
  // - For vectors: itemField, getItemDefault()
  // - For optionals: innerField, getInnerDefault()
  // - For records: fields, fieldMap
}
```

### 4. Integration with React Hook Form

The generated Zod schema can be directly used with `react-hook-form` using the `@hookform/resolvers/zod` adapter.

```tsx
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

function MethodForm({ meta }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: meta.defaultValue, // Use generated default values
    resolver: zodResolver(meta.schema), // Use generated Zod schema
  })

  const onSubmit = (data) => {
    // data is strictly typed and validated according to the Candid types
    console.log(data)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {meta.fields.map((field, index) => (
        <div key={index}>
          <label>{field.label}</label>
          <input {...register(`${index}`)} />
          {errors[index] && <span>{errors[index].message}</span>}
        </div>
      ))}
      <button type="submit">Call Method</button>
    </form>
  )
}
```

### 5. Integration with TanStack Form

The generated metadata works seamlessly with `@tanstack/react-form`. The `name` property on each field is already formatted for TanStack Form's path notation.

```tsx
import { useForm } from "@tanstack/react-form"
import { zodValidator } from "@tanstack/zod-form-adapter"

function MethodForm({ meta }) {
  const form = useForm({
    defaultValues: meta.defaultValue,
    validatorAdapter: zodValidator(),
    validators: {
      onChange: meta.schema,
    },
    onSubmit: async ({ value }) => {
      console.log(value)
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
      {meta.fields.map((argField, index) => (
        <form.Field
          key={index}
          name={argField.name} // Use the pre-formatted name, e.g., "[0]"
          children={(fieldApi) => (
            <div>
              <label>{argField.label}</label>
              <input
                value={fieldApi.state.value}
                onBlur={fieldApi.handleBlur}
                onChange={(e) => fieldApi.handleChange(e.target.value)}
              />
              {fieldApi.state.meta.errors ? (
                <span>{fieldApi.state.meta.errors.join(", ")}</span>
              ) : null}
            </div>
          )}
        />
      ))}
      <button type="submit">Call Method</button>
    </form>
  )
}
```

### 6. Working with Vectors (Arrays)

Use `mode="array"` for vector fields and the `getItemDefault()` helper to add new items:

```tsx
function VectorField({ field, form }) {
  return (
    <form.Field name={field.name} mode="array">
      {(arrayFieldApi) => (
        <div>
          <label>{field.label}</label>
          {arrayFieldApi.state.value.map((_, index) => (
            <form.Field
              key={index}
              name={`${field.name}[${index}]`}
              children={(itemApi) => (
                <div>
                  <input
                    value={itemApi.state.value}
                    onChange={(e) => itemApi.handleChange(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => arrayFieldApi.removeValue(index)}
                  >
                    Remove
                  </button>
                </div>
              )}
            />
          ))}
          <button
            type="button"
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

### 7. Working with Variants

Use `optionMap` for quick lookup and `getOptionDefault()` for changing variants:

```tsx
function VariantField({ field, form }) {
  const selectedKey = Object.keys(form.getFieldValue(field.name))[0]

  return (
    <div>
      <label>{field.label}</label>
      <select
        value={selectedKey}
        onChange={(e) => {
          const newValue = field.getOptionDefault(e.target.value)
          form.setFieldValue(field.name, newValue)
        }}
      >
        {field.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      {/* Render the payload for the selected option */}
      {field.optionMap.get(selectedKey)?.type !== "null" && (
        <DynamicField
          field={field.optionMap.get(selectedKey)}
          form={form}
          baseName={`${field.name}.${selectedKey}`}
        />
      )}
    </div>
  )
}
```

### 8. Working with Optionals

Use `getInnerDefault()` when enabling an optional field:

```tsx
function OptionalField({ field, form }) {
  const currentValue = form.getFieldValue(field.name)
  const isEnabled = currentValue !== null

  return (
    <div>
      <label>
        <input
          type="checkbox"
          checked={isEnabled}
          onChange={(e) => {
            if (e.target.checked) {
              form.setFieldValue(field.name, field.getInnerDefault())
            } else {
              form.setFieldValue(field.name, null)
            }
          }}
        />
        {field.label}
      </label>

      {isEnabled && (
        <DynamicField
          field={field.innerField}
          form={form}
          baseName={field.name}
        />
      )}
    </div>
  )
}
```

## Type Guards

The library exports type guard utilities for safer type narrowing:

```typescript
import {
  isFieldType,
  isCompoundField,
  isPrimitiveField,
} from "@ic-reactor/candid"

// Check for specific field type
if (isFieldType(field, "record")) {
  // field is now typed as RecordArgumentField
  console.log(field.fieldMap)
}

// Check if field is compound (record, variant, tuple, vector, optional)
if (isCompoundField(field)) {
  // Handle nested rendering
}

// Check if field is primitive (text, number, boolean, principal, null)
if (isPrimitiveField(field)) {
  // Render simple input
}
```

## Schema Validation Rules

The generated Zod schema enforces stricter rules than standard Candid types to ensure valid user input:

- **Principals**: Validated using `Principal.fromText()`. Strings must be valid text representations.
- **Numbers**: Accepted as strings (to support BigInt precision in forms) and validated as numeric. Fixed-width types have min/max constraints.
- **Blobs**: Specific validation for hex strings or byte arrays.
- **Optionals**: Handle `null` and `undefined` correctly using `.nullish()`.

## Recursive Types

Recursive types (like linked lists or trees) are handled using `z.lazy()` to prevent infinite recursion during schema generation. The form can dynamically render fields as needed using the `extract()` method on the recursive field metadata:

```tsx
function RecursiveField({ field, form }) {
  // Lazily extract the inner field definition
  const innerField = useMemo(() => field.extract(), [field])

  return <DynamicField field={innerField} form={form} baseName={field.name} />
}
```
