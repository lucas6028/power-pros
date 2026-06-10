import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // zh-TW UI strings use full-width spaces deliberately
      "no-irregular-whitespace": ["error", { skipStrings: true, skipTemplates: true }],
    },
  },
  { ignores: ["dist/", "node_modules/"] },
);
