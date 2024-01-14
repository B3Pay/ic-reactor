import React, { useId } from "react"
import { Controller, useWatch } from "react-hook-form"
import Route, { RouteProps } from "./Route"

export interface VariantProps extends RouteProps<"variant"> {}

const Variant: React.FC<VariantProps> = ({
  extractedField,
  registerName,
  errors,
}) => {
  const selectRegisterName = useId()

  const selectedOption = useWatch({
    name: selectRegisterName,
    defaultValue: extractedField.defaultValue,
  })

  return (
    <div className="w-full flex-col">
      <label htmlFor={selectRegisterName} className="block mr-2">
        {extractedField.label}
      </label>
      <Controller
        name={selectRegisterName}
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
        {extractedField.fields.map(
          (field, index) =>
            selectedOption === field.label && (
              <Route
                key={index}
                shouldUnregister
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
