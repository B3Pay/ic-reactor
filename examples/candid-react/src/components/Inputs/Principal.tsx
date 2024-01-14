import { cn } from "../../utils"
import { Principal as PrincipalId } from "@dfinity/principal"
import { useFormContext } from "react-hook-form"
import { RouteProps } from "../Route"
import { Controller } from "react-hook-form"
import { useCallback } from "react"

export interface PrincipalProps extends RouteProps<"principal"> {}

const Principal: React.FC<PrincipalProps> = ({
  registerName,
  errors,
  extractedField,
  shouldUnregister,
}) => {
  const { setValue, resetField, setError } = useFormContext()

  const validate = useCallback(
    (x: any) => {
      if (x._isPrincipal === true) {
        return true
      }
      try {
        if (x.length < 7) {
          throw new Error("Principal is too short")
        }
        const principal = PrincipalId.fromText(x)

        let validate = extractedField.validate(principal)

        if (typeof validate === "string") {
          throw new Error(validate)
        }
        return true
      } catch (error) {
        return (error as any).message
      }
    },
    [extractedField]
  )

  const blurHandler = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.value === "") {
        setValue(registerName, "" as never)
        return
      }
      const inputValue = e.target.value
      resetField(registerName, {
        defaultValue: inputValue as never,
      })
      const isValid = validate(inputValue)

      if (isValid === true) {
        const principal = PrincipalId.fromText(inputValue)

        setValue(registerName, principal as never)
      } else {
        setError(registerName, {
          type: "manual",
          message: isValid,
        })
      }
    },
    [registerName, resetField, setError, setValue, validate]
  )

  const errorMessage = errors?.message?.toString()

  return (
    <div className="w-full p-1">
      <label htmlFor={registerName} className="block mr-2">
        {extractedField.label}
      </label>
      {errorMessage && (
        <span className="text-red-500 text-xs ml-1">( {errorMessage} )</span>
      )}
      <div className="relative">
        <Controller
          shouldUnregister={shouldUnregister}
          name={registerName}
          defaultValue={extractedField.defaultValue}
          rules={{ ...extractedField, validate }}
          render={({ field }) => (
            <input
              id={registerName}
              {...field}
              className={cn(
                "w-full h-8 pl-2 pr-8 border rounded",
                !!errors ? "border-red-500" : "border-gray-300"
              )}
              type="text"
              placeholder={extractedField.type}
              onBlur={blurHandler}
            />
          )}
        />
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-center w-8 text-red-500 pb-1 px-1 cursor-pointer"
          onClick={() => setValue(registerName, "" as never)}
        >
          <span className="text-2xl leading-5 font-bold">×</span>
        </div>
      </div>
    </div>
  )
}

export default Principal
