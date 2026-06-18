/**
 * @ic-reactor/start — Scaffold API
 *
 * Programmatic API for generating a new V0 app. Used by the `create` bin and
 * the `ic-reactor create start` CLI alias. V0 generates one fixed layout
 * (TypeScript + React + TanStack Router + IC Reactor + Motoko backend).
 */

export { createApp, isValidAppName } from "./createApp.js"
export type { CreateAppOptions, CreateAppResult } from "./createApp.js"

export { buildScaffoldFiles } from "./templates.js"
export type { ScaffoldFile, TemplateContext } from "./templates.js"

// Re-export the individual template functions for users who want to build a
// custom layout on top of the defaults.
export * from "./templates.js"
