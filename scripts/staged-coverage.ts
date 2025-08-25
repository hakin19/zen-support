#!/usr/bin/env tsx

/**
 * Staged Files Coverage Checker
 *
 * Runs tests and checks coverage for staged files only.
 * Used in pre-commit hooks to ensure new/modified code meets coverage standards.
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

interface CoverageOptions {
  threshold?: number;
  verbose?: boolean;
  failOnError?: boolean;
}

class StagedCoverageChecker {
  private readonly defaultThreshold = 60;

  constructor(private options: CoverageOptions = {}) {
    this.options.threshold = this.options.threshold || this.defaultThreshold;
    this.options.verbose = this.options.verbose ?? false;
    this.options.failOnError = this.options.failOnError ?? true;
  }

  async check(): Promise<boolean> {
    console.log('🔍 Checking coverage for staged files...\n');

    try {
      // Get list of staged files
      const stagedFiles = await this.getStagedFiles();

      if (stagedFiles.length === 0) {
        console.log('✅ No staged files to check.');
        return true;
      }

      // Filter for testable files (TypeScript/JavaScript)
      const testableFiles = stagedFiles.filter(
        file =>
          (file.endsWith('.ts') ||
            file.endsWith('.tsx') ||
            file.endsWith('.js') ||
            file.endsWith('.jsx')) &&
          !file.includes('.test.') &&
          !file.includes('.spec.') &&
          !file.includes('.config.') &&
          !file.includes('.d.ts')
      );

      if (testableFiles.length === 0) {
        console.log('✅ No testable files in staged changes.');
        return true;
      }

      console.log(`📋 Found ${testableFiles.length} testable file(s):`);
      testableFiles.forEach(file => console.log(`   - ${file}`));
      console.log();

      // Find test files for staged files
      const testFiles = await this.findTestFiles(testableFiles);

      if (testFiles.length === 0) {
        console.log('⚠️  Warning: No test files found for staged files.');
        console.log('   Consider adding tests for:');
        testableFiles.forEach(file => console.log(`   - ${file}`));

        // Don't fail on missing tests, just warn
        return true;
      }

      // Run tests with coverage for affected files
      const success = await this.runCoverageCheck(testableFiles, testFiles);

      if (success) {
        console.log('\n✅ Coverage check passed for staged files!');
      } else {
        console.log('\n❌ Coverage check failed for staged files.');
        console.log(
          `   Ensure all modified code has at least ${this.options.threshold}% coverage.`
        );
      }

      return success;
    } catch (error) {
      console.error('❌ Error checking staged coverage:', error);
      return !this.options.failOnError;
    }
  }

  private async getStagedFiles(): Promise<string[]> {
    try {
      const output = execSync('git diff --cached --name-only', {
        encoding: 'utf8',
        cwd: ROOT_DIR,
      });

      return output
        .split('\n')
        .filter(file => file.length > 0)
        .map(file => file.trim());
    } catch {
      return [];
    }
  }

  private async findTestFiles(sourceFiles: string[]): Promise<string[]> {
    const testFiles: string[] = [];

    for (const sourceFile of sourceFiles) {
      // Generate possible test file names
      const dir = path.dirname(sourceFile);
      const basename = path.basename(sourceFile, path.extname(sourceFile));
      const ext = path.extname(sourceFile);

      const possibleTestFiles = [
        path.join(dir, `${basename}.test${ext}`),
        path.join(dir, `${basename}.spec${ext}`),
        path.join(dir, '__tests__', `${basename}.test${ext}`),
        path.join(dir, '__tests__', `${basename}.spec${ext}`),
        path.join(dir, '../test', `${basename}.test${ext}`),
        path.join(dir, '../test', `${basename}.spec${ext}`),
      ];

      // Check which test files exist
      for (const testFile of possibleTestFiles) {
        const fullPath = path.join(ROOT_DIR, testFile);
        try {
          await fs.access(fullPath);
          testFiles.push(testFile);
          break; // Found a test file, no need to check others
        } catch {
          // File doesn't exist, continue checking
        }
      }
    }

    return [...new Set(testFiles)]; // Remove duplicates
  }

  private async runCoverageCheck(
    sourceFiles: string[],
    testFiles: string[]
  ): Promise<boolean> {
    try {
      // Create a pattern for running specific tests
      const testPattern = testFiles.join(' ');

      console.log('🧪 Running tests with coverage...');

      // Run vitest with coverage for specific files
      const command = `npx vitest run --coverage --coverage.enabled=true ${testPattern}`;

      if (this.options.verbose) {
        console.log(`   Command: ${command}`);
      }

      execSync(command, {
        stdio: this.options.verbose ? 'inherit' : 'pipe',
        cwd: ROOT_DIR,
      });

      // Check if coverage meets threshold
      const coverageResult = await this.checkCoverageThreshold(sourceFiles);

      return coverageResult;
    } catch (error) {
      if (this.options.verbose) {
        console.error('Test execution error:', error);
      }
      return false;
    }
  }

  private async checkCoverageThreshold(
    sourceFiles: string[]
  ): Promise<boolean> {
    try {
      // Read coverage report
      const coverageFile = path.join(
        ROOT_DIR,
        'coverage',
        'coverage-summary.json'
      );

      const coverageData = JSON.parse(await fs.readFile(coverageFile, 'utf8'));

      let totalLines = 0;
      let coveredLines = 0;
      let filesChecked = 0;

      // Check coverage for each staged file
      for (const file of sourceFiles) {
        const filePath = path.resolve(ROOT_DIR, file);
        const coverageKey = Object.keys(coverageData).find(key =>
          key.includes(file.replace(/\\/g, '/'))
        );

        if (coverageKey && coverageKey !== 'total') {
          const fileCoverage = coverageData[coverageKey];
          totalLines += fileCoverage.lines.total;
          coveredLines += fileCoverage.lines.covered;
          filesChecked++;

          if (this.options.verbose) {
            console.log(
              `   ${file}: ${fileCoverage.lines.pct.toFixed(1)}% coverage`
            );
          }
        }
      }

      if (filesChecked === 0) {
        console.log('⚠️  No coverage data found for staged files.');
        return true; // Don't fail if no coverage data
      }

      const coveragePercent = (coveredLines / totalLines) * 100;
      console.log(`\n📊 Staged files coverage: ${coveragePercent.toFixed(1)}%`);

      return coveragePercent >= this.options.threshold!;
    } catch (error) {
      console.error('Error reading coverage data:', error);
      return !this.options.failOnError;
    }
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options: CoverageOptions = {
    threshold: 60,
    verbose: args.includes('--verbose') || args.includes('-v'),
    failOnError: !args.includes('--no-fail'),
  };

  // Parse threshold if provided
  const thresholdIndex = args.findIndex(arg => arg.startsWith('--threshold='));
  if (thresholdIndex >= 0) {
    const threshold = parseInt(args[thresholdIndex].split('=')[1], 10);
    if (!isNaN(threshold)) {
      options.threshold = threshold;
    }
  }

  const checker = new StagedCoverageChecker(options);
  const success = await checker.check();
  process.exit(success ? 0 : 1);
}

if (import.meta.url === `file://${__filename}`) {
  main().catch(console.error);
}

export { StagedCoverageChecker };
