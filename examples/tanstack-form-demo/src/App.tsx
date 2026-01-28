import { useMemo } from "react"
import {
  ArgumentFieldVisitor,
  type ArgumentField,
  type MethodArgumentsMeta,
  type RecordArgumentField,
  type VariantArgumentField,
  type TupleArgumentField,
  type OptionalArgumentField,
  type VectorArgumentField,
  type BlobArgumentField,
  type RecursiveArgumentField,
  type PrincipalArgumentField,
  type NumberArgumentField,
  type TextArgumentField,
  type BooleanArgumentField,
} from "@ic-reactor/candid"
import { IDL } from "@icp-sdk/core/candid"
import {
  useForm,
  type FieldApi,
  type ReactFormExtendedApi,
} from "@tanstack/react-form"
import "./index.css"

// ════════════════════════════════════════════════════════════════════════════
// Sample Candid IDL Definition
// ════════════════════════════════════════════════════════════════════════════

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
      Custom: IDL.Text,
    }),
  }),
})

// ════════════════════════════════════════════════════════════════════════════
// Generate Form Metadata
// ════════════════════════════════════════════════════════════════════════════

const visitor = new ArgumentFieldVisitor()
const funcType = IDL.Func([UserProfile], [], [])
const meta = visitor.visitFunc(funcType, "updateProfile") as MethodArgumentsMeta

// ════════════════════════════════════════════════════════════════════════════
// Main App Component
// ════════════════════════════════════════════════════════════════════════════

function App() {
  return (
    <div className="app-container">
      <header className="app-header">
        <h1>🚀 TanStack Form + Candid</h1>
        <p className="app-description">
          Dynamic forms generated from Candid IDL definitions with full type
          safety and validation.
        </p>
      </header>

      <main className="form-wrapper">
        <CandidForm meta={meta} />
      </main>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Candid Form Component
// ════════════════════════════════════════════════════════════════════════════

interface CandidFormProps {
  meta: MethodArgumentsMeta
  onSubmitSuccess?: (values: unknown[]) => void
}

function CandidForm({ meta, onSubmitSuccess }: CandidFormProps) {
  const form = useForm({
    defaultValues: meta.defaultValue,
    validators: {
      onBlur: meta.schema,
    },
    onSubmit: async ({ value }) => {
      console.log("Form Submitted:", JSON.stringify(value, null, 2))
      onSubmitSuccess?.(value as unknown[])
      alert("Form submitted successfully!\n\n" + JSON.stringify(value, null, 2))
    },
  })

  return (
    <form
      className="candid-form"
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
    >
      <div className="form-fields">
        {meta.fields.map((field, index) => (
          <DynamicField key={field.name || index} field={field} form={form} />
        ))}
      </div>

      <div className="form-actions">
        <form.Subscribe
          selector={(state) => ({
            canSubmit: state.canSubmit,
            isSubmitting: state.isSubmitting,
            isDirty: state.isDirty,
          })}
        >
          {({ canSubmit, isSubmitting, isDirty }) => (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => form.reset()}
                disabled={!isDirty || isSubmitting}
              >
                Reset
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? <span className="loading-spinner" /> : null}
                {isSubmitting ? "Submitting..." : "Submit"}
              </button>
            </>
          )}
        </form.Subscribe>
      </div>
    </form>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Dynamic Field Component - Routes to Specific Field Types
// ════════════════════════════════════════════════════════════════════════════

interface DynamicFieldProps {
  field: ArgumentField
  form: ReactFormExtendedApi<any>
  parentName?: string
}

function DynamicField({ field, form, parentName }: DynamicFieldProps) {
  const fieldName = parentName !== undefined ? `${parentName}` : field.name

  return (
    <form.Field name={fieldName}>
      {(fieldApi) => (
        <div className="field-container">
          <FieldLabel field={field} />
          <FieldInput field={field} fieldApi={fieldApi} form={form} />
          <FieldErrors fieldApi={fieldApi} />
        </div>
      )}
    </form.Field>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Field Label Component
// ════════════════════════════════════════════════════════════════════════════

function FieldLabel({ field }: { field: ArgumentField }) {
  // Skip labels for certain compound types that have their own headers
  if (field.type === "null") return null

  return (
    <label className="field-label">
      <span className="label-text">{formatLabel(field.label)}</span>
      <span className="label-type">{field.type}</span>
    </label>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Field Errors Component
// ════════════════════════════════════════════════════════════════════════════

function FieldErrors({ fieldApi }: { fieldApi: FieldApi<any, any> }) {
  const errors = fieldApi.state.meta.errors

  if (!errors || errors.length === 0) return null

  return (
    <div className="field-errors">
      {errors.map((error: unknown, i: number) => (
        <span key={i} className="error-message">
          {typeof error === "object" && error !== null && "message" in error
            ? (error as { message: string }).message
            : String(error)}
        </span>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Field Input Component - Renders Appropriate Input for Each Type
// ════════════════════════════════════════════════════════════════════════════

interface FieldInputProps {
  field: ArgumentField
  fieldApi: FieldApi<any, any>
  form: ReactFormExtendedApi<any>
}

function FieldInput({ field, fieldApi, form }: FieldInputProps) {
  // Route to specific field type component
  switch (field.type) {
    case "record":
      return <RecordInput field={field} form={form} />
    case "variant":
      return <VariantInput field={field} fieldApi={fieldApi} form={form} />
    case "tuple":
      return <TupleInput field={field} form={form} />
    case "optional":
      return <OptionalInput field={field} fieldApi={fieldApi} form={form} />
    case "vector":
      return <VectorInput field={field} fieldApi={fieldApi} form={form} />
    case "blob":
      return <BlobInput field={field} fieldApi={fieldApi} />
    case "recursive":
      return <RecursiveInput field={field} form={form} />
    case "principal":
      return <PrincipalInput field={field} fieldApi={fieldApi} />
    case "number":
      return <NumberInput field={field} fieldApi={fieldApi} />
    case "text":
      return <TextInput field={field} fieldApi={fieldApi} />
    case "boolean":
      return <BooleanInput field={field} fieldApi={fieldApi} />
    case "null":
      return <NullInput />
    default:
      return <UnknownInput field={field} />
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Compound Type Inputs
// ════════════════════════════════════════════════════════════════════════════

function RecordInput({
  field,
  form,
}: {
  field: RecordArgumentField
  form: ReactFormExtendedApi<any>
}) {
  return (
    <div className="record-container">
      {field.fields.map((childField) => (
        <DynamicField key={childField.name} field={childField} form={form} />
      ))}
    </div>
  )
}

function VariantInput({
  field,
  fieldApi,
  form,
}: {
  field: VariantArgumentField
  fieldApi: FieldApi<any, any>
  form: ReactFormExtendedApi<any>
}) {
  const currentValue = fieldApi.state.value || field.defaultValue
  const currentOption = useMemo(() => {
    const keys = Object.keys(currentValue || {})
    return keys[0] || field.defaultOption
  }, [currentValue, field.defaultOption])

  const currentOptionField = field.optionMap.get(currentOption)

  const handleOptionChange = (newOption: string) => {
    const newDefault = field.getOptionDefault(newOption)
    fieldApi.handleChange(newDefault)
  }

  return (
    <div className="variant-container">
      <select
        className="variant-select"
        value={currentOption}
        onChange={(e) => handleOptionChange(e.target.value)}
      >
        {field.options.map((option) => (
          <option key={option} value={option}>
            {formatLabel(option)}
          </option>
        ))}
      </select>

      {currentOptionField && currentOptionField.type !== "null" && (
        <div className="variant-payload">
          <form.Field name={`${field.name}.${currentOption}`}>
            {(payloadApi) => (
              <div className="field-container">
                <FieldLabel field={currentOptionField} />
                <FieldInput
                  field={currentOptionField}
                  fieldApi={payloadApi}
                  form={form}
                />
                <FieldErrors fieldApi={payloadApi} />
              </div>
            )}
          </form.Field>
        </div>
      )}
    </div>
  )
}

function TupleInput({
  field,
  form,
}: {
  field: TupleArgumentField
  form: ReactFormExtendedApi<any>
}) {
  return (
    <div className="tuple-container">
      {field.fields.map((itemField, index) => (
        <div key={index} className="tuple-item">
          <span className="tuple-index">{index}</span>
          <DynamicField field={itemField} form={form} />
        </div>
      ))}
    </div>
  )
}

function OptionalInput({
  field,
  fieldApi,
  form,
}: {
  field: OptionalArgumentField
  fieldApi: FieldApi<any, any>
  form: ReactFormExtendedApi<any>
}) {
  const hasValue =
    fieldApi.state.value !== null && fieldApi.state.value !== undefined

  const handleToggle = (enabled: boolean) => {
    if (enabled) {
      fieldApi.handleChange(field.getInnerDefault())
    } else {
      fieldApi.handleChange(null)
    }
  }

  return (
    <div className="optional-container">
      <label className="optional-toggle">
        <input
          type="checkbox"
          checked={hasValue}
          onChange={(e) => handleToggle(e.target.checked)}
        />
        <span>Include value</span>
      </label>

      {hasValue && (
        <div className="optional-content">
          <FieldInput
            field={field.innerField}
            fieldApi={fieldApi}
            form={form}
          />
        </div>
      )}
    </div>
  )
}

function VectorInput({
  field,
  fieldApi,
  form,
}: {
  field: VectorArgumentField
  fieldApi: FieldApi<any, any>
  form: ReactFormExtendedApi<any>
}) {
  const items = (fieldApi.state.value as unknown[]) || []

  const handleAdd = () => {
    fieldApi.pushValue(field.getItemDefault())
  }

  const handleRemove = (index: number) => {
    fieldApi.removeValue(index)
  }

  return (
    <div className="vector-container">
      <div className="vector-items">
        {items.map((_, index) => (
          <div key={index} className="vector-item">
            <div className="vector-item-content">
              <form.Field name={`${field.name}[${index}]`}>
                {(itemApi) => (
                  <>
                    <FieldInput
                      field={field.itemField}
                      fieldApi={itemApi}
                      form={form}
                    />
                    <FieldErrors fieldApi={itemApi} />
                  </>
                )}
              </form.Field>
            </div>
            <button
              type="button"
              className="btn btn-icon btn-danger"
              onClick={() => handleRemove(index)}
              title="Remove item"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button type="button" className="btn btn-add" onClick={handleAdd}>
        + Add {formatLabel(field.label)}
      </button>
    </div>
  )
}

function BlobInput({
  field,
  fieldApi,
}: {
  field: BlobArgumentField
  fieldApi: FieldApi<any, any>
}) {
  return (
    <div className="blob-container">
      <textarea
        className="blob-input"
        value={fieldApi.state.value ?? ""}
        onChange={(e) => fieldApi.handleChange(e.target.value)}
        onBlur={fieldApi.handleBlur}
        placeholder="Enter hex encoded bytes (e.g., 0x1234...)"
        rows={3}
      />
      <span className="blob-hint">
        Accepted: {field.acceptedFormats.join(", ")}
      </span>
    </div>
  )
}

function RecursiveInput({
  field,
  form,
}: {
  field: RecursiveArgumentField
  form: ReactFormExtendedApi<any>
}) {
  // Extract inner field lazily
  const innerField = useMemo(() => field.extract(), [field])

  return (
    <div className="recursive-container">
      <span className="recursive-type">{field.typeName}</span>
      <DynamicField field={innerField} form={form} parentName={field.name} />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Primitive Type Inputs
// ════════════════════════════════════════════════════════════════════════════

function PrincipalInput({
  field,
  fieldApi,
}: {
  field: PrincipalArgumentField
  fieldApi: FieldApi<any, any>
}) {
  return (
    <input
      type="text"
      className="input principal-input"
      value={fieldApi.state.value ?? ""}
      onChange={(e) => fieldApi.handleChange(e.target.value)}
      onBlur={fieldApi.handleBlur}
      placeholder={field.ui?.placeholder ?? "Principal ID"}
      maxLength={field.maxLength}
    />
  )
}

function NumberInput({
  field,
  fieldApi,
}: {
  field: NumberArgumentField
  fieldApi: FieldApi<any, any>
}) {
  return (
    <div className="number-input-container">
      <input
        type={field.isFloat ? "number" : "text"}
        inputMode="numeric"
        className="input number-input"
        value={fieldApi.state.value ?? ""}
        onChange={(e) => fieldApi.handleChange(e.target.value)}
        onBlur={fieldApi.handleBlur}
        placeholder={field.ui?.placeholder ?? "0"}
        step={field.isFloat ? "any" : undefined}
      />
      <span className="number-type-hint">{field.candidType}</span>
    </div>
  )
}

function TextInput({
  field,
  fieldApi,
}: {
  field: TextArgumentField
  fieldApi: FieldApi<any, any>
}) {
  if (field.multiline) {
    return (
      <textarea
        className="input text-input textarea"
        value={fieldApi.state.value ?? ""}
        onChange={(e) => fieldApi.handleChange(e.target.value)}
        onBlur={fieldApi.handleBlur}
        placeholder={field.ui?.placeholder ?? "Enter text..."}
        rows={4}
      />
    )
  }

  return (
    <input
      type="text"
      className="input text-input"
      value={fieldApi.state.value ?? ""}
      onChange={(e) => fieldApi.handleChange(e.target.value)}
      onBlur={fieldApi.handleBlur}
      placeholder={field.ui?.placeholder ?? "Enter text..."}
    />
  )
}

function BooleanInput({
  field,
  fieldApi,
}: {
  field: BooleanArgumentField
  fieldApi: FieldApi<any, any>
}) {
  return (
    <label className="boolean-container">
      <input
        type="checkbox"
        className="boolean-checkbox"
        checked={!!fieldApi.state.value}
        onChange={(e) => fieldApi.handleChange(e.target.checked)}
        onBlur={fieldApi.handleBlur}
      />
      <span className="boolean-slider" />
    </label>
  )
}

function NullInput() {
  return <span className="null-indicator">null</span>
}

function UnknownInput({ field }: { field: ArgumentField }) {
  return (
    <div className="unknown-container">
      <span className="unknown-warning">⚠️ Unsupported type: {field.type}</span>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Utility Functions
// ════════════════════════════════════════════════════════════════════════════

function formatLabel(label: string): string {
  // Remove internal prefixes like __arg0
  if (label.startsWith("__arg")) {
    return `Argument ${label.slice(5)}`
  }
  // Remove tuple index markers like _0_
  if (/^_\d+_$/.test(label)) {
    return `Item ${label.slice(1, -1)}`
  }
  // Convert camelCase/snake_case to Title Case
  return label
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export default App
