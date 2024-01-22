import React from "react"
import { useFieldArray } from "react-hook-form"
import Button from "./Inputs/Button"
import Route, { RouteProps } from "./Route"

export interface VectorProps extends RouteProps<"vector"> {}

const Vector: React.FC<VectorProps> = ({
  extractedField,
  errors,
  registerName,
  shouldUnregister,
}) => {
  const { fields, append, swap, remove } = useFieldArray({
    name: registerName as never,
    shouldUnregister,
  })

  return (
    <div className="w-full box-border">
      <div className="w-full flex justify-between items-center">
        <div className="flex-1 w-full">
          <label className="block text-lg font-medium">
            {extractedField.label}
          </label>
        </div>
        <Button
          className="flex-1 w-18 bg-gray-400 hover:bg-gray-500 mt-1"
          onClick={() => append("")}
        >
          +
        </Button>
      </div>
      {fields.length > 0 && <hr className="my-2" />}
      {fields.map((item, index) => (
        <div
          className="flex justify-between items-start p-1 mb-1 w-full border-dashed border border-gray-400 rounded"
          key={item.id}
        >
          <div className="flex-col flex-none flex items-center justify-center">
            <button
              disabled={index === 0}
              onClick={() => swap(index, index - 1)}
              className="h-5 w-5 mb-0.5 bg-gray-200 rounded disabled:opacity-50"
            >
              <span>↑</span>
            </button>
            <div className="h-8 w-8 bg-gray-200 rounded flex items-center justify-center">
              <span>{index + 1}</span>
            </div>
            <button
              disabled={index === fields.length - 1}
              onClick={() => swap(index, index + 1)}
              className="h-5 w-5 mt-0.5 bg-gray-200 rounded disabled:opacity-50"
            >
              <span>↓</span>
            </button>
          </div>
          <div className="flex-auto">
            <Route
              extractedField={extractedField.field}
              errors={errors?.[index as never]}
              registerName={`${registerName}.[${index}]`}
            />
          </div>
          <div
            className="flex-none h-8 w-8 bg-red-500 rounded text-white flex items-center justify-center pb-1 px-1 cursor-pointer"
            onClick={() => remove(index)}
          >
            <span className="text-2xl leading-5 font-bold">×</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export default Vector
