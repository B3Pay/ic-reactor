import React, { useMemo } from "react"
import Route, { RouteProps } from "./Route"
import { Controller, useFormContext, useWatch } from "react-hook-form"

interface VariantProps extends RouteProps {}

let recursive = 0

const Variant: React.FC<VariantProps> = ({ field, registerName, errors }) => {
  const { control, unregister, setValue } = useFormContext()

  const selectName = useMemo(() => `select.select${recursive++}`, [])

  const selected = useWatch({ name: selectName })

  const { selectedName, selectedField } = useMemo(() => {
    if (!selected) {
      return {}
    }

    unregister(registerName)
    const selectedName = `${registerName}.${selected}`

    setValue(selectedName, field.defaultValues?.[selected])

    const selectedField = field.fields.find((f) => f.label === selected)

    return { selectedName, selectedField }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, setValue])

  const errorMessage = errors?.message?.toString()

  return (
    <div className="w-full flex-col">
      <label className="block mr-2" htmlFor={selectName}>
        {field.label}
        <span className="text-red-500">*</span>
        {errorMessage && (
          <span className="text-red-500 text-xs ml-1">( {errorMessage} )</span>
        )}
      </label>
      <Controller
        name={selectName}
        control={control}
        rules={{
          required: "Please select one",
          validate: (value) =>
            value === "select" ? "Please select one" : true,
        }}
        render={({ field: methodField }) => (
          <select
            id={selectName}
            {...methodField}
            className="w-full h-8 pl-2 pr-8 border rounded border-gray-300"
          >
            <option value="select">Select one</option>
            {field.options?.map((label, index) => (
              <option key={index} value={label}>
                {label}
              </option>
            ))}
          </select>
        )}
      />
      {selectedField && (
        <Route
          registerName={selectedName}
          errors={errors?.[selected as never]}
          field={selectedField}
        />
      )}
    </div>
  )
}

export default Variant
