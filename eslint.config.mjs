import tsParser from "@typescript-eslint/parser";
import unusedImports from "eslint-plugin-unused-imports";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      // Flag unused imports as errors so they get caught early
      "unused-imports/no-unused-imports": "error",
    },
  },
];

export default config;
