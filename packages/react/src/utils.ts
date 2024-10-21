export * from "@ic-reactor/core/dist/utils"

// Improved UnwrapResult type
export type UnwrapResult<T> = T extends { Ok: infer U }
  ? U
  : T extends { Err: infer E }
  ? E
  : T

// Helper type to extract Ok and Err types
type ExtractOkErr<T> = T extends { Ok: infer U }
  ? { OkType: U; ErrType: never }
  : T extends { Err: infer E }
  ? { OkType: never; ErrType: E }
  : { OkType: T; ErrType: never }

// Improved CompiledResult type
export type CompiledResult<T> = ExtractOkErr<T> extends {
  OkType: infer U
  ErrType: infer E
}
  ?
      | {
          isOk: true
          isErr: false
          value: U
          error: null
        }
      | {
          isOk: false
          isErr: true
          value: null
          error: E
        }
  : never

// Helper function to create a CompiledResult
export function createCompiledResult<T>(result: T): CompiledResult<T> {
  if (result && typeof result === "object" && "Ok" in result) {
    return {
      isOk: true,
      isErr: false,
      value: (result as { Ok: unknown }).Ok,
      error: null,
    } as CompiledResult<T>
  } else if (result && typeof result === "object" && "Err" in result) {
    return {
      isOk: false,
      isErr: true,
      value: null,
      error: (result as { Err: unknown }).Err,
    } as CompiledResult<T>
  } else {
    // For non-Result types
    return {
      isOk: false,
      isErr: false,
      value: undefined,
      error: null,
    } as never
  }
}
