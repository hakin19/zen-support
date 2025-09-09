// @ts-check
import baseConfig from '../../eslint.config.js';

export default [
  ...baseConfig,

  // Next.js specific overrides
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      // Allow default exports for Next.js pages and components
      'import/no-default-export': 'off',

      // Next.js pages can have unused parameters (like context in getServerSideProps)
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],

      // Relax some rules for Next.js specific patterns
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },

  // Next.js pages directory
  {
    files: [
      'pages/**/*.ts',
      'pages/**/*.tsx',
      'src/pages/**/*.ts',
      'src/pages/**/*.tsx',
    ],
    rules: {
      // Pages must use default exports
      'import/no-default-export': 'off',
      'import/prefer-default-export': 'error',

      // Next.js pages often have specific parameter requirements
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },

  // Next.js API routes
  {
    files: ['pages/api/**/*.ts', 'src/pages/api/**/*.ts'],
    languageOptions: {
      globals: {
        // Node.js globals for API routes
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
    },
    rules: {
      // API routes need default exports
      'import/no-default-export': 'off',
      'import/prefer-default-export': 'error',

      // Allow console in API routes
      'no-console': 'off',
    },
  },

  // Next.js configuration files
  {
    files: ['next.config.js', 'next.config.mjs', 'next.config.ts'],
    rules: {
      'import/no-default-export': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'no-console': 'off',
    },
  },
];
