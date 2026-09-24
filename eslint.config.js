import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";
import noPolishOrControl from "./eslint-rules/no-polish-or-control.js";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["src/ui/**/*.{js,jsx}"],
    extends: [js.configs.recommended, reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: "latest",
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    rules: {
      "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]", argsIgnorePattern: "^[A-Z_]" }],
    },
  },
  {
    files: ["src/electron/**/*.js", "vite.config.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
    },
    rules: {
      "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z_]" }],
    },
  },
  {
    // Code is English only: no Polish letters, no control characters (USPR 5). Covers
    // src/shared too, which no block above lints. The rule's own test is left out - its
    // test data IS Polish text.
    files: ["src/**/*.{js,jsx}", "eslint-rules/**/*.js"],
    ignores: ["eslint-rules/no-polish-or-control.test.js"],
    plugins: { local: { rules: { "no-polish-or-control": noPolishOrControl } } },
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: { "local/no-polish-or-control": "error" },
  },
]);
