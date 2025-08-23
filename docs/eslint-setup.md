# ESLint Configuration Guide

This document explains the ESLint configuration setup for the Aizen vNE monorepo project.

## Overview

The project uses ESLint 9.x with the modern flat configuration format (`eslint.config.js`) for consistent code quality and formatting across all packages.

## Configuration Files

### Root Configuration

- **`/eslint.config.js`** - Main ESLint configuration using flat config format
- **`.prettierrc.js`** - Prettier configuration for code formatting
- **`.prettierignore`** - Files to ignore during formatting

### Package-Specific Configuration

- **`packages/web/eslint.config.js`** - Next.js-specific ESLint overrides

## Key Features

### TypeScript Integration

- Full TypeScript support with `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin`
- Strict type checking rules enabled
- Path mapping support for monorepo structure (`@aizen/*` imports)

### Import Management

- Automatic import sorting and organization
- Consistent import grouping (builtin, external, internal, relative)
- Monorepo-aware import resolution

### Code Quality Rules

- Strict TypeScript rules for type safety
- Consistent code style enforcement
- Async/await pattern validation
- Error handling best practices

### Environment-Specific Configurations

#### Node.js Backend (api, device-agent, shared)

- Node.js globals and built-ins available
- Console usage allowed
- Process exit handling

#### React/Next.js Frontend (web)

- Browser globals and DOM APIs
- React/JSX support
- Next.js-specific patterns (pages, API routes)
- Default export handling for components

#### Test Files

- Jest/Vitest globals
- Relaxed rules for test-specific patterns
- Allow `any` types and non-null assertions in tests

## Available Scripts

### Root Level

```bash
npm run lint          # Lint all packages
npm run lint:fix      # Auto-fix all packages
npm run type-check    # TypeScript type checking
npm run format        # Format with Prettier
npm run format:check  # Check formatting
```

### Package Level

```bash
npm run lint          # Lint package
npm run lint:fix      # Auto-fix package
npm run type-check    # TypeScript check
```

## Dependencies

### Core ESLint Packages

- `eslint@^9.34.0` - Main ESLint engine
- `@typescript-eslint/parser@^8.40.0` - TypeScript parser
- `@typescript-eslint/eslint-plugin@^8.40.0` - TypeScript rules

### Formatting and Style

- `prettier@^3.6.2` - Code formatter
- `eslint-plugin-prettier@^5.5.4` - Prettier integration
- `eslint-config-prettier@^10.1.8` - Prettier conflict resolution

### Import Management

- `eslint-plugin-import@^2.32.0` - Import/export linting

## Configuration Highlights

### TypeScript Rules

```javascript
'@typescript-eslint/no-unused-vars': ['error', {
  argsIgnorePattern: '^_',
  varsIgnorePattern: '^_',
  destructuredArrayIgnorePattern: '^_'
}],
'@typescript-eslint/consistent-type-imports': ['error', {
  prefer: 'type-imports',
  fixStyle: 'separate-type-imports'
}],
'@typescript-eslint/no-floating-promises': 'error',
'@typescript-eslint/require-await': 'error',
```

### Import Rules

```javascript
'import/order': ['error', {
  groups: [
    'builtin',
    'external',
    'internal',
    'parent',
    'sibling',
    'index',
    'type'
  ],
  'newlines-between': 'always',
  alphabetize: { order: 'asc', caseInsensitive: true }
}],
```

### Code Style

```javascript
'prefer-const': 'error',
'no-var': 'error',
'object-shorthand': 'error',
'prefer-arrow-callback': 'error',
'prefer-template': 'error',
```

## File Ignoring

The configuration automatically ignores:

- `node_modules/`
- Build outputs (`dist/`, `.next/`, `build/`)
- Generated files (`*.d.ts`)
- Cache directories (`.nx/`, `.cache/`)
- Environment files (`.env*`)
- Configuration files that don't need linting

## Migration Notes

This setup uses ESLint 9.x flat config format, which:

- Replaces `.eslintrc.json` with `eslint.config.js`
- Uses `ignores` property instead of `.eslintignore`
- Requires `"type": "module"` in package.json
- Uses different CLI options

## Troubleshooting

### Common Issues

1. **Module type warnings**: Ensure `"type": "module"` is set in package.json
2. **Import resolution**: Check TypeScript path mapping in `tsconfig.base.json`
3. **Prettier conflicts**: Rules are automatically resolved by `eslint-config-prettier`
4. **Performance**: Large codebases benefit from `incremental: true` in tsconfig

### Debug Commands

```bash
# Test single file
npx eslint path/to/file.ts

# Check config
npx eslint --print-config path/to/file.ts

# Debug parser
npx eslint --parser-options='{"project":true}' path/to/file.ts
```

## Best Practices

1. **Run linting before commits**: Use pre-commit hooks
2. **Fix auto-fixable issues**: Use `--fix` flag regularly
3. **Type-check separately**: Run `tsc --noEmit` alongside ESLint
4. **Review rules periodically**: Update rules as project evolves
5. **Monitor performance**: Use `TIMING=1` environment variable

## Integration with IDEs

Most modern IDEs (VS Code, WebStorm) automatically detect and use the ESLint configuration. For optimal experience:

1. Install ESLint extension
2. Enable "format on save"
3. Configure auto-fix on save
4. Set up type checking in IDE

This configuration provides a robust foundation for maintaining code quality across the entire Aizen vNE monorepo project.
