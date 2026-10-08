module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: ['plugin:vue/vue3-essential'],
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  ignorePatterns: ['dist/', 'node_modules/'],
  rules: { 'vue/multi-word-component-names': 'off', 'no-undef': 'error' }
}
