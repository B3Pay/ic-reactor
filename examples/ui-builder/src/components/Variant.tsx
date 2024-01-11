import React, { useMemo } from "react"
import { useFormContext, Controller, useWatch } from "react-hook-form"
import Route, { RouteProps } from "./Route"
import { IDL } from "@dfinity/candid"

interface VariantProps extends RouteProps<IDL.VariantClass> {}

let generatedId = 0

const Variant: React.FC<VariantProps> = ({ field, registerName, errors }) => {
  const { control } = useFormContext()

  const selectRegisterName = useMemo(() => {
    return `select-${generatedId++}`
  }, [])

  const selected = useWatch({
    control,
    name: selectRegisterName,
  })

  console.log(errors)

  return (
    <div className="w-full flex-col">
      <label htmlFor={selectRegisterName} className="block mr-2">
        {field.label}
        <span className="text-red-500">*</span>
      </label>
      <Controller
        name={selectRegisterName}
        control={control}
        rules={{ required: "Please select one" }}
        render={({ field: selectField }) => (
          <select
            className="w-full h-8 pl-2 pr-8 border rounded border-gray-300"
            id={selectRegisterName}
            {...selectField}
          >
            <option value="">Select one</option>
            {field.options.map((label, index) => (
              <option key={index} value={label}>
                {label}
              </option>
            ))}
          </select>
        )}
      />
      {field.fields.map(
        (field, index) =>
          selected === field.label && (
            <Route
              key={index}
              field={field}
              registerName={`${registerName}.${field.label}`}
              errors={errors?.[field.label as never]}
            />
          )
      )}
    </div>
  )
}

export default Variant
