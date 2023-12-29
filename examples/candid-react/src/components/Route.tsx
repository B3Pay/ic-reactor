import React from "react"
import Vector from "./Vector"
import Input from "./Input"
import Optional from "./Optional"
import Variant from "./Variant"
import Recursive from "./Recursive"
import Record from "./Record"
import Tuple from "./Tuple"
import { FieldError, FieldErrorsImpl, Merge } from "react-hook-form"
import Principal from "./Principal"
import { ExtractedField } from "@ic-reactor/store/dist/candid"

export interface RouteProps {
  field: ExtractedField
  registerName: string
  errors: FieldError | Merge<FieldError, FieldErrorsImpl<any>> | undefined
}

const Route: React.FC<RouteProps> = (props) => {
  switch (props.field.type) {
    case "vector":
      return <Vector {...props} />
    case "optional":
      return <Optional {...props} />
    case "record":
      return <Record {...props} />
    case "tuple":
      return <Tuple {...props} />
    case "variant":
      return <Variant {...props} />
    case "recursive":
      return <Recursive {...props} />
    case "principal":
      return <Principal {...props} />
    default:
      return <Input {...props} />
  }
}

export default Route
