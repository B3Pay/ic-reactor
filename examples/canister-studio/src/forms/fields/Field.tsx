import type { ReactNode } from "react"
import { useFormContext, type FieldProps } from "../context.ts"
import { controlOf, isUninhabited } from "../engine.ts"
import { BytesField } from "./BytesField.tsx"
import {
  FuncField,
  OptField,
  RecordField,
  TupleField,
  VariantField,
} from "./composites.tsx"
import {
  BigIntField,
  BoolField,
  FixedField,
  FloatField,
  IntegerField,
  PrincipalField,
  TextField,
  UninhabitedField,
} from "./leaves.tsx"
import { ListField } from "./ListField.tsx"
import { TimestampField } from "./TimestampField.tsx"
import { UnitsField } from "./UnitsField.tsx"

/** The editor a schema calls for, with its hint applied. */
export function Field(props: FieldProps): ReactNode {
  const form = useFormContext()
  const { schema, path, fieldKey, inheritedHint } = props
  const hint = inheritedHint ?? form.hint({ path, key: fieldKey, schema })
  if (hint?.hidden === true) return null
  // A hint's label renames a labelled field; it never adds one.
  const label =
    props.label === undefined ? undefined : (hint?.label ?? props.label)
  const editor = { ...props, label, hint }
  // A type with no values (`record { next : Loop }`) would otherwise render
  // its own fields forever: it gets one notice instead.
  if (props.draft.k === "uninhabited" || isUninhabited(schema))
    return <UninhabitedField {...editor} />
  const control = controlOf(schema)
  switch (control.control) {
    case "text":
      return <TextField {...editor} />
    case "bool":
      return <BoolField {...editor} />
    case "bigint": {
      const { primitive, min, max } = control
      if (hint?.widget === "timestamp-nanos")
        return <TimestampField {...editor} primitive={primitive} />
      if (hint?.units !== undefined)
        return (
          <UnitsField
            {...editor}
            units={hint.units}
            primitive={primitive}
            signed={min === undefined || min < 0n}
          />
        )
      return (
        <BigIntField {...editor} primitive={primitive} min={min} max={max} />
      )
    }
    case "integer":
      return (
        <IntegerField
          {...editor}
          primitive={control.primitive}
          min={control.min}
          max={control.max}
        />
      )
    case "float":
      return <FloatField {...editor} bits={control.bits} />
    case "principal":
      return <PrincipalField {...editor} />
    case "serviceReference":
      return <PrincipalField {...editor} service />
    case "fixed":
      return <FixedField {...editor} what={control.what} />
    case "uninhabited":
      return <UninhabitedField {...editor} />
    case "bytes":
      return <BytesField {...editor} />
    case "optional":
      return (
        <OptField {...editor} boxed={control.boxed} inner={control.inner} />
      )
    case "list":
      return <ListField {...editor} item={control.item} />
    case "group":
      // A hand-built `c.record({})` is a record without fields: `record {}`.
      if (control.fields.length === 0)
        return <FixedField {...editor} what="unit" />
      return <RecordField {...editor} fields={control.fields} />
    case "tuple":
      return <TupleField {...editor} elements={control.elements} />
    case "choice":
      return <VariantField {...editor} arms={control.arms} />
    case "funcReference":
      return <FuncField {...editor} mode={control.mode} />
    default: {
      const never: never = control
      return never
    }
  }
}
