import React from "react"
import Tuple, { TupleProps } from "./Tuple"
import Vector, { VectorProps } from "./Vector"
import Record, { RecordProps } from "./Record"
import Variant, { VariantProps } from "./Variant"
import Optional, { OptionalProps } from "./Optional"
import Recursive, { RecursiveProps } from "./Recursive"
import { FieldError, FieldErrorsImpl, Merge } from "react-hook-form"
import {
  DynamicFieldType,
  ExtractedFieldType,
} from "@ic-reactor/react/dist/types"

import Principal, { PrincipalProps } from "./Inputs/Principal"
import Boolean, { BooleanProps } from "./Inputs/Boolean"
import Number, { NumberProps } from "./Inputs/Number"
import NullINput, { NullProps } from "./Inputs/Null"
import Text, { TextProps } from "./Inputs/Text"

export interface RouteProps<T extends ExtractedFieldType = any> {
  extractedField: DynamicFieldType<T>
  registerName: string
  shouldUnregister?: boolean
  errors: FieldError | Merge<FieldError, FieldErrorsImpl<any>> | undefined
}

const Route: React.FC<RouteProps> = (props) => {
  switch (props.extractedField.type) {
    case "vector":
      return <Vector {...(props as VectorProps)} />
    case "optional":
      return <Optional {...(props as OptionalProps)} />
    case "record":
      return <Record {...(props as RecordProps)} />
    case "tuple":
      return <Tuple {...(props as TupleProps)} />
    case "variant":
      return <Variant {...(props as VariantProps)} />
    case "recursive":
      return <Recursive {...(props as RecursiveProps)} />
    case "principal":
      return <Principal {...(props as PrincipalProps)} />
    case "null":
      return <NullINput {...(props as NullProps)} />
    case "boolean":
      return <Boolean {...(props as BooleanProps)} />
    case "number":
      return <Number {...(props as NumberProps)} />
    default:
      return <Text {...(props as TextProps)} />
  }
}

export default Route
