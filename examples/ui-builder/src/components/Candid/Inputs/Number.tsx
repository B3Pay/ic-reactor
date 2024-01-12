import { cn } from "../../../utils"
import { Controller, useFormContext } from "react-hook-form"
import { RouteProps } from "../Route"

export interface NumberProps extends RouteProps<"number"> {}

const Number: React.FC<NumberProps> = ({
  registerName,
  errors,
  extractedField,
}) => {
  const { resetField, trigger } = useFormContext()

  const errorMessage = errors?.message?.toString()

  return (
    <div className="w-full p-1">
      <label htmlFor={registerName} className="block">
        {extractedField.label}
        {extractedField.required && <span className="text-red-500">*</span>}
        {errorMessage && (
          <span className="text-red-500 text-xs ml-1">( {errorMessage} )</span>
        )}
      </label>
      <div className="relative">
        <Controller
          name={registerName}
          rules={{ ...extractedField, shouldUnregister: true }}
          render={({ field }) => (
            <input
              id={registerName}
              {...field}
              className={cn(
                "w-full h-8 pl-2 pr-8 border rounded",
                !!errors ? "border-red-500" : "border-gray-300"
              )}
              type="number"
              placeholder="number"
            />
          )}
        />
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-center w-8 text-red-500 pb-1 px-1 cursor-pointer"
          onClick={() => {
            resetField(registerName as never)
            trigger(registerName as never, { shouldFocus: true })
          }}
        >
          <span className="text-2xl leading-5 font-bold">×</span>
        </div>
      </div>
    </div>
  )
}

export default Number
