import { IDL } from "@icp-sdk/core/candid"
import type { BaseActor, FunctionName } from "@ic-reactor/core"
import { isQuery } from "./helpers"
import { formatLabel } from "./arguments/helpers"

export type FormFieldType =
  | "record"
  | "tuple"
  | "variant"
  | "optional"
  | "vector"
  | "blob"
  | "principal"
  | "text"
  | "number"
  | "boolean"
  | "null"
  | "recursive"
  | "unknown"

type FieldBase = {
  type: FormFieldType
  label: string
  displayLabel: string
  name: string
  candidType: string
  defaultValue: unknown
}

export type FormFieldNode =
  | (FieldBase & { type: "record"; fields: FormFieldNode[] })
  | (FieldBase & { type: "tuple"; fields: FormFieldNode[] })
  | (FieldBase & {
      type: "variant"
      options: FormFieldNode[]
      defaultOption: string
      getOptionDefault: (option: string) => Record<string, unknown>
      getOption: (option: string) => FormFieldNode
      getSelectedKey: (value: Record<string, unknown>) => string
      getSelectedOption: (value: Record<string, unknown>) => FormFieldNode
    })
  | (FieldBase & {
      type: "optional"
      innerField: FormFieldNode
      getInnerDefault: () => unknown
      isEnabled: (value: unknown) => boolean
    })
  | (FieldBase & {
      type: "vector"
      itemField: FormFieldNode
      getItemDefault: () => unknown
      createItemField: (
        index: number,
        overrides?: { label?: string }
      ) => FormFieldNode
    })
  | (FieldBase & { type: "blob" })
  | (FieldBase & { type: "principal" })
  | (FieldBase & { type: "text" })
  | (FieldBase & { type: "number" })
  | (FieldBase & { type: "boolean" })
  | (FieldBase & { type: "null" })
  | (FieldBase & {
      type: "recursive"
      typeName: string
      extract: () => FormFieldNode
    })
  | (FieldBase & { type: "unknown" })

export type FormArgumentsMeta = {
  candidType: string
  functionType: "query" | "update" | "value"
  functionName: string
  args: FormFieldNode[]
  defaults: unknown[]
  argCount: number
  isEmpty: boolean
  schema?: unknown
}

export type FriendlyServiceMeta<A = BaseActor> = {
  [K in FunctionName<A>]?: FormArgumentsMeta
}

export type VariableRefCandidate = {
  expr: string
  label: string
  candidType: string
  fieldType: FormFieldType
  sourceNodeId: string
  sourceRoot?: "arg" | "ret"
}

function cloneField<T extends FormFieldNode>(field: T): T {
  return field.type === "vector" ||
    field.type === "optional" ||
    field.type === "variant" ||
    field.type === "record" ||
    field.type === "tuple" ||
    field.type === "recursive"
    ? JSON.parse(
        JSON.stringify(field, (_k, v) =>
          typeof v === "function" ? undefined : v
        )
      )
    : ({ ...field } as T)
}

export class CandidFriendlyFormVisitor<A = BaseActor> extends IDL.Visitor<
  string,
  FormFieldNode | FormArgumentsMeta | FriendlyServiceMeta<A>
> {
  private recCache = new Map<IDL.RecClass<any>, FormFieldNode>()
  private nameStack: string[] = []

  private withName<T>(name: string, fn: () => T): T {
    this.nameStack.push(name)
    try {
      return fn()
    } finally {
      this.nameStack.pop()
    }
  }

  private currentName(): string {
    return this.nameStack.join("")
  }

  public visitService(t: IDL.ServiceClass): FriendlyServiceMeta<A> {
    const result = {} as FriendlyServiceMeta<A>
    for (const [functionName, func] of t._fields) {
      result[functionName as FunctionName<A>] = func.accept(
        this,
        functionName
      ) as FormArgumentsMeta
    }
    return result
  }

  public visitFunc(t: IDL.FuncClass, functionName: string): FormArgumentsMeta {
    const functionType = isQuery(t) ? "query" : "update"
    const args = t.argTypes.map(
      (argType, index) =>
        this.withName(`[${index}]`, () =>
          argType.accept(this, `__arg${index}`)
        ) as FormFieldNode
    )

    return {
      candidType: t.name,
      functionType,
      functionName,
      args,
      defaults: args.map((arg) => arg.defaultValue),
      argCount: args.length,
      isEmpty: args.length === 0,
      schema: undefined,
    }
  }

  public buildFunctionMeta(
    func: IDL.FuncClass,
    functionName: string
  ): FormArgumentsMeta {
    return func.accept(this, functionName) as FormArgumentsMeta
  }

  public buildValueMeta(
    valueType: IDL.Type,
    functionName = "__value"
  ): FormArgumentsMeta {
    const valueField = this.withName("[0]", () =>
      valueType.accept(this, "__arg0")
    ) as FormFieldNode

    return {
      candidType: valueType.display?.() ?? valueType.name ?? "value",
      functionType: "value",
      functionName,
      args: [valueField],
      defaults: [valueField.defaultValue],
      argCount: 1,
      isEmpty: false,
      schema: undefined,
    }
  }

  public toFormValuesFromDecodedArgs(
    fields: FormFieldNode[],
    decodedArgs: unknown[]
  ): unknown[] {
    return fields.map((field, index) =>
      this.toFormValue(field, decodedArgs[index])
    )
  }

  public collectVariableRefCandidates(
    sourceNodeId: string,
    rootField: FormFieldNode
  ): VariableRefCandidate[] {
    return this.collectRefCandidatesFromRoot(
      sourceNodeId,
      "ret",
      `$${sourceNodeId}`,
      `$${sourceNodeId}`,
      rootField
    )
  }

  public collectRefCandidatesFromRoot(
    sourceNodeId: string,
    sourceRoot: "arg" | "ret",
    rootExpr: string,
    rootLabel: string,
    rootField: FormFieldNode
  ): VariableRefCandidate[] {
    const out: VariableRefCandidate[] = []
    const walk = (field: FormFieldNode, expr: string, label: string) => {
      out.push({
        expr,
        label,
        candidType: field.candidType,
        fieldType: field.type,
        sourceNodeId,
        sourceRoot,
      })

      switch (field.type) {
        case "record":
        case "tuple":
          for (const child of field.fields) {
            walk(child, `${expr}.${child.label}`, `${label}.${child.label}`)
          }
          break
        case "variant":
          for (const child of field.options) {
            walk(child, `${expr}.${child.label}`, `${label}.${child.label}`)
          }
          break
        case "optional":
          walk(field.innerField, `${expr}.some`, `${label}.some`)
          break
        case "vector":
        case "recursive":
        case "unknown":
        case "blob":
        case "principal":
        case "text":
        case "number":
        case "boolean":
        case "null":
          break
      }
    }

    walk(rootField, rootExpr, rootLabel)
    return out
  }

  public buildFieldForType(
    type: IDL.Type,
    label: string,
    path: string
  ): FormFieldNode {
    return this.withName(path, () => type.accept(this, label)) as FormFieldNode
  }

  public buildTupleFieldForTypes(
    types: IDL.Type[],
    label: string,
    path: string
  ): FormFieldNode {
    const tupleType = IDL.Tuple(...types)
    return this.withName(path, () =>
      tupleType.accept(this, label)
    ) as FormFieldNode
  }

  public visitRecord(
    t: IDL.RecordClass,
    fields_: Array<[string, IDL.Type]>,
    label: string
  ): FormFieldNode {
    const name = this.currentName()
    const fields = fields_.map(
      ([key, childType]) =>
        this.withName(name ? `.${key}` : key, () =>
          childType.accept(this, key)
        ) as FormFieldNode
    )

    return {
      type: "record",
      label,
      displayLabel: formatLabel(label),
      name,
      candidType: t.display?.() ?? t.name ?? "record",
      fields,
      defaultValue: Object.fromEntries(
        fields.map((f) => [f.label, f.defaultValue])
      ),
    }
  }

  public visitTuple<T extends IDL.Type[]>(
    _t: IDL.TupleClass<T>,
    components: IDL.Type[],
    label: string
  ): FormFieldNode {
    const name = this.currentName()
    const fields = components.map(
      (childType, index) =>
        this.withName(`[${index}]`, () =>
          childType.accept(this, String(index))
        ) as FormFieldNode
    )

    return {
      type: "tuple",
      label,
      displayLabel: formatLabel(label),
      name,
      candidType: "tuple",
      fields,
      defaultValue: fields.map((f) => f.defaultValue),
    }
  }

  public visitVariant(
    t: IDL.VariantClass,
    fields_: Array<[string, IDL.Type]>,
    label: string
  ): FormFieldNode {
    const name = this.currentName()
    const options = fields_.map(
      ([key, childType]) =>
        this.withName(`.${key}`, () =>
          childType.accept(this, key)
        ) as FormFieldNode
    )

    const first =
      options[0] ?? this.primitive("null", "null", `${name}.null`, "null", null)
    const defaultOption = first.label

    const getOption = (option: string): FormFieldNode => {
      const found = options.find((o) => o.label === option)
      if (!found) {
        throw new Error(`Unknown variant option: ${option}`)
      }
      return found
    }

    const getOptionDefault = (option: string): Record<string, unknown> => {
      const field = getOption(option)
      return field.type === "null"
        ? { _type: option }
        : { _type: option, [option]: field.defaultValue }
    }

    const getSelectedKey = (value: Record<string, unknown>): string => {
      if (typeof value?._type === "string") return value._type
      const firstPresent = Object.keys(value ?? {}).find((k) =>
        options.some((o) => o.label === k)
      )
      return firstPresent ?? defaultOption
    }

    const getSelectedOption = (value: Record<string, unknown>): FormFieldNode =>
      getOption(getSelectedKey(value))

    return {
      type: "variant",
      label,
      displayLabel: formatLabel(label),
      name,
      candidType: t.display?.() ?? t.name ?? "variant",
      options,
      defaultOption,
      defaultValue: getOptionDefault(defaultOption),
      getOptionDefault,
      getOption,
      getSelectedKey,
      getSelectedOption,
    }
  }

  public visitOpt<T>(
    _t: IDL.OptClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): FormFieldNode {
    const name = this.currentName()
    const innerField = ty.accept(this, label) as FormFieldNode

    return {
      type: "optional",
      label,
      displayLabel: formatLabel(label),
      name,
      candidType: `opt ${innerField.candidType}`,
      innerField,
      defaultValue: null,
      getInnerDefault: () => innerField.defaultValue,
      isEnabled: (value: unknown) => value !== null && value !== undefined,
    }
  }

  public visitVec<T>(
    _t: IDL.VecClass<T>,
    ty: IDL.Type<T>,
    label: string
  ): FormFieldNode {
    const name = this.currentName()

    if (ty instanceof IDL.FixedNatClass && ty._bits === 8) {
      return this.primitive("blob", label, name, "blob", "")
    }

    const itemFieldTemplate = this.withName("[0]", () =>
      ty.accept(this, `${label}_item`)
    ) as FormFieldNode

    const createItemField = (index: number, overrides?: { label?: string }) => {
      return this.withName(`[${index}]`, () =>
        ty.accept(this, overrides?.label ?? String(index))
      ) as FormFieldNode
    }

    return {
      type: "vector",
      label,
      displayLabel: formatLabel(label),
      name,
      candidType: `vec ${ty.display?.() ?? ty.name}`,
      itemField: itemFieldTemplate,
      defaultValue: [],
      getItemDefault: () => cloneField(itemFieldTemplate).defaultValue,
      createItemField,
    }
  }

  public visitRec<T>(
    t: IDL.RecClass<T>,
    ty: IDL.ConstructType<T>,
    label: string
  ): FormFieldNode {
    const name = this.currentName()

    if (this.recCache.has(t)) {
      return this.recCache.get(t)!
    }

    const node: FormFieldNode = {
      type: "recursive",
      label,
      displayLabel: formatLabel(label),
      name,
      candidType: ty.name,
      defaultValue: undefined,
      typeName: ty.name,
      extract: () =>
        this.withName(name, () => ty.accept(this, label)) as FormFieldNode,
    }

    this.recCache.set(t, node)
    return node
  }

  public visitPrincipal(_t: IDL.PrincipalClass, label: string): FormFieldNode {
    return this.primitive(
      "principal",
      label,
      this.currentName(),
      "principal",
      ""
    )
  }

  public visitText(_t: IDL.TextClass, label: string): FormFieldNode {
    return this.primitive("text", label, this.currentName(), "text", "")
  }

  public visitBool(_t: IDL.BoolClass, label: string): FormFieldNode {
    return this.primitive("boolean", label, this.currentName(), "bool", false)
  }

  public visitNull(_t: IDL.NullClass, label: string): FormFieldNode {
    return this.primitive("null", label, this.currentName(), "null", null)
  }

  public visitInt(_t: IDL.IntClass, label: string): FormFieldNode {
    return this.primitive("number", label, this.currentName(), "int", "")
  }

  public visitNat(_t: IDL.NatClass, label: string): FormFieldNode {
    return this.primitive("number", label, this.currentName(), "nat", "")
  }

  public visitFloat(t: IDL.FloatClass, label: string): FormFieldNode {
    return this.primitive(
      "number",
      label,
      this.currentName(),
      `float${t._bits}`,
      ""
    )
  }

  public visitFixedInt(t: IDL.FixedIntClass, label: string): FormFieldNode {
    return this.primitive(
      "number",
      label,
      this.currentName(),
      `int${t._bits}`,
      ""
    )
  }

  public visitFixedNat(t: IDL.FixedNatClass, label: string): FormFieldNode {
    return this.primitive(
      "number",
      label,
      this.currentName(),
      `nat${t._bits}`,
      ""
    )
  }

  public visitType<T>(t: IDL.Type<T>, label: string): FormFieldNode {
    return this.primitive(
      "unknown",
      label,
      this.currentName(),
      t.name ?? "unknown",
      null
    )
  }

  private primitive<T extends FormFieldType>(
    type: T,
    label: string,
    name: string,
    candidType: string,
    defaultValue: unknown
  ): Extract<FormFieldNode, { type: T }> {
    return {
      type,
      label,
      displayLabel: formatLabel(label),
      name,
      candidType,
      defaultValue,
    } as Extract<FormFieldNode, { type: T }>
  }

  private toFormValue(field: FormFieldNode, raw: unknown): unknown {
    switch (field.type) {
      case "record": {
        const obj = (raw ?? {}) as Record<string, unknown>
        return Object.fromEntries(
          field.fields.map((child) => [
            child.label,
            this.toFormValue(child, obj[child.label]),
          ])
        )
      }
      case "tuple": {
        const arr = Array.isArray(raw) ? raw : []
        return field.fields.map((child, idx) =>
          this.toFormValue(child, arr[idx])
        )
      }
      case "variant": {
        const obj = (raw ?? {}) as Record<string, unknown>
        const keys = Object.keys(obj)
        const tag =
          keys.find((k) => field.options.some((o) => o.label === k)) ??
          field.defaultOption
        const optionField = field.getOption(tag)
        if (optionField.type === "null") return { _type: tag }
        return { _type: tag, [tag]: this.toFormValue(optionField, obj[tag]) }
      }
      case "optional": {
        if (Array.isArray(raw)) {
          if (raw.length === 0) return null
          return this.toFormValue(field.innerField, raw[0])
        }
        if (raw == null) return null
        return this.toFormValue(field.innerField, raw)
      }
      case "vector": {
        if (!Array.isArray(raw)) return []
        return raw.map((v, idx) =>
          this.toFormValue(field.createItemField(idx), v)
        )
      }
      case "blob": {
        if (raw instanceof Uint8Array) {
          return Array.from(raw)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")
        }
        if (Array.isArray(raw)) {
          return raw
            .map((v) => Number(v))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")
        }
        return typeof raw === "string" ? raw : ""
      }
      case "principal":
        return raw &&
          typeof (raw as { toText?: () => string }).toText === "function"
          ? (raw as { toText: () => string }).toText()
          : raw != null
            ? String(raw)
            : ""
      case "text":
        return raw != null ? String(raw) : ""
      case "number":
        return raw == null ? "" : String(raw)
      case "boolean":
        return Boolean(raw)
      case "null":
        return null
      case "recursive":
        return raw
      case "unknown":
        return raw ?? null
    }
  }
}
