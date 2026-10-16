const path = require("path");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = {
  entry: {
    app: "./src/index.tsx",
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  output: {
    // filename: "app.js",
    path: path.resolve(__dirname, "public"),
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: [
          MiniCssExtractPlugin.loader,
          "css-loader",
          {
            loader: "postcss-loader",
            options: {
              postcssOptions: {
                plugins: [
                  [
                    "postcss-preset-env",
                    {
                      features: {
                        // Its polyfill rewrites `:focus:not(:focus-visible)` to also match
                        // `:focus:not(.focus-visible)`, which hides every focus ring without
                        // the polyfill's script. Browsers support :focus-visible natively.
                        "focus-visible-pseudo-class": false,
                      },
                    },
                  ],
                ],
              },
            },
          },
        ],
      },
      {
        test: /\.[jt]sx?$/,
        exclude: /(node_modules|bower_components)/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env", "@babel/preset-react", "@babel/preset-typescript"],
          },
        },
      },
    ],
  },
  plugins: [new MiniCssExtractPlugin()],
};
