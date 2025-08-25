#!/usr/bin/env tsx

/**
 * Development Test Integration Script
 *
 * Combines linting, type-checking, and testing in a single workflow
 * for comprehensive development validation. Optimized for fast feedback
 * and incremental development.
 */

import { spawn, execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

interface DevTestOptions {
  fix?: boolean;
  affected?: boolean;
  coverage?: boolean;
  package?: string;
  bail?: boolean;
  parallel?: boolean;
  verbose?: boolean;
  skipLint?: boolean;
  skipTypes?: boolean;
  skipTests?: boolean;
}

class DevTester {
  constructor(private options: DevTestOptions) {}

  async run(): Promise<boolean> {
    console.log('🚀 Running development validation pipeline...');

    const steps = this.getSteps();
    const results: boolean[] = [];

    for (const step of steps) {
      console.log(`\n${step.icon} ${step.name}...`);

      const success = await step.execute();
      results.push(success);

      if (!success) {
        console.log(`❌ ${step.name} failed!`);
        if (this.options.bail) {
          console.log('🛑 Stopping due to failure (--bail mode)');
          return false;
        }
      } else {
        console.log(`✅ ${step.name} passed!`);
      }
    }

    // Final summary
    const allPassed = results.every(r => r);
    console.log('\n📊 Summary:');
    steps.forEach((step, index) => {
      const status = results[index] ? '✅' : '❌';
      console.log(`  ${status} ${step.name}`);
    });

    if (allPassed) {
      console.log('\n🎉 All validations passed! Ready to commit.');
    } else {
      console.log(
        '\n🚨 Some validations failed. Fix issues before committing.'
      );
    }

    return allPassed;
  }

  private getSteps() {
    const steps: Array<{
      name: string;
      icon: string;
      execute: () => Promise<boolean>;
    }> = [];

    if (!this.options.skipLint) {
      steps.push({
        name: 'Code Linting',
        icon: '📝',
        execute: () => this.runLinting(),
      });
    }

    if (!this.options.skipTypes) {
      steps.push({
        name: 'Type Checking',
        icon: '🔍',
        execute: () => this.runTypeCheck(),
      });
    }

    if (!this.options.skipTests) {
      steps.push({
        name: 'Test Suite',
        icon: '🧪',
        execute: () => this.runTests(),
      });
    }

    return steps;
  }

  private async runLinting(): Promise<boolean> {
    return this.executeCommand([
      'npm',
      'run',
      this.options.fix ? 'lint:fix' : 'lint',
      ...(this.options.affected ? ['-- --affected'] : []),
    ]);
  }

  private async runTypeCheck(): Promise<boolean> {
    if (this.options.package) {
      return this.executeCommand([
        'nx',
        'run',
        `@aizen/${this.options.package}:type-check`,
      ]);
    }

    return this.executeCommand([
      'npm',
      'run',
      'type-check',
      ...(this.options.affected ? ['-- --affected'] : []),
    ]);
  }

  private async runTests(): Promise<boolean> {
    const args = ['npm', 'run'];

    if (this.options.coverage) {
      args.push('test:coverage');
    } else if (this.options.package) {
      args.push('test', '--', `packages/${this.options.package}/**/*.test.ts`);
    } else if (this.options.affected) {
      args.push('test:affected');
    } else {
      args.push('test');
    }

    return this.executeCommand(args);
  }

  private async executeCommand(args: string[]): Promise<boolean> {
    return new Promise(resolve => {
      const [command, ...cmdArgs] = args;

      if (this.options.verbose) {
        console.log(`    Running: ${args.join(' ')}`);
      }

      const process = spawn(command, cmdArgs, {
        stdio: this.options.verbose ? 'inherit' : 'pipe',
        cwd: ROOT_DIR,
      });

      let output = '';

      if (!this.options.verbose) {
        process.stdout?.on('data', data => {
          output += data.toString();
        });

        process.stderr?.on('data', data => {
          output += data.toString();
        });
      }

      process.on('close', code => {
        if (code !== 0 && !this.options.verbose) {
          console.log('    Output:', output.slice(-500)); // Last 500 chars
        }
        resolve(code === 0);
      });

      process.on('error', error => {
        console.error(`    Error: ${error.message}`);
        resolve(false);
      });
    });
  }

  async getAffectedPackages(): Promise<string[]> {
    try {
      const output = execSync(
        'nx print-affected --type=app,lib --target=test',
        {
          encoding: 'utf8',
          cwd: ROOT_DIR,
        }
      );

      const affected = JSON.parse(output);
      return affected.projects || [];
    } catch {
      return [];
    }
  }

  async validateEnvironment(): Promise<boolean> {
    console.log('🔧 Validating development environment...');

    const checks = [
      {
        name: 'Node.js version',
        check: () => {
          const version = process.version;
          const major = parseInt(version.slice(1));
          return major >= 20;
        },
        error: 'Node.js 20+ required',
      },
      {
        name: 'Package dependencies',
        check: async () => {
          try {
            execSync('npm ls --depth=0', { stdio: 'ignore' });
            return true;
          } catch {
            return false;
          }
        },
        error: 'Run `npm install` to install dependencies',
      },
      {
        name: 'Supabase availability',
        check: async () => {
          try {
            execSync('curl -f http://localhost:54321/health', {
              stdio: 'ignore',
            });
            return true;
          } catch {
            return false;
          }
        },
        error: 'Start Supabase with `npm run test:supabase:start`',
      },
    ];

    for (const check of checks) {
      const result = await (typeof check.check === 'function'
        ? check.check()
        : check.check);
      if (!result) {
        console.log(`❌ ${check.name}: ${check.error}`);
        return false;
      }
      console.log(`✅ ${check.name}`);
    }

    return true;
  }

  printPerformanceStats() {
    // Could be enhanced to show timing for each step
    console.log('\n⚡ Performance optimizations available:');
    console.log('  • Use --affected to run only changed code');
    console.log('  • Use --package to focus on specific package');
    console.log('  • Use --parallel for concurrent execution');
    console.log('  • Skip steps with --skip-lint, --skip-types, --skip-tests');
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options: DevTestOptions = {
    fix: false,
    affected: false,
    coverage: false,
    bail: false,
    parallel: false,
    verbose: false,
    skipLint: false,
    skipTypes: false,
    skipTests: false,
  };

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--fix':
        options.fix = true;
        break;
      case '--affected':
        options.affected = true;
        break;
      case '--coverage':
        options.coverage = true;
        break;
      case '--package':
        options.package = args[++i];
        break;
      case '--bail':
        options.bail = true;
        break;
      case '--parallel':
        options.parallel = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--skip-lint':
        options.skipLint = true;
        break;
      case '--skip-types':
        options.skipTypes = true;
        break;
      case '--skip-tests':
        options.skipTests = true;
        break;
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  const devTester = new DevTester(options);

  // Validate environment first
  const envValid = await devTester.validateEnvironment();
  if (!envValid) {
    console.log('\n❌ Environment validation failed!');
    process.exit(1);
  }

  // Show performance tips
  if (options.verbose) {
    devTester.printPerformanceStats();
  }

  // Run the validation pipeline
  const success = await devTester.run();
  process.exit(success ? 0 : 1);
}

function printHelp() {
  console.log(`
Development Test Integration - Comprehensive validation pipeline

Usage: npm run dev:test -- [options]

Options:
  --fix                 Auto-fix linting issues
  --affected            Run only on affected packages (git diff based)
  --coverage            Run tests with coverage reporting
  --package <name>      Focus on specific package
  --bail                Stop on first failure
  --parallel            Run steps in parallel (where possible)
  --verbose             Show detailed output
  --skip-lint           Skip linting step
  --skip-types          Skip type checking step
  --skip-tests          Skip test execution step
  --help                Show this help

Examples:
  npm run dev:test                           # Full validation pipeline
  npm run dev:test -- --affected --fix      # Fix and test only changed code
  npm run dev:test -- --package api         # Test only API package
  npm run dev:test -- --coverage --bail     # Test with coverage, stop on failure
  npm run dev:test -- --skip-tests          # Only linting and type checking

Pipeline Steps:
  1. 📝 Code Linting - ESLint validation with optional auto-fix
  2. 🔍 Type Checking - TypeScript compilation and type validation
  3. 🧪 Test Suite - Unit and integration tests with optional coverage

This script is perfect for:
  • Pre-commit validation
  • Development workflow integration
  • CI/CD pipeline local simulation
  • Package-specific validation
`);
}

if (import.meta.url === `file://${__filename}`) {
  main().catch(console.error);
}

export { DevTester };
