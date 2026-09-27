// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "node_modules/*", ".expo/*", "docs/screenshots/*", "scripts/*.mjs"]
  },
  {
    rules: {
      "import/no-unresolved": "off",
      "@typescript-eslint/array-type": "off",
      "import/no-named-as-default": "off"
    }
  }
]);
