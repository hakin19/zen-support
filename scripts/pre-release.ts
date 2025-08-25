#!/usr/bin/env tsx

/**
 * Pre-release Validation Script
 *
 * Comprehensive validation suite to ensure code is ready for release.
 * Checks tests, coverage, build, documentation, and generates release notes.
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

import chalk from 'chalk';
import ora from 'ora';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

interface ValidationStep {
  name: string;
  command: string;
  critical: boolean;
}

class PreReleaseValidator {
  private readonly steps: ValidationStep[] = [
    {
      name: 'Environment Health',
      command: 'tsx scripts/env-check.ts',
      critical: true,
    },
    {
      name: 'Dependency Security',
      command: 'npm audit --audit-level=high',
      critical: true,
    },
    {
      name: 'Code Linting',
      command: 'npm run lint',
      critical: true,
    },
    {
      name: 'Type Checking',
      command: 'npm run type-check',
      critical: true,
    },
    {
      name: 'Test Suite',
      command: 'npm run test:coverage',
      critical: true,
    },
    {
      name: 'Coverage Thresholds',
      command: 'npm run quality:check',
      critical: false,
    },
    {
      name: 'Build All Packages',
      command: 'npm run build',
      critical: true,
    },
    {
      name: 'Documentation Check',
      command: 'ls docs/*.md',
      critical: false,
    },
  ];

  private results: Array<{ step: string; success: boolean; error?: string }> =
    [];

  async validate(): Promise<boolean> {
    console.log(chalk.cyan.bold('\n🚀 Pre-release Validation\n'));
    console.log(chalk.gray('Running comprehensive checks before release...\n'));

    let allPassed = true;
    let criticalFailed = false;

    for (const step of this.steps) {
      const spinner = ora(`${step.name}...`).start();

      try {
        execSync(step.command, {
          cwd: ROOT_DIR,
          stdio: 'pipe',
          encoding: 'utf8',
        });

        spinner.succeed(chalk.green(step.name));
        this.results.push({ step: step.name, success: true });
      } catch (error) {
        spinner.fail(chalk.red(step.name));

        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.results.push({
          step: step.name,
          success: false,
          error: errorMessage,
        });

        allPassed = false;
        if (step.critical) {
          criticalFailed = true;
        }
      }
    }

    // Generate report
    this.generateReport();

    // Generate release notes if all critical checks passed
    if (!criticalFailed) {
      await this.generateReleaseNotes();
    }

    return !criticalFailed;
  }

  private generateReport(): void {
    console.log(chalk.cyan.bold('\n📊 Validation Report\n'));

    const passed = this.results.filter(r => r.success);
    const failed = this.results.filter(r => !r.success);

    if (passed.length > 0) {
      console.log(
        chalk.green.bold(`✅ Passed (${passed.length}/${this.results.length}):`)
      );
      passed.forEach(r => {
        console.log(chalk.green(`   • ${r.step}`));
      });
    }

    if (failed.length > 0) {
      console.log(
        chalk.red.bold(`\n❌ Failed (${failed.length}/${this.results.length}):`)
      );
      failed.forEach(r => {
        console.log(chalk.red(`   • ${r.step}`));
      });
    }

    console.log();

    // Overall status
    if (failed.length === 0) {
      console.log(chalk.green.bold('🎉 All checks passed! Ready for release.'));
    } else {
      const criticalFailed = failed.some(
        r => this.steps.find(s => s.name === r.step)?.critical
      );

      if (criticalFailed) {
        console.log(
          chalk.red.bold(
            '🚨 Critical checks failed! Fix issues before release.'
          )
        );
      } else {
        console.log(
          chalk.yellow.bold(
            '⚠️  Non-critical checks failed. Review before release.'
          )
        );
      }
    }
  }

  private async generateReleaseNotes(): Promise<void> {
    console.log(chalk.cyan.bold('\n📝 Generating Release Notes...\n'));

    try {
      // Get recent commits
      const commits = execSync('git log --oneline -n 10', {
        cwd: ROOT_DIR,
        encoding: 'utf8',
      })
        .trim()
        .split('\n');

      console.log(chalk.gray('Recent commits:'));
      commits.forEach(commit => {
        console.log(chalk.gray(`  ${commit}`));
      });

      console.log(chalk.green('\n✅ Release notes draft ready for review.'));
    } catch (error) {
      console.log(
        chalk.yellow('⚠️  Could not generate release notes automatically.')
      );
    }
  }
}

// CLI interface
async function main() {
  const validator = new PreReleaseValidator();
  const success = await validator.validate();

  if (success) {
    console.log(chalk.green.bold('\n✅ Pre-release validation successful!\n'));
  } else {
    console.log(chalk.red.bold('\n❌ Pre-release validation failed.\n'));
  }

  process.exit(success ? 0 : 1);
}

if (import.meta.url === `file://${__filename}`) {
  main().catch(console.error);
}

export { PreReleaseValidator };
