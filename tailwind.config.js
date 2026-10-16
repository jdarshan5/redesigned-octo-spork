const defaultTheme = require("tailwindcss/defaultTheme");

module.exports = {
  darkMode: "class",
  purge: ["./src/**/*.{ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Nunito", ...defaultTheme.fontFamily.sans],
      },
      colors: {
        ink: { DEFAULT: "#4d5470", soft: "#8a91a8" },
        brand: { DEFAULT: "#855cd6", dark: "#6c47c9" },
        motion: { DEFAULT: "#4C97FF", dark: "#3373CC" },
        looks: { DEFAULT: "#9966FF", dark: "#774DCB" },
        events: { DEFAULT: "#FFBF00", dark: "#CC9900" },
        control: { DEFAULT: "#FFAB19", dark: "#CF8B17" },
      },
    },
  },
  variants: {},
  plugins: [],
};
