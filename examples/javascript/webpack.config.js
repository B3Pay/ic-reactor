const path = require("path")
const HtmlWebpackPlugin = require("html-webpack-plugin")

/** @type {import("webpack").Configuration} */
module.exports = {
  entry: "./src/main.js",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "bundle.js",
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "src/index.html", // Update this to point to your HTML file
    }),
  ],
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
    modules: [path.resolve(__dirname, "node_modules"), "node_modules"],
  },
  devServer: {
    static: {
      directory: path.join(__dirname, "dist"),
    },
    compress: true,
    port: 3000,
  },
  experiments: {
    asyncWebAssembly: true,
  },
  module: {
    rules: [
      // You can add loaders here for other file types (CSS, SASS, images, etc.)
    ],
  },
}
