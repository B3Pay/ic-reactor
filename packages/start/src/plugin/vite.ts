import type { PluginOption } from "vite"
import tanstackRouter from "@tanstack/router-plugin/vite"
import { icReactor } from "@ic-reactor/vite-plugin"
import {
  normalizeIcReactorStartConfig,
  type IcReactorStartConfig,
} from "../config.js"

export interface IcReactorStartViteOptions extends IcReactorStartConfig {
  router?: Parameters<typeof tanstackRouter>[0]
}

export function icReactorStart(
  options: IcReactorStartViteOptions = {}
): PluginOption[] {
  const { router, ...startConfig } = options
  const normalizedConfig = normalizeIcReactorStartConfig(startConfig)

  return [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      ...router,
    }),
    icReactor(normalizedConfig),
  ]
}

export { defineIcReactorStartConfig } from "../config.js"
export type {
  IcReactorStartCanisterConfig,
  IcReactorStartCanisterEntry,
  IcReactorStartCanisters,
  IcReactorStartConfig,
  NormalizedIcReactorStartConfig,
} from "../config.js"
