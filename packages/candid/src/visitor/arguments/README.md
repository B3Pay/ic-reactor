# Argument Field Visitor

The `ArgumentFieldVisitor` traverses Candid IDL types to generate two things:

1. **Field Metadata**: Structure, labels, and default values for rendering form fields.
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
//   defaultValues: [...], // Default values for the form
//   schema: ZodSchema     // Zod schema for validation
// }
```

#### For a Single Function

```typescript
const funcType = IDL.Func([IDL.Text, IDL.Nat], [], [])
const meta = visitor.visitFunc(funcType, "myMethod")
```

### 3. Integration with React Hook Form

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
    defaultValues: meta.defaultValues, // Use generated default values
    resolver: zodResolver(meta.schema), // Use generated Zod schema
  })

  const onSubmit = (data) => {
    // data is strictly typed and validated according to the Candid types
    // e.g. Principal strings are validated, numbers are checked, etc.
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

### 4. Integration with TanStack Form

The generated Zod schema works seamlessly with `@tanstack/react-form` using the `zodValidator` adapter.

```tsx
import { useForm } from "@tanstack/react-form"
import { zodValidator } from "@tanstack/zod-form-adapter"

function MethodForm({ meta }) {
  const form = useForm({
    defaultValues: meta.defaultValues,
    validatorAdapter: zodValidator(),
    validators: {
      onChange: meta.schema,
    },
    onSubmit: async ({ value }) => {
      // value is strictly typed and validated
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
      {meta.fields.map((field, index) => (
        <form.Field
          key={index}
          name={`[${index}]`} // Access by array index
          children={(field) => (
            <div>
              <label>{field.label}</label>
              <input
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
              {field.state.meta.errors ? (
                <span>{field.state.meta.errors.join(", ")}</span>
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

### 5. Field-Level Validation with TanStack Form

You can also perform granular validation at the field level using `field.schema`. This is useful when you want to validate individual inputs as the user types, rather than checking the entire form schema at the root.

```tsx
import { useForm } from "@tanstack/react-form"
import { zodValidator } from "@tanstack/zod-form-adapter"

function FieldLevelValidationForm({ meta }) {
  const form = useForm({
    defaultValues: meta.defaultValues,
    validatorAdapter: zodValidator(),
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
          name={`[${index}]`}
          // Use the specific schema for this argument field
          validators={{
            onChange: argField.schema,
          }}
          children={(field) => (
            <div>
              <label>{argField.label}</label>
              <input
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
              {field.state.meta.errors ? (
                <span className="error">
                  {field.state.meta.errors.join(", ")}
                </span>
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

### 6. Custom Revalidation Logic

You can fine-tune when validation occurs using `revalidateLogic` from `@tanstack/react-form`. This allows you to set different validation modes before and after the first submission (e.g., validate specific fields on submit first, then on blur/change after errors are present).

```tsx
import { useForm, revalidateLogic } from "@tanstack/react-form"

function RevalidationForm({ meta }) {
  const form = useForm({
    defaultValues: meta.defaultValues,
    validatorAdapter: zodValidator(),
    // Validate on 'submit' initially, then 'change' after first submission
    validationLogic: revalidateLogic({
      mode: "submit",
      modeAfterSubmission: "change",
    }),
    validators: {
      // The schema is applied based on the logic defined above
      onDynamic: meta.schema,
    },
    onSubmit: async ({ value }) => {
      console.log(value)
    },
  })

  // ... render form
}
```

## Schema Validation Rules

The generated Zod schema enforces stricter rules than standard Candid types to ensure valid user input:

- **Principals**: Validated using `Principal.fromText()`. Strings must be valid text representations.
- **Numbers**: Accepted as strings (to support BigInt precision in forms) and validated as numeric.
- **Blobs**: specific validation for hex strings or byte arrays.
- **Optionals**: Handle `null` and `undefined` correctly.

## Recursive Types

Recursive types (like linked lists or trees) are handled using `z.lazy()` to prevent infinite recursion during schema generation. The form can dynamically render fields as needed using the `extract()` method on the recursive field metadata.
