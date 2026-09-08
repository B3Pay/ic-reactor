/**
 * Barrel entry point for the generated API reference.
 *
 * TypeDoc gives every entry point its own module directory, so documenting the
 * two packages as two entry points would emit `libs/core/src/...` and
 * `libs/react/src/...` and break the five `autogenerate` sidebar groups in
 * astro.config.mjs, which read a flat `libs/classes`, `libs/functions`, etc.
 * One barrel over a program containing both packages keeps that layout flat.
 *
 * Paired with tsconfig.typedoc.json, whose `paths` maps `@ic-reactor/core` to
 * core's SOURCE. Without that mapping react's `export * from "@ic-reactor/core"`
 * resolves through the workspace symlink to `core/dist/*.d.ts`, and every shared
 * page loses its GitHub source link and points at build output instead.
 */
export * from "../packages/core/src/index.js"
export * from "../packages/react/src/index.js"
