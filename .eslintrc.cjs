module.exports = {
  root: true,
  env: {
    es6: true,
    jest: true,
    node: true,
  },
  globals: {
    __PATH_PREFIX__: true,
  },
  parser: '@babel/eslint-parser',
  parserOptions: {
    requireConfigFile: false,
    babelOptions: {
      babelrc: false,
      configFile: false,
      presets: ['@babel/preset-env'],
    },
  },
  extends: ['airbnb-base', 'prettier'],
  rules: {
    'no-console': 'off',
    quotes: ['error', 'single', { avoidEscape: true }],
    'import/no-unresolved': 'off',
    'import/prefer-default-export': 'off',
    'react/no-danger': 'off',
    'react/jsx-props-no-spreading': 'off',
    'react/require-default-props': 'off',
    'import/order': [
      'error',
      { alphabetize: { order: 'asc', caseInsensitive: true }, 'newlines-between': 'never' },
    ],
    'sort-imports': [
      'error',
      { ignoreCase: true, ignoreDeclarationSort: true, ignoreMemberSort: false },
    ],
  },
}
