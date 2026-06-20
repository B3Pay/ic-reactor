import type { IcReactorPluginOptions } from "@ic-reactor/vite-plugin"

export type IcReactorStartCanisterConfig = {
  didFile: string
  outDir?: string
  clientManagerPath?: string
  mode?:
    | "Reactor"
    | "DisplayReactor"
    | "CandidReactor"
    | "CandidDisplayReactor"
    | "MetadataDisplayReactor"
  target?: "react" | "core"
}

export type IcReactorStartCanisterEntry = IcReactorStartCanisterConfig & {
  name: string
}

export type IcReactorStartCanisters =
  | Record<string, IcReactorStartCanisterConfig>
  | IcReactorStartCanisterEntry[]

export interface IcReactorStartConfig {
  canisters?: IcReactorStartCanisters
  outDir?: string
  clientManagerPath?: string
  target?: "react" | "core"
  injectEnvironment?: boolean
}

export type NormalizedIcReactorStartConfig = Omit<
  IcReactorPluginOptions,
  "canisters"
> & {
  canisters: IcReactorStartCanisterEntry[]
}

export function defineIcReactorStartConfig(
  config: IcReactorStartConfig
): IcReactorStartConfig {
  return config
}

export function normalizeIcReactorStartConfig(
  config: IcReactorStartConfig
): NormalizedIcReactorStartConfig {
  const canisters = normalizeCanisters(config.canisters ?? {})

  return {
    canisters,
    outDir: config.outDir ?? "src/canisters",
    clientManagerPath: config.clientManagerPath ?? "../../lib/client",
    target: config.target ?? "react",
    injectEnvironment: config.injectEnvironment ?? true,
  }
}

function normalizeCanisters(
  canisters: IcReactorStartCanisters
): IcReactorStartCanisterEntry[] {
  if (Array.isArray(canisters)) {
    return canisters.map((canister) => ({ ...canister }))
  }

  return Object.entries(canisters).map(([name, canister]) => ({
    name,
    ...canister,
  }))
}
