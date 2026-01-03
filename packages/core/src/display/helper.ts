import { IDL } from "@icp-sdk/core/candid"
import { ActorDisplayCodec, DisplayOf, DisplayCodec } from "./types"
import { DisplayCodecVisitor } from "./visitor"

export function didToDisplayCodec<
  TCandid = unknown,
  TDisplay = DisplayOf<TCandid>,
>(didType: IDL.Type): ActorDisplayCodec<TCandid, TDisplay> {
  const visitor = new DisplayCodecVisitor()
  const codec = visitor.visitType(didType, null) as DisplayCodec<
    TCandid,
    TDisplay
  >
  // Return a unified interface with both native methods and convenience aliases
  return {
    codec,
    asDisplay: (val: TCandid) => codec.decode(val) as TDisplay,
    asCandid: (val: TDisplay) => codec.encode(val) as TCandid,
  }
}

export function didToDisplayCodecs<TTypes extends Record<string, IDL.Type>>(
  didTypes: TTypes
): {
  [K in keyof TTypes]: TTypes[K] extends IDL.Type<infer TCandid>
    ? ActorDisplayCodec<TCandid>
    : never
} {
  const result = {} as any

  for (const [name, idlType] of Object.entries(didTypes)) {
    result[name] = didToDisplayCodec(idlType)
  }

  return result
}

export function transformArgsWithCodec<T extends unknown[]>(
  argsCodec: ActorDisplayCodec,
  args: unknown[] | undefined
): T {
  // Empty args - no transformation needed
  // This handles methods with 0 arguments where codec is IDL.Null
  if (!args || args.length === 0) {
    return (args || []) as T
  }

  // Single argument - unwrap from array and transform
  if (args.length === 1) {
    try {
      return [argsCodec.asCandid(args[0])] as T
    } catch {
      // Fallback: return as-is if transformation fails
      return args as T
    }
  }

  // Multiple arguments - transform as tuple
  try {
    return argsCodec.asCandid(args) as T
  } catch {
    // Fallback: return as-is if transformation fails
    return args as T
  }
}

export function transformResultWithCodec<T>(
  resultCodec: ActorDisplayCodec,
  result: unknown
): T {
  // Null/undefined results - no transformation needed
  if (result === null || result === undefined) {
    return result as T
  }

  try {
    return resultCodec.asDisplay(result) as T
  } catch {
    // Fallback: return as-is if transformation fails
    return result as T
  }
}

export function didTypeFromArray(types: IDL.Type[]): IDL.Type {
  if (types.length === 0) {
    return IDL.Null
  }
  if (types.length === 1) {
    return types[0]
  }
  return IDL.Tuple(...types)
}
