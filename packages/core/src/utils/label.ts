/**
 * Does a display value hold a Candid `label`?
 *
 * `label in value` and `value[label]` also find what every object inherits
 * from Object.prototype, so a record field called `toString` that the caller
 * left out read back as `Object.prototype.toString`, and one called
 * `constructor` as the `Object` constructor. Those are never data. A property
 * the value has itself, or gets from a prototype of its own such as a class
 * getter, still counts.
 *
 * Internal: deliberately not re-exported from `utils/index`.
 */
export function hasLabel(value: object, label: string): boolean {
  if (Object.prototype.hasOwnProperty.call(value, label)) return true
  // `__proto__` names the prototype itself, never an inherited field.
  if (label === "__proto__" || !(label in value)) return false
  const inherited = Object.prototype as unknown as Record<string, unknown>
  return (value as Record<string, unknown>)[label] !== inherited[label]
}
