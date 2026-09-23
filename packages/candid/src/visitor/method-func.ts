import { IDL } from "@icp-sdk/core/candid"

/**
 * The func type of a service method, or `undefined` for a type that is not
 * one.
 *
 * A method typed by a recursive func alias (`type f = func (f) -> (f)`) is an
 * `IDL.Rec` wrapping the func, with no `argTypes`, `retTypes` or
 * `annotations` of its own, so the func is resolved first, as core's display
 * codecs do since #557. Deliberately not re-exported from the package.
 */
export function methodFunc(type: IDL.Type): IDL.FuncClass | undefined {
  let resolved: IDL.Type | undefined = type
  while (resolved instanceof IDL.RecClass) resolved = resolved.getType()
  return resolved instanceof IDL.FuncClass ? resolved : undefined
}
