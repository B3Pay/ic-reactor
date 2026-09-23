/**
 * Does a value hold a Candid `label`?
 *
 * `value[label]` also finds what every object inherits from Object.prototype,
 * so a record field called `toString` that a hand-built value left out read
 * back as `Object.prototype.toString`, and one called `constructor` as the
 * `Object` constructor. Those are never data. A property the value has itself,
 * or gets from a prototype of its own such as a class getter, still counts.
 * This is the rule core's display codecs follow since #483.
 *
 * Internal: deliberately not re-exported from the package.
 */
export function hasLabel(value: object, label: string): boolean {
  if (Object.prototype.hasOwnProperty.call(value, label)) return true
  // `__proto__` names the prototype itself, never an inherited field.
  if (label === "__proto__") return false
  // Find the prototype that holds the label. The root of the chain is the
  // Object.prototype of the realm the value was made in, which is not always
  // this one, so what the root holds is inherited whatever its identity, and
  // anything a prototype before it holds, such as a class's getter, is data.
  for (
    let proto: object | null = Object.getPrototypeOf(value) as object | null;
    proto !== null;
    proto = Object.getPrototypeOf(proto) as object | null
  ) {
    if (Object.prototype.hasOwnProperty.call(proto, label)) {
      return Object.getPrototypeOf(proto) !== null
    }
  }
  return false
}

/** A label's value, or `undefined` for one the value does not hold. */
export function labelValue(value: object, label: string): unknown {
  return hasLabel(value, label)
    ? (value as Record<string, unknown>)[label]
    : undefined
}
