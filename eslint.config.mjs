import js from "@eslint/js"
import tseslint from "typescript-eslint"

/**
 * Lint scope: TypeScript under `packages/<pkg>/src` and `packages/<pkg>/tests` --
 * the same scope `pnpm typecheck` already covers. `docs/`, `e2e/`, `examples/`
 * and `scripts/` stay out of scope for now.
 */
const SOURCES = [
  "packages/*/src/**/*.{ts,tsx}",
  "packages/*/tests/**/*.{ts,tsx}",
]

/**
 * Type-aware rules need a tsconfig that actually contains the file, and
 * `tsconfig.typecheck.json` is the only project in each package that includes
 * both `src` and `tests`.
 *
 * The list is spelled out rather than globbed so that a package added without a
 * `tsconfig.typecheck.json` fails loudly here instead of silently opting itself
 * out of the type-aware rules -- which is the same silent-skip failure mode that
 * left `packages/parser` unchecked by `pnpm typecheck` (issue #340).
 */
const TYPECHECK_PROJECTS = [
  "packages/candid/tsconfig.typecheck.json",
  "packages/cli/tsconfig.typecheck.json",
  "packages/codegen/tsconfig.typecheck.json",
  "packages/core/tsconfig.typecheck.json",
  "packages/parser/tsconfig.typecheck.json",
  "packages/react/tsconfig.typecheck.json",
  "packages/vite-plugin/tsconfig.typecheck.json",
]

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/target/**",
      "**/coverage/**",
      // didc/dfx output checked in as parser test fixtures
      "packages/parser/tests/candid/**",
    ],
  },
  {
    files: SOURCES,
    extends: [js.configs.recommended, tseslint.configs.recommended],
    // A directive that no longer suppresses anything is an error, so the stale
    // `eslint-disable` comments this repo accumulated while no linter ran cannot
    // come back (issue #341).
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      // 425 hits, measured. Candid service types are structurally `any` at the
      // actor boundary; turning this on is its own project, not a lint rollout.
      "@typescript-eslint/no-explicit-any": "off",
      // The rule's only fix is `new Error(msg, { cause })`, which needs lib
      // ES2022; the packages compile against lib ES2020 (tsconfig.base.json), so
      // the fix does not type-check here (TS2554).
      "preserve-caught-error": "off",
      // `{}` is the neutral branch of the Candid visitors' conditional types,
      // never a value type.
      "@typescript-eslint/no-empty-object-type": [
        "error",
        { allowObjectTypes: "always" },
      ],
      // The codebase already marks intentionally-unused bindings with `_`.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: SOURCES,
    languageOptions: {
      parserOptions: {
        project: TYPECHECK_PROJECTS,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },
  {
    // Tests reach for `require()` to re-import SDK modules inside assertions.
    files: [
      "packages/*/tests/**/*.{ts,tsx}",
      "packages/*/src/**/*.test.{ts,tsx}",
    ],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // Type-level tests call promise-returning hooks purely to assert their
    // signatures; nothing awaits them by design.
    files: ["**/*.test-d.ts"],
    rules: { "@typescript-eslint/no-floating-promises": "off" },
  }
)
