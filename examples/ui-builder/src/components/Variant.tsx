import React, { useMemo } from "react"
import { useFormContext, Controller, useWatch } from "react-hook-form"
import Route, { RouteProps } from "./Route"

export interface VariantProps extends RouteProps<"variant"> {}

let generatedId = 0

const Variant: React.FC<VariantProps> = ({
  extractedField,
  registerName,
  errors,
}) => {
  const { control } = useFormContext()

  const selectRegisterName = useMemo(() => `select-${generatedId++}`, [])

  const selectedOption = useWatch({
    control,
    name: selectRegisterName,
    defaultValue: extractedField.defaultValue,
  })

  return (
    <div className="w-full flex-col">
      <label htmlFor={selectRegisterName} className="block mr-2">
        {extractedField.label}
      </label>
      <Controller
        shouldUnregister
        name={selectRegisterName}
        control={control}
        render={({ field }) => (
          <select
            className="w-full h-8 pl-2 pr-8 border rounded border-gray-300"
            id={selectRegisterName}
            {...field}
          >
            {extractedField.options.map((label, index) => (
              <option key={index} value={label}>
                {label}
              </option>
            ))}
          </select>
        )}
      />
      <div className="flex">
        <div className="w-2 h-10 border-l-2 border-b-2 border-gray-300 mt-1 mb-4" />
        {extractedField.fields.map(
          (field, index) =>
            selectedOption === field.label && (
              <Route
                key={index}
                extractedField={field}
                registerName={`${registerName}.${field.label}`}
                errors={errors?.[field.label as never]}
              />
            )
        )}
      </div>
    </div>
  )
}

export default Variant
