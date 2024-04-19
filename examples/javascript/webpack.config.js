const path = require("path")
const CopyWebpackPlugin = require("copy-webpack-plugin")

/** @type {import("webpack").Configuration} */
module.exports = {
  entry: "./src/main.js",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "main.js",
  },
  mode: "development",
  plugins: [
    new CopyWebpackPlugin({
      patterns: [{ from: "./src/index.html" }],
    }),
  ],
  resolve: { fallback: { path: false } },
  experiments: {
    asyncWebAssembly: true,
  },
  devServer: {
    static: {
      directory: path.join(__dirname, "dist"),
    },
    compress: true,
    port: 3000,
  },
  module: {
    rules: [
      // You can add loaders here for other file types (CSS, SASS, images, etc.)
    ],
  },
}
