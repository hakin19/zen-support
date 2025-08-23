export default {
  // Core formatting
  semi: true,
  singleQuote: true,
  quoteProps: 'as-needed',
  trailingComma: 'es5',
  bracketSpacing: true,
  bracketSameLine: false,
  arrowParens: 'avoid',

  // Line and indentation
  printWidth: 80,
  tabWidth: 2,
  useTabs: false,

  // End of line
  endOfLine: 'lf',

  // JSX specific
  jsxSingleQuote: true,

  // File specific overrides
  overrides: [
    {
      files: '*.json',
      options: {
        printWidth: 120,
      },
    },
    {
      files: '*.md',
      options: {
        printWidth: 100,
        proseWrap: 'preserve',
      },
    },
    {
      files: ['*.yml', '*.yaml'],
      options: {
        printWidth: 120,
        singleQuote: false,
      },
    },
  ],
};
