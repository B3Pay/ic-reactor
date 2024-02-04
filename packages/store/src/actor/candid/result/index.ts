import { IDL } from "@dfinity/candid"
import { FieldType } from "../types"

export type ResultData = {
  label?: string
  value: any
}

export type ResultArray = {
  label?: string
  value: any[]
}

export type ResultValue = Result | string | number | boolean | null

export type FunctionResult = {
  description: string
  functionName: string
  values: Record<string, Result>
}

export type Result = {
  type: FieldType
  label?: string
  value?: ResultValue
  values?: Result[] | Record<string, Result>
  description: string
}

export class ExtractResult extends IDL.Visitor<
  ResultData | ResultArray,
  Result | FunctionResult
> {
  public visitFunc(
    t: IDL.FuncClass,
    { label, value }: ResultArray
  ): FunctionResult {
    const values = value.reduce((acc, value, index) => {
      const type = t.argTypes[index]
      acc[`arg${index}`] = type.accept(this, {
        label: `arg${index}`,
        value,
      })

      return acc
    }, {} as Result)

    return {
      functionName: label as string,
      values,
      description: "function",
    }
  }
  public visitNumber<T>(t: IDL.Type<T>, { value, label }: ResultData): Result {
    return {
      type: "number",
      label,
      value: t.valueToString(value),
      description: "number",
    }
  }

  public visitText(_t: IDL.TextClass, { value, label }: ResultData): Result {
    return {
      type: "text",
      label,
      value,
      description: "text",
    }
  }

  public visitInt(t: IDL.IntClass, data: ResultData): Result {
    return this.visitNumber(t, data)
  }

  public visitNat(t: IDL.NatClass, data: ResultData): Result {
    return this.visitNumber(t, data)
  }

  public visitFloat(t: IDL.FloatClass, data: ResultData): Result {
    return this.visitNumber(t, data)
  }

  public visitFixedInt(t: IDL.FixedIntClass, data: ResultData): Result {
    return this.visitNumber(t, data)
  }

  public visitFixedNat(t: IDL.FixedNatClass, data: ResultData): Result {
    return this.visitNumber(t, data)
  }
  public visitType<T>(t: IDL.Type<T>, { value, label }: ResultData): Result {
    return {
      type: "unknown",
      label,
      value: t.valueToString(value),
      description: "unknown",
    }
  }
  public visitPrincipal(_t: IDL.PrincipalClass, data: ResultData): Result {
    return {
      type: "principal",
      value: data.toString(),
      description: "principal",
    }
  }
  private visitedRecursive: Record<string, true> = {}
  public visitRec<T>(
    _t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    data: ResultData
  ): Result {
    const recLabel = `type-${ty.name}`
    if (!this.visitedRecursive[recLabel]) {
      this.visitedRecursive[recLabel] = true

      return ty.accept(this, data) as Result
    }

    return {
      type: "recursive",
      label: data.label,
      value: data.value,
      description: "recursive",
    }
  }

  public visitOpt<T>(
    _t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    { value, label }: ResultData
  ): Result {
    return {
      type: "optional",
      label,
      value: value ? (ty.accept(this, { value, label }) as Result) : null,
      description: "optional",
    }
  }

  public visitRecord(
    _t: IDL.RecordClass,
    fields: Array<[string, IDL.Type]>,
    { value, label }: ResultData
  ): Result {
    const values = fields.reduce((acc, [key, type]) => {
      acc[key] = type.accept(this, {
        label: key,
        value: value[key],
      }) as Result

      return acc
    }, {} as Record<string, Result>)

    return {
      type: "record",
      label,
      values,
      description: "record",
    }
  }
  public visitTuple<T extends any[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type[],
    { value, label }: ResultData
  ): Result {
    const values = components.reduce(
      (acc, type, index) => {
        const field = type.accept(this, {
          label: `_${index}_`,
          value: value[index],
        }) as Result
        acc.push(field)

        return acc
      },

      [] as Result[]
    )

    return {
      type: "tuple",
      label,
      values,
      description: "tuple",
    }
  }
  public visitVariant(
    _t: IDL.VariantClass,
    fields: Array<[string, IDL.Type]>,
    { value, label }: ResultData
  ): Result {
    const values = fields.reduce((acc, [key, type]) => {
      const field = type.accept(this, {
        label: key,
        value: value[key],
      }) as Result

      acc.push(field)

      return acc
    }, [] as Result[])

    return {
      type: "variant",
      label,
      values,
      description: "variant",
    }
  }
  public visitVec<T>(
    _t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    { value, label }: ResultData
  ): Result {
    const values = value.map((value: any) =>
      ty.accept(this, {
        label,
        value,
      })
    )

    return {
      type: "vector",
      label,
      values,
      description: "vector",
    }
  }
}
