/**
 * The `react-server` entry of `@ic-reactor/react`.
 *
 * React Server Components are bundled with the `react-server` export
 * condition, and `package.json` routes that condition here instead of to
 * `index.ts`. The main entry also loads every hook, and a bundler rejects a
 * hook import anywhere in the server graph, so a server component that
 * imported only `Reactor` from it failed to build.
 *
 * This entry carries the core runtime (`Reactor`, `DisplayReactor`,
 * `ClientManager`, the error classes and utilities) and the framework-free
 * validation helpers, and nothing that imports React. A hook or a hook factory
 * imported in a server component is therefore a missing export at build time,
 * which is the error to get: those only run in a `"use client"` module.
 *
 * TypeScript does not read the `react-server` condition, so types still come
 * from the main entry.
 */
export * from "@ic-reactor/core"

// Plain functions over `ValidationError`, useful in a server action that maps
// a rejected call onto form field errors.
export * from "./validation.js"
