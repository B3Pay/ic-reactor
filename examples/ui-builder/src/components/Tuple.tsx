import { IDL } from "@dfinity/candid"
import Route, { RouteProps } from "./Route"

interface TupleProps extends RouteProps<IDL.TupleClass<any>> {}

const Tuple: React.FC<TupleProps> = ({ field, registerName, errors }) => {
  return (
    <div className="w-full">
      <div className="font-semibold">{field.label}</div>
      {field.fields?.map((field, index) => (
        <Route
          key={index}
          registerName={`${registerName}.[${index}]`}
          errors={errors?.[index as never]}
          field={field}
        />
      ))}
    </div>
  )
}

export default Tuple
