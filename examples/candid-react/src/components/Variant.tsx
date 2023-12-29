import { useEffect, useState } from "react"
import Route, { RouteProps } from "./Route"
import { Controller, useFormContext } from "react-hook-form"

interface VariantProps extends RouteProps {}

const Variant: React.FC<VariantProps> = ({ field, registerName, errors }) => {
  const { control, setValue, watch } = useFormContext()
  const [inputValue, setInputValue] = useState<any>(null)

  const inputName = registerName.replace("data", "input")

  const selectedValue = watch(inputName)

  console.log("selectedValue", selectedValue)

  useEffect(() => {
    if (selectedValue) {
      setValue(
        `${registerName}.${selectedValue}`,
        field.defaultValues[selectedValue]
      )
    }
  }, [selectedValue])

  const selectedField = field.fields.find((f) => f.label === inputValue)

  console.log("selectedField", selectedField)
  return (
    <div className="w-full flex-col">
      <label className="block mr-2" htmlFor={registerName}>
        {field.label}
      </label>
      <Controller
        name={inputName}
        control={control}
        rules={{
          required: true,
          validate: (v) => {
            console.log("v", v)
            return typeof v === "string" && v !== "select"
          },
        }}
        render={({ field: renderField }) => (
          <select
            {...renderField}
            id={registerName}
            className="w-full h-8 pl-2 pr-8 border rounded border-gray-300"
            onChange={(e) => {
              renderField.onChange(e)
              setInputValue(e.target.value)
            }}
          >
            <option value="select">Select</option>
            {field.options?.map((label, index) => (
              <option key={index} value={label}>
                {label}
              </option>
            ))}
          </select>
        )}
      />
      {selectedField ? (
        <Route
          registerName={`${registerName}.${selectedValue}`}
          errors={errors?.[selectedValue as never]}
          field={selectedField}
        />
      ) : (
        <div className="mt-2">Field not found</div>
      )}
    </div>
  )
}

export default Variant
