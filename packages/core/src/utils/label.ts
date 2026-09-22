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
  if (label === "__proto__") return false
  // Find the prototype that holds the label. The root of the chain is the
  // Object.prototype of the realm the value was made in, which is not always
  // this one: a value from an iframe or a `vm` context inherits that realm's
  // `constructor` and `toString`, different functions from this realm's. So
  // what the root holds is inherited whatever its identity, and anything a
  // prototype before it holds, such as a class's getter, is data.
  for (
    let proto: object | null = Object.getPrototypeOf(value);
    proto !== null;
    proto = Object.getPrototypeOf(proto) as object | null
  ) {
    if (Object.prototype.hasOwnProperty.call(proto, label)) {
      return Object.getPrototypeOf(proto) !== null
    }
  }
  return false
}
