import {
  ArgumentFieldVisitor,
  type ArgumentField,
  type MethodArgumentsMeta,
} from "@ic-reactor/candid"
import { IDL } from "@icp-sdk/core/candid"
import { useForm } from "@tanstack/react-form"

const visitor = new ArgumentFieldVisitor()

// Sample IDL to demonstrate
const UserProfile = IDL.Record({
  username: IDL.Text,
  age: IDL.Nat,
  email: IDL.Text,
  bio: IDL.Opt(IDL.Text),
  tags: IDL.Vec(IDL.Text),
  preferences: IDL.Record({
    notifications: IDL.Bool,
    theme: IDL.Variant({
      Light: IDL.Null,
      Dark: IDL.Null,
      System: IDL.Null,
    }),
  }),
})

// Generate metadata and schema
const funcType = IDL.Func([UserProfile], [], [])
const meta = visitor.visitFunc(funcType, "updateProfile")

function App() {
  return (
    <div
      style={{
        padding: "2rem",
        maxWidth: "600px",
        margin: "0 auto",
        color: "#333",
      }}
    >
      <h1>TanStack Form + Candid</h1>
      <p>This form is generated dynamically from a Candid IDL definition.</p>

      <div
        style={{
          padding: "1rem",
          border: "1px solid #ccc",
          borderRadius: "8px",
        }}
      >
        <MethodForm meta={meta} />
      </div>
    </div>
  )
}

function MethodForm({ meta }: { meta: MethodArgumentsMeta }) {
  const form = useForm({
    defaultValues: meta.defaultValues,
    validators: {
      onBlur: meta.schema,
    },
    onSubmit: async ({ value }) => {
      console.log("Form Submitted:", value)
      alert(JSON.stringify(value, null, 2))
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
        <FieldRenderer
          key={index}
          field={field}
          name={`[${index}]`} // Top level args are array items
          form={form}
        />
      ))}

      <div style={{ marginTop: "1rem" }}>
        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting]}
          children={([canSubmit, isSubmitting]) => (
            <button type="submit" disabled={!canSubmit}>
              {isSubmitting ? "Submitting..." : "Submit"}
            </button>
          )}
        />
      </div>
    </form>
  )
}

function FieldRenderer({
  field,
  name,
  form,
}: {
  field: ArgumentField
  name: string
  form: any
}) {
  return (
    <div style={{ marginBottom: "1rem", marginLeft: "10px" }}>
      <form.Field
        name={name}
        validators={{
          onChange: field.schema,
        }}
        children={(fieldApi: any) => (
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "4px",
                fontWeight: "bold",
              }}
            >
              {field.label}{" "}
              <span style={{ fontSize: "0.8em", opacity: 0.7 }}>
                ({field.type})
              </span>
            </label>

            <FieldInput field={field} fieldApi={fieldApi} form={form} />

            {fieldApi.state.meta.errors ? (
              <div style={{ color: "red", fontSize: "0.8em" }}>
                {fieldApi.state.meta.errors
                  .map((e: any) => e?.message || String(e))
                  .join(", ")}
              </div>
            ) : null}
          </div>
        )}
      />
    </div>
  )
}

function FieldInput({
  field,
  fieldApi,
  form,
}: {
  field: ArgumentField
  fieldApi: any
  form: any
}) {
  const { name } = fieldApi

  if (field.type === "record") {
    return (
      <div style={{ borderLeft: "2px solid #eee", paddingLeft: "10px" }}>
        {field.fields.map((childField) => (
          <FieldRenderer
            key={childField.label}
            field={childField}
            name={`${name}.${childField.label}`}
            form={form}
          />
        ))}
      </div>
    )
  }

  if (field.type === "variant") {
    // Robust variant handling
    const currentValue = fieldApi.state.value || field.defaultValues
    // Ensure we have at least one key
    const currentKey = Object.keys(currentValue)[0] || field.defaultOption

    // Find schema for current key to potentially render input
    // (though for simple enum variants without payload, just the select is enough)

    return (
      <div
        style={{
          border: "1px dashed #ccc",
          padding: "8px",
          borderRadius: "4px",
        }}
      >
        <select
          value={currentKey}
          onChange={(e) => {
            fieldApi.handleChange({ [e.target.value]: null })
          }}
          style={{ marginBottom: "8px" }}
        >
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>

        {/* Render payload input if applicable */}
        {(() => {
          const currentOptionField = field.fields.find(
            (f) => f.label === currentKey
          )
          if (currentOptionField && currentOptionField.type !== "null") {
            return (
              <FieldRenderer
                field={currentOptionField}
                name={`${name}.${currentKey}`}
                form={form}
              />
            )
          }
          return null
        })()}
      </div>
    )
  }

  if (field.type === "text") {
    return (
      <input
        type="text"
        value={fieldApi.state.value ?? ""}
        onBlur={fieldApi.handleBlur}
        onChange={(e) => fieldApi.handleChange(e.target.value)}
        style={{ width: "100%", padding: "4px" }}
      />
    )
  }

  if (field.type === "number") {
    return (
      <input
        type="number"
        value={fieldApi.state.value ?? ""}
        onBlur={fieldApi.handleBlur}
        onChange={(e) => fieldApi.handleChange(e.target.value)}
        style={{ width: "100%", padding: "4px" }}
      />
    )
  }

  if (field.type === "boolean") {
    return (
      <input
        type="checkbox"
        checked={!!fieldApi.state.value}
        onBlur={fieldApi.handleBlur}
        onChange={(e) => fieldApi.handleChange(e.target.checked)}
      />
    )
  }

  if (field.type === "vector") {
    const items = fieldApi.state.value || []
    return (
      <div>
        {items.map((_: any, i: number) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: "4px",
            }}
          >
            <div style={{ flex: 1 }}>
              <FieldRenderer
                key={i}
                field={field.itemField}
                name={`${name}[${i}]`}
                form={form}
              />
            </div>
            <button
              type="button"
              onClick={() => fieldApi.removeValue(i)}
              style={{ marginLeft: "4px", color: "red" }}
            >
              X
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            fieldApi.pushValue(field.itemField.defaultValue)
          }}
        >
          Add Item
        </button>
      </div>
    )
  }

  if (field.type === "optional") {
    const hasValue = fieldApi.state.value !== null
    return (
      <div>
        <label
          style={{ display: "flex", alignItems: "center", marginBottom: "4px" }}
        >
          <input
            type="checkbox"
            checked={hasValue}
            onChange={(e) => {
              if (e.target.checked) {
                const defaultVal = getDefaultValue(field.innerField)
                fieldApi.handleChange(defaultVal ?? "")
              } else {
                fieldApi.handleChange(null)
              }
            }}
            style={{ marginRight: "6px" }}
          />
          <span style={{ fontSize: "0.9em" }}>Include value?</span>
        </label>
        {hasValue && (
          <div
            style={{
              marginTop: "5px",
              paddingLeft: "10px",
              borderLeft: "2px solid #ccc",
            }}
          >
            <FieldInputLike
              field={field.innerField}
              fieldApi={fieldApi}
              form={form}
            />
          </div>
        )}
      </div>
    )
  }

  return <div>Unsupported type: {field.type}</div>
}

// Helper to render input content without re-wrapping in Field
// (used for Optional which reuses the parent field state)
function FieldInputLike({ field, fieldApi, form }: any) {
  // Recursively call FieldInput with the same fieldApi
  return <FieldInput field={field} fieldApi={fieldApi} form={form} />
}

export default App
