import type { FormFieldNode } from "./types.js"

export function cloneField<T extends FormFieldNode>(field: T): T {
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

export function toFormValue(field: FormFieldNode, raw: unknown): unknown {
  switch (field.type) {
    case "record": {
      const obj = (raw ?? {}) as Record<string, unknown>
      return Object.fromEntries(
        field.fields.map((child) => [
          child.label,
          toFormValue(child, obj[child.label]),
        ])
      )
    }
    case "tuple": {
      const arr = Array.isArray(raw) ? raw : []
      return field.fields.map((child, idx) => toFormValue(child, arr[idx]))
    }
    case "variant": {
      const obj = (raw ?? {}) as Record<string, unknown>
      const keys = Object.keys(obj)
      const tag =
        keys.find((k) => field.options.some((o) => o.label === k)) ??
        field.defaultOption
      const optionField = field.getOption(tag)
      if (optionField.type === "null") return { _type: tag }
      return { _type: tag, [tag]: toFormValue(optionField, obj[tag]) }
    }
    case "optional": {
      if (Array.isArray(raw)) {
        if (raw.length === 0) return null
        return toFormValue(field.innerField, raw[0])
      }
      if (raw == null) return null
      return toFormValue(field.innerField, raw)
    }
    case "vector": {
      // IDL.decode returns a typed array for a fixed-width integer vector
      // (`vec nat64` is a BigUint64Array), which is not an Array, so hydrating
      // one used to drop every element.
      const items = Array.isArray(raw)
        ? raw
        : ArrayBuffer.isView(raw) && !(raw instanceof DataView)
          ? Array.from(raw as unknown as ArrayLike<unknown>)
          : []
      return items.map((v, idx) => toFormValue(field.createItemField(idx), v))
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
      // The node is a lazy handle on its inner type at the same path, so its
      // form value is the inner type's. Returning `raw` handed the form
      // decoded Candid, with bigints, `[]` and `[x]` options and variants
      // without `_type`, which the field's own schema rejects. extract()
      // builds one level, so this recurses only as deep as the data. Missing
      // data stays as it is, because there is nothing to follow and a
      // variant's default option could be this same type again.
      return raw == null ? raw : toFormValue(field.extract(), raw)
    case "unknown":
      return raw ?? null
  }
}
