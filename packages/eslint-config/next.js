/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: [
    "./base.js",
    "next/core-web-vitals",
  ],
  env: {
    browser: true,
    node: true,
  },
  rules: {
    "react/no-unescaped-entities": "off",
  },
};
