import { Status } from "../status"
import type { BaseActor, FieldType, FunctionName, FunctionType } from "../types"

export type ServiceDetails<A = BaseActor> = {
  [K in FunctionName<A>]: MethodDetail<A>
}

export interface MethodDetail<A = BaseActor>
  extends Omit<MethodArgDetail<A>, "detail">,
    Omit<MethodReturnDetail<A>, "detail"> {
  argDetail: MethodArgDetail<A>["detail"]
  retDetail: MethodReturnDetail<A>["detail"]
}

export interface MethodArgDetail<A = BaseActor> extends FieldDetail {
  functionType: FunctionType
  functionName: FunctionName<A>
  detail: { [key: `arg${number}`]: FieldDetailWithChild }
}

export interface MethodReturnDetail<A = BaseActor> extends FieldDetail {
  functionType: FunctionType
  functionName: FunctionName<A>
  detail: { [key: `ret${number}`]: FieldDetailWithChild }
}

export type DetailType<A = BaseActor> = {
  [K in FunctionName<A>]: MethodArgDetail<A>
}

export interface FieldDetail {
  label: string
  status: Status
  description?: string
}

export interface FieldDetailWithChild extends FieldDetail {
  type?: FieldType
  labelList?: string[]
  list?: FieldDetailWithChild[]
  vector?: FieldDetailWithChild[]
  optional?: FieldDetailWithChild
  tuple?: Record<string, FieldDetailWithChild>
  record?: Record<string, FieldDetailWithChild>
  variant?: Record<string, FieldDetailWithChild>
}
