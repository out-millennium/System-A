import next from "eslint-config-next";
import tseslint from "typescript-eslint";

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  ...next,
  {
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      // Some components sync state from cookies/props inside effects;
      // keep as advisory rather than build-blocking errors.
      "react-hooks/set-state-in-effect": "warn",
      // The WebGL field uses intentional imperative ref mutation (Three.js
      // buffers, rAF loops). These React-Compiler advisories are not errors.
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  {
    ignores: [".next/**", "node_modules/**", "e2e/**"],
  },
];

export default eslintConfig;
