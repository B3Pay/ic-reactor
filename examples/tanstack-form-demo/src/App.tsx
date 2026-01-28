import { useMemo } from "react"
import {
  ArgumentFieldVisitor,
  type ArgumentsMeta,
  type Field,
  type RecordField,
  type VariantField,
  type TupleField,
  type OptionalField,
  type VectorField,
  type BlobField,
  type RecursiveField,
  type PrincipalField,
  type NumberField,
  type TextField,
} from "@ic-reactor/candid"
import { IDL } from "@icp-sdk/core/candid"
import { useForm } from "@tanstack/react-form"
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
const meta = visitor.visitFunc(funcType, "updateProfile")

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
  meta: ArgumentsMeta
  onSubmitSuccess?: (values: unknown[]) => void
}

function CandidForm({ meta, onSubmitSuccess }: CandidFormProps) {
  const form = useForm({
    defaultValues: meta.defaultValue as unknown[],
    validators: {
      onChange: meta.schema,
      onBlur: meta.schema,
    },
    onSubmit: async ({ value }) => {
      console.log("Form Submitted:", JSON.stringify(value, null, 2))
      onSubmitSuccess?.(value)
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

      <FormActions form={form} />
    </form>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Form Actions Component
// ════════════════════════════════════════════════════════════════════════════

function FormActions({ form }: { form: any }) {
  return (
    <div className="form-actions">
      <form.Subscribe
        selector={(state: any) => ({
          canSubmit: state.canSubmit,
          isSubmitting: state.isSubmitting,
          isDirty: state.isDirty,
          isValid: state.isValid,
        })}
      >
        {({ canSubmit, isSubmitting, isDirty, isValid }: any) => (
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
              disabled={!canSubmit || isSubmitting || !isValid}
            >
              {isSubmitting ? <span className="loading-spinner" /> : null}
              {isSubmitting ? "Submitting..." : "Submit"}
            </button>
          </>
        )}
      </form.Subscribe>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Dynamic Field Component - Routes to Specific Field Types
// ════════════════════════════════════════════════════════════════════════════

interface DynamicFieldProps {
  field: Field
  form: any
  parentName?: string
}

function DynamicField({ field, form, parentName }: DynamicFieldProps) {
  const fieldName = parentName ?? field.name

  return (
    <form.Field name={fieldName}>
      {(fieldApi: any) => (
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

function FieldLabel({ field }: { field: Field }) {
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

function FieldErrors({ fieldApi }: { fieldApi: any }) {
  const errors = fieldApi.state.meta.errors

  if (!errors || errors.length === 0) return null

  return (
    <div className="field-errors">
      {errors.map((error: any, i: number) => (
        <span key={i} className="error-message">
          {formatError(error)}
        </span>
      ))}
    </div>
  )
}

function formatError(error: unknown): string {
  if (typeof error === "string") return error
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: string }).message)
  }
  return String(error)
}

// ════════════════════════════════════════════════════════════════════════════
// Field Input Component - Renders Appropriate Input for Each Type
// ════════════════════════════════════════════════════════════════════════════

interface FieldInputProps {
  field: Field
  fieldApi: any
  form: any
}

function FieldInput({ field, fieldApi, form }: FieldInputProps) {
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
      return <BooleanInput fieldApi={fieldApi} />
    case "null":
      return <NullInput />
    default:
      return <UnknownInput field={field} />
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Compound Type Inputs
// ════════════════════════════════════════════════════════════════════════════

function RecordInput({ field, form }: { field: RecordField; form: any }) {
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
  field: VariantField
  fieldApi: any
  form: any
}) {
  const currentValue = (fieldApi.state.value ?? field.defaultValue) as Record<
    string,
    unknown
  >
  const currentOption = useMemo(() => {
    const keys = Object.keys(currentValue ?? {})
    return keys[0] ?? field.defaultOption
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
            {(payloadApi: any) => (
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

function TupleInput({ field, form }: { field: TupleField; form: any }) {
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
  field: OptionalField
  fieldApi: any
  form: any
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
  field: VectorField
  fieldApi: any
  form: any
}) {
  const items = (fieldApi.state.value as unknown[]) ?? []

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
                {(itemApi: any) => (
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

function BlobInput({ field, fieldApi }: { field: BlobField; fieldApi: any }) {
  return (
    <div className="blob-container">
      <textarea
        className="blob-input"
        value={(fieldApi.state.value as string) ?? ""}
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

function RecursiveInput({ field, form }: { field: RecursiveField; form: any }) {
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
  field: PrincipalField
  fieldApi: any
}) {
  return (
    <input
      type="text"
      className="input principal-input"
      value={(fieldApi.state.value as string) ?? ""}
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
  field: NumberField
  fieldApi: any
}) {
  return (
    <div className="number-input-container">
      <input
        type={field.isFloat ? "number" : "text"}
        inputMode="numeric"
        className="input number-input"
        value={(fieldApi.state.value as string) ?? ""}
        onChange={(e) => fieldApi.handleChange(e.target.value)}
        onBlur={fieldApi.handleBlur}
        placeholder={field.ui?.placeholder ?? "0"}
        step={field.isFloat ? "any" : undefined}
      />
      <span className="number-type-hint">{field.candidType}</span>
    </div>
  )
}

function TextInput({ field, fieldApi }: { field: TextField; fieldApi: any }) {
  const value = (fieldApi.state.value as string) ?? ""

  if (field.multiline) {
    return (
      <textarea
        className="input text-input textarea"
        value={value}
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
      value={value}
      onChange={(e) => fieldApi.handleChange(e.target.value)}
      onBlur={fieldApi.handleBlur}
      placeholder={field.ui?.placeholder ?? "Enter text..."}
    />
  )
}

function BooleanInput({ fieldApi }: { fieldApi: any }) {
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

function UnknownInput({ field }: { field: Field }) {
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
  if (label.startsWith("__arg")) {
    return `Argument ${label.slice(5)}`
  }
  if (/^_\d+_$/.test(label)) {
    return `Item ${label.slice(1, -1)}`
  }
  return label
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export default App
