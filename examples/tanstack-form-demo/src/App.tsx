import { useMemo } from "react"
import {
  FieldVisitor,
  type ArgumentsMeta,
  type FieldNode,
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
  type FieldComponentType,
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
  height: IDL.Float32,
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

const visitor = new FieldVisitor()
const funcType = IDL.Func([UserProfile], [], [])
const meta = visitor.visitFunc(funcType, "updateProfile")

// ════════════════════════════════════════════════════════════════════════════
// Component Map - Uses field.component for routing
// ════════════════════════════════════════════════════════════════════════════

type ComponentMapType = {
  [K in FieldComponentType]: React.FC<{
    field: FieldNode
    fieldApi: any
    form: any
  }>
}

const componentMap: ComponentMapType = {
  "record-container": RecordInput,
  "tuple-container": TupleInput,
  "variant-select": VariantInput,
  "optional-toggle": OptionalInput,
  "vector-list": VectorInput,
  "blob-upload": BlobInput,
  "principal-input": PrincipalInput,
  "text-input": TextInput,
  "number-input": NumberInput,
  "boolean-checkbox": BooleanInput,
  "null-hidden": NullInput,
  "recursive-lazy": RecursiveInput,
  "unknown-fallback": UnknownInput,
}

// ════════════════════════════════════════════════════════════════════════════
// Main App Component
// ════════════════════════════════════════════════════════════════════════════

function App() {
  return (
    <div className="app-container">
      <header className="app-header">
        <h1>🚀 TanStack Form + Candid</h1>
        <p className="app-description">
          Dynamic forms generated from Candid IDL definitions using the new
          <code>FieldVisitor</code> API with <code>displayLabel</code>,
          <code>component</code>, <code>renderHint</code>, and{" "}
          <code>inputProps</code>.
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
    defaultValues: meta.defaults,
    validators: {
      onChange: meta.schema,
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
        {meta.args.map((field, index) => (
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
// Dynamic FieldNode Component - Uses field.component for routing
// ════════════════════════════════════════════════════════════════════════════

interface DynamicFieldProps {
  field: FieldNode
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
          {/* Use the component map based on field.component */}
          <FieldInput field={field} fieldApi={fieldApi} form={form} />
          <FieldErrors fieldApi={fieldApi} />
        </div>
      )}
    </form.Field>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// FieldNode Label Component - Uses displayLabel
// ════════════════════════════════════════════════════════════════════════════

function FieldLabel({ field }: { field: FieldNode }) {
  // Use renderHint to skip labels for null fields
  if (field.component === "null-hidden") return null

  return (
    <label className="field-label">
      {/* Use the new displayLabel property instead of manual formatting */}
      <span className="label-text">{field.displayLabel}</span>
      <span className="label-type">{field.candidType ?? field.type}</span>
    </label>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// FieldNode Errors Component
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
// FieldNode Input Component - Uses field.component for routing
// ════════════════════════════════════════════════════════════════════════════

interface FieldInputProps {
  field: FieldNode
  fieldApi: any
  form: any
}

function FieldInput({ field, fieldApi, form }: FieldInputProps) {
  // Use the component map based on field.component
  const Component = componentMap[field.component]
  return <Component field={field} fieldApi={fieldApi} form={form} />
}

// ════════════════════════════════════════════════════════════════════════════
// Compound Type Inputs
// ════════════════════════════════════════════════════════════════════════════

function RecordInput({
  field,
  form,
}: {
  field: FieldNode
  fieldApi: any
  form: any
}) {
  const recordField = field as RecordField

  return (
    <div
      className="record-container"
      style={field.name === "[0]" ? { borderLeft: "none" } : undefined}
    >
      {recordField.fields.map((childField) => (
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
  field: FieldNode
  fieldApi: any
  form: any
}) {
  const variantField = field as VariantField
  const currentValue = fieldApi.state.value ?? variantField.defaultValue

  const currentOption = variantField.getSelectedKey(currentValue)
  const currentOptionField = variantField.getSelectedOption(currentValue)

  const handleOptionChange = (newOption: string) => {
    const newDefault = variantField.getOptionDefault(newOption)
    fieldApi.handleChange(newDefault)
  }

  return (
    <div className="variant-container">
      <select
        className="variant-select"
        value={currentOption}
        onChange={(e) => handleOptionChange(e.target.value)}
      >
        {variantField.options.map((optionField) => (
          <option key={optionField.label} value={optionField.label}>
            {optionField.label}
          </option>
        ))}
      </select>

      {currentOptionField && currentOptionField.component !== "null-hidden" && (
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

function TupleInput({
  field,
  form,
}: {
  field: FieldNode
  fieldApi: any
  form: any
}) {
  const tupleField = field as TupleField

  return (
    <div className="tuple-container">
      {tupleField.fields.map((itemField, index) => (
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
  field: FieldNode
  fieldApi: any
  form: any
}) {
  const optionalField = field as OptionalField

  // Use the new isEnabled helper method
  const hasValue = optionalField.isEnabled(fieldApi.state.value)

  const handleToggle = (enabled: boolean) => {
    if (enabled) {
      fieldApi.handleChange(optionalField.getInnerDefault())
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
          <form.Field name={optionalField.innerField.name}>
            {(itemApi: any) => (
              <>
                <FieldInput
                  field={optionalField.innerField}
                  fieldApi={itemApi}
                  form={form}
                />
                <FieldErrors fieldApi={itemApi} />
              </>
            )}
          </form.Field>
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
  field: FieldNode
  fieldApi: any
  form: any
}) {
  const vectorField = field as VectorField
  const items = (fieldApi.state.value as unknown[]) ?? []

  const handleAdd = () => {
    fieldApi.pushValue(vectorField.getItemDefault())
  }

  const handleRemove = (index: number) => {
    fieldApi.removeValue(index)
  }

  return (
    <div className="vector-container">
      <div className="vector-items">
        {items.map((_, index) => {
          // Use the new createItemField helper method
          const itemField = vectorField.createItemField(index)

          return (
            <form.Field key={index} name={itemField.name}>
              {(itemApi: any) => (
                <>
                  <div className="vector-item">
                    <span className="vector-item-content">
                      <FieldInput
                        field={itemField}
                        fieldApi={itemApi}
                        form={form}
                      />
                    </span>
                    <button
                      type="button"
                      className="btn btn-icon btn-danger"
                      onClick={() => handleRemove(index)}
                      title="Remove item"
                    >
                      ✕
                    </button>
                  </div>
                  <FieldErrors fieldApi={itemApi} />
                </>
              )}
            </form.Field>
          )
        })}
      </div>

      <button type="button" className="btn btn-add" onClick={handleAdd}>
        + Add {vectorField.displayLabel}
      </button>
    </div>
  )
}

function BlobInput({
  field,
  fieldApi,
}: {
  field: FieldNode
  fieldApi: any
  form: any
}) {
  const blobField = field as BlobField

  const handleChange = (value: string) => {
    // Use the new normalizeHex helper
    const normalized = blobField.normalizeHex(value)
    fieldApi.handleChange(normalized)
  }

  // Use the new validateInput helper for validation feedback
  const validation = blobField.validateInput(fieldApi.state.value ?? "")

  return (
    <div className="blob-container">
      <textarea
        className="blob-input"
        value={(fieldApi.state.value as string) ?? ""}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={fieldApi.handleBlur}
        placeholder="Enter hex encoded bytes (e.g., 0x1234...)"
        rows={3}
      />
      <div className="blob-meta">
        <span className="blob-hint">
          Accepted: {blobField.acceptedFormats.join(", ")} | Max:{" "}
          {blobField.limits.maxHexBytes} bytes
        </span>
        {!validation.valid && (
          <span className="blob-error">{validation.error}</span>
        )}
      </div>
    </div>
  )
}

function RecursiveInput({
  field,
  form,
}: {
  field: FieldNode
  fieldApi: any
  form: any
}) {
  const recursiveField = field as RecursiveField
  const innerField = useMemo(() => recursiveField.extract(), [recursiveField])

  return (
    <div className="recursive-container">
      <span className="recursive-type">{recursiveField.typeName}</span>
      <DynamicField field={innerField} form={form} parentName={field.name} />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Primitive Type Inputs - Using inputProps
// ════════════════════════════════════════════════════════════════════════════

function PrincipalInput({
  field,
  fieldApi,
}: {
  field: FieldNode
  fieldApi: any
  form: any
}) {
  const principalField = field as PrincipalField

  return (
    <input
      // Spread the new inputProps
      {...principalField.inputProps}
      className="input principal-input"
      value={(fieldApi.state.value as string) ?? ""}
      onChange={(e) => fieldApi.handleChange(e.target.value)}
      onBlur={fieldApi.handleBlur}
    />
  )
}

function NumberInput({
  field,
  fieldApi,
}: {
  field: FieldNode
  fieldApi: any
  form: any
}) {
  const numberField = field as NumberField

  return (
    <div className="number-input-container">
      <input
        // Spread the new inputProps for type, min, max, step, inputMode, placeholder
        {...numberField.inputProps}
        className="input number-input"
        value={fieldApi.state.value ?? ""}
        onChange={(e) => fieldApi.handleChange(e.target.value)}
        onBlur={fieldApi.handleBlur}
      />
      <span className="number-type-hint">{numberField.candidType}</span>
    </div>
  )
}

function TextInput({
  field,
  fieldApi,
}: {
  field: FieldNode
  fieldApi: any
  form: any
}) {
  const textField = field as TextField
  const value = (fieldApi.state.value as string) ?? ""

  if (textField.multiline) {
    return (
      <textarea
        className="input text-input textarea"
        value={value}
        onChange={(e) => fieldApi.handleChange(e.target.value)}
        onBlur={fieldApi.handleBlur}
        placeholder={textField.inputProps?.placeholder ?? "Enter text..."}
        rows={4}
      />
    )
  }

  return (
    <input
      // Spread the new inputProps for type, placeholder, spellCheck, etc.
      {...textField.inputProps}
      className="input text-input"
      value={value}
      onChange={(e) => fieldApi.handleChange(e.target.value)}
      onBlur={fieldApi.handleBlur}
    />
  )
}

function BooleanInput({
  fieldApi,
}: {
  field: FieldNode
  fieldApi: any
  form: any
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

function UnknownInput({
  field,
}: {
  field: FieldNode
  fieldApi: any
  form: any
}) {
  return (
    <div className="unknown-container">
      <span className="unknown-warning">
        ⚠️ Unsupported component: {field.component}
      </span>
    </div>
  )
}

export default App
