/* eslint-disable @typescript-eslint/no-var-requires */

/** @type {import("dts-generator").DtsGeneratorOptions} */
const options = {
  project: "./",
  exclude: [
    "*.d.ts",
    "dist/**/*.wasm.d.ts",
    "tests/**/*.ts",
    "tests/**/*.d.ts",
    "node_modules/**/*.d.ts",
  ],
  files: ["dist/index.d.ts"],
  out: "../core/src/classes/candid/parser.d.ts",
  resolveModuleId: ({ currentModuleId }) => {
    // Check if the module ID matches the main module path
    if (currentModuleId === "dist/index") {
      // Return the custom name for the main namespace
      return "@ic-reactor/parser"
    }
    // Return the original module ID for other modules
    return currentModuleId
  },
}

require("dts-generator").default(options)
