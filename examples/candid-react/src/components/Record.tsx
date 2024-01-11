import { IDL } from "@dfinity/candid"
import Route, { RouteProps } from "./Route"

interface RecordProps extends RouteProps<IDL.RecordClass> {}

const Record: React.FC<RecordProps> = ({ field, errors, registerName }) => {
  return (
    <div className="w-full">
      <div className="font-semibold">{field.label}</div>
      {field.fields?.map((field, index) => (
        <Route
          key={index}
          registerName={`${registerName}.${field.label}`}
          field={field}
          errors={errors?.[field.label as never]}
        />
      ))}
    </div>
  )
}

export default Record
