/* eslint-disable @typescript-eslint/no-var-requires */
const WasmPackPlugin = require("@wasm-tool/wasm-pack-plugin")
const path = require("path")

/** @type {import("webpack").Configuration} */
module.exports = () => {
  // Determine if it's a production build
  return {
    entry: "./src/index.ts",
    output: {
      filename: "index.js",
      path: path.resolve(__dirname, "dist"),
    },
    experiments: {
      syncWebAssembly: true,
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: "babel-loader",
          exclude: /node_modules/,
        },
      ],
    },
    plugins: [
      new WasmPackPlugin({
        crateDirectory: __dirname,
      }),
    ],
  }
}
