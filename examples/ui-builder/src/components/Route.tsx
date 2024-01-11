import React from "react"
import Input from "./Input"
import Tuple from "./Tuple"
import Vector from "./Vector"
import Record from "./Record"
import Variant from "./Variant"
import Optional from "./Optional"
import Recursive from "./Recursive"
import Principal from "./Principal"
import { FieldError, FieldErrorsImpl, Merge } from "react-hook-form"
import { DynamicFieldType, IDL } from "@ic-reactor/react/dist/types"

export interface RouteProps<T extends IDL.Type<any> = any> {
  field: DynamicFieldType<T>
  registerName: string
  errors: FieldError | Merge<FieldError, FieldErrorsImpl<any>> | undefined
}

const Route: React.FC<RouteProps> = (props) => {
  switch (props.field.type) {
    case "vector":
      return <Vector {...(props as RouteProps<IDL.VecClass<any>>)} />
    case "optional":
      return <Optional {...(props as RouteProps<IDL.OptClass<any>>)} />
    case "record":
      return <Record {...(props as RouteProps<IDL.RecordClass>)} />
    case "tuple":
      return <Tuple {...(props as RouteProps<IDL.TupleClass<any>>)} />
    case "variant":
      return <Variant {...(props as RouteProps<IDL.VariantClass>)} />
    case "recursive":
      return <Recursive {...(props as RouteProps<IDL.RecClass>)} />
    case "principal":
      return <Principal {...(props as RouteProps<IDL.PrincipalClass>)} />
    default:
      return <Input {...(props as RouteProps<IDL.Type<any>>)} />
  }
}

export default Route
