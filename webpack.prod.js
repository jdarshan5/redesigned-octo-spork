const { merge } = require("webpack-merge");
const common = require("./webpack.common.js");
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");

process.env["NODE_ENV"] = "production";

module.exports = merge([
  common,
  {
    mode: "production",
    optimization: {
      minimize: true,
      minimizer: [
        // `...` keeps webpack's default JS minifier (terser) alongside the CSS one.
        `...`,
        new CssMinimizerPlugin(),
      ],
    },
  },
]);
