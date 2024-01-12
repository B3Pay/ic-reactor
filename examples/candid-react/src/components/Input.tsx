import { cn } from "../utils"
import { useFormContext } from "react-hook-form"
import { RouteProps } from "./Route"

interface InputProps extends RouteProps {}

const Input: React.FC<InputProps> = ({
  registerName,
  errors,
  extractedField,
}) => {
  const { register, resetField, trigger } = useFormContext()

  const validate = (x: any) => {
    if (extractedField.type === "null") {
      return extractedField.validate(null)
    } else {
      return extractedField.validate(x)
    }
  }

  const errorMessage = errors?.message?.toString()

  return extractedField.type !== "null" ? (
    <div className="w-full p-1">
      <label htmlFor={registerName} className="block">
        {extractedField.label}
        {extractedField.required && <span className="text-red-500">*</span>}
        {errorMessage && (
          <span className="text-red-500 text-xs ml-1">( {errorMessage} )</span>
        )}
      </label>
      <div className="relative">
        <input
          id={registerName}
          {...register(registerName as never, { ...extractedField, validate })}
          className={cn(
            "w-full h-8 pl-2 pr-8 border rounded",
            !!errors ? "border-red-500" : "border-gray-300"
          )}
          type={
            extractedField.type === "principal" ? "text" : extractedField.type
          }
          placeholder={extractedField.type}
        />
        {extractedField.type !== "boolean" && (
          <div
            className="absolute inset-y-0 right-0 flex items-center justify-center w-8 text-red-500 pb-1 px-1 cursor-pointer"
            onClick={() => {
              resetField(registerName as never)
              trigger(registerName as never, { shouldFocus: true })
            }}
          >
            <span className="text-2xl leading-5 font-bold">×</span>
          </div>
        )}
      </div>
    </div>
  ) : null
}

export default Input
