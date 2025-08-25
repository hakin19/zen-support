#!/usr/bin/env tsx

/**
 * Intelligent Test Runner
 *
 * Provides smart test execution strategies based on:
 * - File changes (git diff)
 * - Package dependencies
 * - Test type (unit/integration/e2e)
 * - Developer preferences
 */

import { spawn, execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

interface TestRunOptions {
  mode: 'all' | 'affected' | 'package' | 'file' | 'watch';
  coverage?: boolean;
  verbose?: boolean;
  ui?: boolean;
  packageName?: string;
  filePath?: string;
  parallel?: boolean;
  bail?: boolean;
}

class TestRunner {
  private readonly packagesDir = path.join(ROOT_DIR, 'packages');

  async run(options: TestRunOptions): Promise<boolean> {
    console.log(`🧪 Running tests in ${options.mode} mode...`);

    try {
      // Ensure test environment is ready
      await this.ensureTestEnvironment();

      // Execute tests based on mode
      const success = await this.executeTests(options);

      if (success) {
        console.log('✅ All tests passed!');

        // Run quality gates if coverage was enabled
        if (options.coverage) {
          console.log('\n🚨 Running quality gates...');
          const qualityPassed = await this.runQualityGates();
          if (!qualityPassed) {
            console.log('❌ Quality gates failed!');
            return false;
          }
        }
      } else {
        console.log('❌ Some tests failed!');
      }

      return success;
    } catch (error) {
      console.error('❌ Test runner failed:', error);
      return false;
    }
  }

  private async ensureTestEnvironment(): Promise<void> {
    // Check if Supabase is running
    try {
      execSync('curl -f http://localhost:54321/health', { stdio: 'ignore' });
    } catch {
      console.log('🔄 Starting Supabase...');
      execSync('npm run test:supabase:start', { stdio: 'inherit' });

      // Wait for Supabase to be ready
      console.log('⏳ Waiting for Supabase to be ready...');
      await this.waitForSupabase();
    }
  }

  private async waitForSupabase(maxAttempts = 30): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        execSync('curl -f http://localhost:54321/health', { stdio: 'ignore' });
        console.log('✅ Supabase is ready!');
        return;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    throw new Error('Supabase failed to start within 30 seconds');
  }

  private async executeTests(options: TestRunOptions): Promise<boolean> {
    const vitestArgs = this.buildVitestArgs(options);

    return new Promise(resolve => {
      const process = spawn('npx', ['vitest', ...vitestArgs], {
        stdio: 'inherit',
        cwd: ROOT_DIR,
      });

      process.on('close', code => {
        resolve(code === 0);
      });

      process.on('error', error => {
        console.error('Failed to start vitest:', error);
        resolve(false);
      });
    });
  }

  private buildVitestArgs(options: TestRunOptions): string[] {
    const args: string[] = [];

    switch (options.mode) {
      case 'all':
        args.push('run');
        break;
      case 'affected':
        args.push('run');
        const affectedFiles = this.getAffectedFiles();
        if (affectedFiles.length > 0) {
          args.push(...affectedFiles);
        }
        break;
      case 'package':
        args.push('run');
        if (options.packageName) {
          args.push(`packages/${options.packageName}/**/*.test.ts`);
        }
        break;
      case 'file':
        args.push('run');
        if (options.filePath) {
          args.push(options.filePath);
        }
        break;
      case 'watch':
        args.push('watch');
        break;
    }

    if (options.coverage) {
      args.push('--coverage');
    }

    if (options.verbose) {
      args.push('--reporter=verbose');
    }

    if (options.ui) {
      args.push('--ui');
    }

    if (options.parallel) {
      args.push('--pool=threads');
    }

    if (options.bail) {
      args.push('--bail=1');
    }

    return args;
  }

  private getAffectedFiles(): string[] {
    try {
      // Get changed files from git
      const changedFiles = execSync('git diff --name-only HEAD~1', {
        encoding: 'utf8',
      })
        .split('\n')
        .filter(file => file.trim())
        .filter(file => file.endsWith('.ts') || file.endsWith('.tsx'));

      // Find corresponding test files
      const testFiles: string[] = [];

      for (const file of changedFiles) {
        // Direct test file
        if (file.includes('.test.') || file.includes('.spec.')) {
          testFiles.push(file);
          continue;
        }

        // Find corresponding test file
        const testFile = this.findTestFile(file);
        if (testFile) {
          testFiles.push(testFile);
        }
      }

      return [...new Set(testFiles)]; // Remove duplicates
    } catch {
      return [];
    }
  }

  private findTestFile(sourceFile: string): string | null {
    const possibleTests = [
      sourceFile.replace(/\.ts$/, '.test.ts'),
      sourceFile.replace(/\.tsx$/, '.test.tsx'),
      sourceFile.replace(/\.ts$/, '.spec.ts'),
      sourceFile.replace(/\.tsx$/, '.spec.tsx'),
      sourceFile.replace(/src\//, 'test/').replace(/\.ts$/, '.test.ts'),
    ];

    for (const testFile of possibleTests) {
      try {
        const fullPath = path.join(ROOT_DIR, testFile);
        if (fs.statSync && fs.existsSync(fullPath)) {
          return testFile;
        }
      } catch {
        // File doesn't exist
      }
    }

    return null;
  }

  private async runQualityGates(): Promise<boolean> {
    return new Promise(resolve => {
      const process = spawn('tsx', ['scripts/quality-gates.ts'], {
        stdio: 'inherit',
        cwd: ROOT_DIR,
      });

      process.on('close', code => {
        resolve(code === 0);
      });

      process.on('error', () => {
        resolve(false);
      });
    });
  }

  async getPackages(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.packagesDir, {
        withFileTypes: true,
      });
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);
    } catch {
      return [];
    }
  }

  async getTestFiles(packageName?: string): Promise<string[]> {
    const searchDir = packageName
      ? path.join(this.packagesDir, packageName)
      : ROOT_DIR;

    const testFiles: string[] = [];

    const findTests = async (dir: string): Promise<void> => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory() && !entry.name.includes('node_modules')) {
            await findTests(fullPath);
          } else if (
            entry.isFile() &&
            (entry.name.includes('.test.') || entry.name.includes('.spec.'))
          ) {
            testFiles.push(path.relative(ROOT_DIR, fullPath));
          }
        }
      } catch {
        // Directory might not be readable
      }
    };

    await findTests(searchDir);
    return testFiles;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options: TestRunOptions = {
    mode: 'all',
    coverage: false,
    verbose: false,
    ui: false,
    parallel: true,
    bail: false,
  };

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--mode':
        options.mode = args[++i] as TestRunOptions['mode'];
        break;
      case '--coverage':
        options.coverage = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--ui':
        options.ui = true;
        break;
      case '--package':
        options.packageName = args[++i];
        break;
      case '--file':
        options.filePath = args[++i];
        break;
      case '--no-parallel':
        options.parallel = false;
        break;
      case '--bail':
        options.bail = true;
        break;
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  const runner = new TestRunner();

  // Special handling for interactive modes
  if (options.mode === 'watch' || options.ui) {
    const success = await runner.run(options);
    process.exit(success ? 0 : 1);
    return;
  }

  // Show available options for interactive selection
  if (options.mode === 'package' && !options.packageName) {
    const packages = await runner.getPackages();
    console.log('Available packages:');
    packages.forEach((pkg, index) => {
      console.log(`  ${index + 1}. ${pkg}`);
    });
    console.log(
      '\nUsage: npm run test:runner -- --mode package --package <package-name>'
    );
    process.exit(0);
  }

  const success = await runner.run(options);
  process.exit(success ? 0 : 1);
}

function printHelp() {
  console.log(`
Test Runner - Intelligent test execution

Usage: npm run test:runner -- [options]

Options:
  --mode <mode>       Test mode: all, affected, package, file, watch
  --coverage          Run with coverage reporting
  --verbose           Verbose output
  --ui               Start Vitest UI
  --package <name>    Run tests for specific package
  --file <path>       Run specific test file
  --no-parallel      Disable parallel execution
  --bail              Stop on first failure
  --help              Show this help

Examples:
  npm run test:runner                                    # Run all tests
  npm run test:runner -- --mode affected --coverage     # Run affected tests with coverage
  npm run test:runner -- --mode package --package api   # Run API package tests
  npm run test:runner -- --mode watch                   # Watch mode
  npm run test:runner -- --ui                           # Start UI
`);
}

if (import.meta.url === `file://${__filename}`) {
  main().catch(console.error);
}

export { TestRunner };
