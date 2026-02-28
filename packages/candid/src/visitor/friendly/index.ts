import { IDL } from "@icp-sdk/core/candid"
import { Principal } from "@icp-sdk/core/principal"
import type { BaseActor, FunctionName } from "@ic-reactor/core"
import * as z from "zod"
import { isQuery } from "../helpers"
import { formatLabel } from "../arguments/helpers"
import type {
  FriendlyServiceMeta,
  FormArgumentsMeta,
  FormFieldNode,
  FormFieldType,
  FormRenderHint,
  VariableRefCandidate,
} from "./types"
import { cloneField, toFormValue } from "./helpers"

export * from "./types"

const COMPOUND_RENDER_HINT: FormRenderHint = {
  isCompound: true,
  isPrimitive: false,
}

const TEXT_RENDER_HINT: FormRenderHint = {
  isCompound: false,
  isPrimitive: true,
  inputType: "text",
}

const NUMBER_RENDER_HINT: FormRenderHint = {
  isCompound: false,
  isPrimitive: true,
  inputType: "number",
}

const CHECKBOX_RENDER_HINT: FormRenderHint = {
  isCompound: false,
  isPrimitive: true,
  inputType: "checkbox",
}

const FILE_RENDER_HINT: FormRenderHint = {
  isCompound: false,
  isPrimitive: true,
  inputType: "file",
}

export class CandidFriendlyFormVisitor<A = BaseActor> extends IDL.Visitor<
  string,
  FormFieldNode | FormArgumentsMeta | FriendlyServiceMeta<A>
> {
  private recCache = new Map<IDL.RecClass<any>, FormFieldNode>()
  private recursiveSchemas: Map<string, z.ZodTypeAny> = new Map()
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
    const argCount = args.length
    const schema =
      argCount === 0
        ? (z.tuple([]) as unknown as z.ZodTuple<
            [z.ZodTypeAny, ...z.ZodTypeAny[]]
          >)
        : z.tuple(
            args.map((field) => field.schema) as [
              z.ZodTypeAny,
              ...z.ZodTypeAny[],
            ]
          )

    return {
      candidType: t.name,
      functionType,
      functionName,
      args,
      defaults: args.map((arg) => arg.defaultValue),
      argCount,
      isEmpty: argCount === 0,
      schema,
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
      schema: z.tuple([valueField.schema]),
    }
  }

  public toFormValuesFromDecodedArgs(
    fields: FormFieldNode[],
    decodedArgs: unknown[]
  ): unknown[] {
    return fields.map((field, index) => toFormValue(field, decodedArgs[index]))
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
    const schema = z.object(
      Object.fromEntries(fields.map((field) => [field.label, field.schema]))
    )

    return {
      type: "record",
      label,
      displayLabel: formatLabel(label),
      name,
      component: "record-container",
      renderHint: COMPOUND_RENDER_HINT,
      candidType: t.display?.() ?? t.name ?? "record",
      fields,
      defaultValue: Object.fromEntries(
        fields.map((f) => [f.label, f.defaultValue])
      ),
      schema,
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
    const schema =
      fields.length === 0
        ? (z.tuple([]) as unknown as z.ZodTuple<
            [z.ZodTypeAny, ...z.ZodTypeAny[]]
          >)
        : z.tuple(
            fields.map((field) => field.schema) as [
              z.ZodTypeAny,
              ...z.ZodTypeAny[],
            ]
          )

    return {
      type: "tuple",
      label,
      displayLabel: formatLabel(label),
      name,
      component: "tuple-container",
      renderHint: COMPOUND_RENDER_HINT,
      candidType: "tuple",
      fields,
      defaultValue: fields.map((f) => f.defaultValue),
      schema,
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
      options[0] ??
      this.primitive("null", "null", `${name}.null`, "null", null, z.null())
    const defaultOption = first.label
    const variantSchemas = options.map((option) =>
      option.type === "null"
        ? z.object({ _type: z.literal(option.label) })
        : z.object({
            _type: z.literal(option.label),
            [option.label]: option.schema,
          })
    )

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
      component: "variant-select",
      renderHint: COMPOUND_RENDER_HINT,
      candidType: t.display?.() ?? t.name ?? "variant",
      options,
      defaultOption,
      defaultValue: getOptionDefault(defaultOption),
      schema:
        variantSchemas.length === 0
          ? z.object({ _type: z.literal(defaultOption) })
          : z.union(
              variantSchemas as unknown as [z.ZodTypeAny, ...z.ZodTypeAny[]]
            ),
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
      component: "optional-toggle",
      renderHint: COMPOUND_RENDER_HINT,
      candidType: `opt ${innerField.candidType}`,
      innerField,
      defaultValue: null,
      schema: z.union([
        innerField.schema,
        z.null(),
        z.undefined().transform(() => null),
      ]),
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
      return this.primitive(
        "blob",
        label,
        name,
        "blob",
        "",
        z.union([z.string(), z.array(z.number()), z.instanceof(Uint8Array)])
      )
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
      component: "vector-list",
      renderHint: COMPOUND_RENDER_HINT,
      candidType: `vec ${ty.display?.() ?? ty.name}`,
      itemField: itemFieldTemplate,
      defaultValue: [],
      schema: z.array(itemFieldTemplate.schema),
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
    const typeName = ty.name || "RecursiveType"
    let schema: z.ZodTypeAny

    if (this.recCache.has(t)) {
      return this.recCache.get(t)!
    }

    if (this.recursiveSchemas.has(typeName)) {
      schema = this.recursiveSchemas.get(typeName)!
    } else {
      schema = z.lazy(() => (ty.accept(this, label) as FormFieldNode).schema)
      this.recursiveSchemas.set(typeName, schema)
    }

    const node: FormFieldNode = {
      type: "recursive",
      label,
      displayLabel: formatLabel(label),
      name,
      component: "recursive-lazy",
      renderHint: COMPOUND_RENDER_HINT,
      candidType: ty.name,
      defaultValue: undefined,
      schema,
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
      "",
      z.custom<Principal>(
        (val) => {
          if (val instanceof Principal) return true
          if (typeof val === "string") {
            try {
              Principal.fromText(val)
              return true
            } catch {
              return false
            }
          }
          return false
        },
        { message: "Invalid Principal format" }
      )
    )
  }

  public visitText(_t: IDL.TextClass, label: string): FormFieldNode {
    return this.primitive(
      "text",
      label,
      this.currentName(),
      "text",
      "",
      z.string().min(1, "Required")
    )
  }

  public visitBool(_t: IDL.BoolClass, label: string): FormFieldNode {
    return this.primitive(
      "boolean",
      label,
      this.currentName(),
      "bool",
      false,
      z.boolean()
    )
  }

  public visitNull(_t: IDL.NullClass, label: string): FormFieldNode {
    return this.primitive(
      "null",
      label,
      this.currentName(),
      "null",
      null,
      z.null()
    )
  }

  public visitInt(_t: IDL.IntClass, label: string): FormFieldNode {
    return this.primitive(
      "number",
      label,
      this.currentName(),
      "int",
      "",
      z
        .string()
        .min(1, "Required")
        .refine((val) => !isNaN(Number(val)), {
          message: "Must be a number",
        })
    )
  }

  public visitNat(_t: IDL.NatClass, label: string): FormFieldNode {
    return this.primitive(
      "number",
      label,
      this.currentName(),
      "nat",
      "",
      z.string().regex(/^\d+$/, "Must be a positive number")
    )
  }

  public visitFloat(t: IDL.FloatClass, label: string): FormFieldNode {
    return this.primitive(
      "number",
      label,
      this.currentName(),
      `float${t._bits}`,
      "",
      z
        .string()
        .min(1, "Required")
        .refine((val) => !isNaN(Number(val)), {
          message: "Must be a number",
        })
    )
  }

  public visitFixedInt(t: IDL.FixedIntClass, label: string): FormFieldNode {
    return this.primitive(
      "number",
      label,
      this.currentName(),
      `int${t._bits}`,
      "",
      z
        .string()
        .min(1, "Required")
        .refine((val) => !isNaN(Number(val)), {
          message: "Must be a number",
        })
    )
  }

  public visitFixedNat(t: IDL.FixedNatClass, label: string): FormFieldNode {
    return this.primitive(
      "number",
      label,
      this.currentName(),
      `nat${t._bits}`,
      "",
      z.string().regex(/^\d+$/, "Must be a positive number")
    )
  }

  public visitType<T>(t: IDL.Type<T>, label: string): FormFieldNode {
    return this.primitive(
      "unknown",
      label,
      this.currentName(),
      t.name ?? "unknown",
      null,
      z.any()
    )
  }

  private primitive<T extends FormFieldType>(
    type: T,
    label: string,
    name: string,
    candidType: string,
    defaultValue: unknown,
    schema: z.ZodTypeAny
  ): Extract<FormFieldNode, { type: T }> {
    const component =
      type === "blob"
        ? "blob-upload"
        : type === "principal"
          ? "principal-input"
          : type === "text"
            ? "text-input"
            : type === "number"
              ? "number-input"
              : type === "boolean"
                ? "boolean-checkbox"
                : type === "null"
                  ? "null-hidden"
                  : "unknown-fallback"

    const renderHint =
      type === "blob"
        ? FILE_RENDER_HINT
        : type === "number"
          ? NUMBER_RENDER_HINT
          : type === "boolean"
            ? CHECKBOX_RENDER_HINT
            : TEXT_RENDER_HINT

    return {
      type,
      label,
      displayLabel: formatLabel(label),
      name,
      component,
      renderHint,
      candidType,
      defaultValue,
      schema,
    } as Extract<FormFieldNode, { type: T }>
  }
}
