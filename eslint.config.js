const js = require('@eslint/js');
const typescript = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');

module.exports = [
  js.configs.recommended,
  {
    files: ['packages/core/src/**/*.ts', 'packages/react/src/**/*.tsx', 'packages/react/src/**/*.ts', 'packages/visitor/src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        project: ['./tsconfig.json', './packages/*/tsconfig.json'],
        tsconfigRootDir: __dirname,
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        require: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        NodeJS: 'readonly',
        React: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
    },
    rules: {
      // Basic rules
      'semi': 'off',
      'no-console': 'warn',
      
      // TypeScript rules that catch CI issues
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { 
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_'
        }
      ],
      
      // KEY RULE: This catches the exact same "not all code paths return a value" issues that CI finds
      '@typescript-eslint/consistent-return': 'error',
      
      // Additional helpful rules for catching async issues
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      
      // Disable noisy rules for now
      'no-undef': 'off', // TypeScript handles this better
      '@typescript-eslint/prefer-optional-chain': 'off',
    },
  },
  {
    ignores: [
      'dist/**',
      'umd/**', 
      'node_modules/**',
      'target/**',
      'examples/**',
      'docs/**',
      '*.js',
      '*.d.ts',
      'packages/*/dist/**',
      'packages/*/umd/**',
      'packages/parser/**', // Rust code
    ]
  }
];
