#!/usr/bin/env tsx

/**
 * Dependency Health Checker Script
 *
 * Checks for outdated dependencies, security vulnerabilities,
 * and provides update recommendations with breaking change warnings.
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import chalk from 'chalk';
import semver from 'semver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

interface PackageInfo {
  name: string;
  current: string;
  wanted: string;
  latest: string;
  type: 'dependencies' | 'devDependencies';
  location?: string;
}

interface VulnerabilityInfo {
  severity: 'low' | 'moderate' | 'high' | 'critical';
  title: string;
  module: string;
  fixAvailable: boolean;
}

class DependencyChecker {
  private outdatedPackages: PackageInfo[] = [];
  private vulnerabilities: VulnerabilityInfo[] = [];

  async run(): Promise<boolean> {
    console.log(chalk.cyan.bold('📦 Checking dependency health...\n'));

    // Check for outdated packages
    await this.checkOutdated();

    // Check for vulnerabilities
    await this.checkVulnerabilities();

    // Check for unused dependencies
    await this.checkUnused();

    // Generate report
    this.generateReport();

    // Provide recommendations
    await this.provideRecommendations();

    return (
      this.vulnerabilities.filter(
        v => v.severity === 'high' || v.severity === 'critical'
      ).length === 0
    );
  }

  private async checkOutdated(): Promise<void> {
    console.log(chalk.yellow('🔍 Checking for outdated packages...'));

    try {
      const output = execSync('npm outdated --json', {
        cwd: ROOT_DIR,
        encoding: 'utf8',
      });

      const outdated = JSON.parse(output || '{}');

      for (const [name, info] of Object.entries(outdated)) {
        const pkg = info as any;
        this.outdatedPackages.push({
          name,
          current: pkg.current,
          wanted: pkg.wanted,
          latest: pkg.latest,
          type:
            pkg.type === 'devDependencies' ? 'devDependencies' : 'dependencies',
          location: pkg.location,
        });
      }

      console.log(
        chalk.green(
          `  Found ${this.outdatedPackages.length} outdated package(s)\n`
        )
      );
    } catch (error) {
      // npm outdated returns non-zero when packages are outdated
      if (error && (error as any).stdout) {
        const output = (error as any).stdout;
        try {
          const outdated = JSON.parse(output || '{}');

          for (const [name, info] of Object.entries(outdated)) {
            const pkg = info as any;
            this.outdatedPackages.push({
              name,
              current: pkg.current,
              wanted: pkg.wanted,
              latest: pkg.latest,
              type:
                pkg.type === 'devDependencies'
                  ? 'devDependencies'
                  : 'dependencies',
              location: pkg.location,
            });
          }
        } catch {
          // Ignore JSON parse errors
        }
      }
      console.log(
        chalk.green(
          `  Found ${this.outdatedPackages.length} outdated package(s)\n`
        )
      );
    }
  }

  private async checkVulnerabilities(): Promise<void> {
    console.log(chalk.yellow('🔒 Checking for security vulnerabilities...'));

    try {
      const output = execSync('npm audit --json', {
        cwd: ROOT_DIR,
        encoding: 'utf8',
      });

      const audit = JSON.parse(output);

      if (audit.vulnerabilities) {
        for (const [module, vuln] of Object.entries(audit.vulnerabilities)) {
          const v = vuln as any;
          if (v.severity && v.severity !== 'info') {
            this.vulnerabilities.push({
              severity: v.severity,
              title: v.via[0]?.title || 'Unknown vulnerability',
              module,
              fixAvailable: !!v.fixAvailable,
            });
          }
        }
      }

      console.log(
        chalk.green(
          `  Found ${this.vulnerabilities.length} vulnerability(ies)\n`
        )
      );
    } catch (error) {
      // npm audit returns non-zero when vulnerabilities exist
      if (error && (error as any).stdout) {
        try {
          const audit = JSON.parse((error as any).stdout);

          if (audit.vulnerabilities) {
            for (const [module, vuln] of Object.entries(
              audit.vulnerabilities
            )) {
              const v = vuln as any;
              if (v.severity && v.severity !== 'info') {
                this.vulnerabilities.push({
                  severity: v.severity,
                  title: v.via[0]?.title || 'Unknown vulnerability',
                  module,
                  fixAvailable: !!v.fixAvailable,
                });
              }
            }
          }
        } catch {
          // Ignore JSON parse errors
        }
      }
      console.log(
        chalk.green(
          `  Found ${this.vulnerabilities.length} vulnerability(ies)\n`
        )
      );
    }
  }

  private async checkUnused(): Promise<void> {
    console.log(chalk.yellow('🗑️  Checking for unused dependencies...'));

    try {
      // This is a simplified check - in production, use depcheck
      console.log(
        chalk.gray('  Skipping (install depcheck for detailed analysis)\n')
      );
    } catch {
      console.log(chalk.gray('  Skipping unused dependency check\n'));
    }
  }

  private generateReport(): void {
    console.log(chalk.cyan.bold('📊 Dependency Health Report\n'));

    // Vulnerability summary
    if (this.vulnerabilities.length > 0) {
      console.log(chalk.red.bold('Security Vulnerabilities:'));

      const critical = this.vulnerabilities.filter(
        v => v.severity === 'critical'
      );
      const high = this.vulnerabilities.filter(v => v.severity === 'high');
      const moderate = this.vulnerabilities.filter(
        v => v.severity === 'moderate'
      );
      const low = this.vulnerabilities.filter(v => v.severity === 'low');

      if (critical.length > 0) {
        console.log(chalk.red(`  🔴 Critical: ${critical.length}`));
        critical.forEach(v => {
          console.log(chalk.red(`     - ${v.module}: ${v.title}`));
        });
      }

      if (high.length > 0) {
        console.log(chalk.red(`  🟠 High: ${high.length}`));
        high.forEach(v => {
          console.log(chalk.red(`     - ${v.module}: ${v.title}`));
        });
      }

      if (moderate.length > 0) {
        console.log(chalk.yellow(`  🟡 Moderate: ${moderate.length}`));
      }

      if (low.length > 0) {
        console.log(chalk.gray(`  ⚪ Low: ${low.length}`));
      }

      console.log();
    } else {
      console.log(chalk.green('✅ No security vulnerabilities found!\n'));
    }

    // Outdated packages summary
    if (this.outdatedPackages.length > 0) {
      console.log(chalk.yellow.bold('Outdated Packages:'));

      const major = this.outdatedPackages.filter(
        p => semver.major(p.latest) > semver.major(p.current)
      );
      const minor = this.outdatedPackages.filter(
        p =>
          semver.major(p.latest) === semver.major(p.current) &&
          semver.minor(p.latest) > semver.minor(p.current)
      );
      const patch = this.outdatedPackages.filter(
        p =>
          semver.major(p.latest) === semver.major(p.current) &&
          semver.minor(p.latest) === semver.minor(p.current) &&
          semver.patch(p.latest) > semver.patch(p.current)
      );

      if (major.length > 0) {
        console.log(chalk.red(`  🔴 Major updates: ${major.length}`));
        major.slice(0, 5).forEach(p => {
          console.log(
            chalk.gray(`     - ${p.name}: ${p.current} → ${p.latest}`)
          );
        });
        if (major.length > 5) {
          console.log(chalk.gray(`     ... and ${major.length - 5} more`));
        }
      }

      if (minor.length > 0) {
        console.log(chalk.yellow(`  🟡 Minor updates: ${minor.length}`));
      }

      if (patch.length > 0) {
        console.log(chalk.green(`  🟢 Patch updates: ${patch.length}`));
      }

      console.log();
    } else {
      console.log(chalk.green('✅ All packages are up to date!\n'));
    }
  }

  private async provideRecommendations(): Promise<void> {
    console.log(chalk.cyan.bold('💡 Recommendations:\n'));

    const hasHighVulnerabilities = this.vulnerabilities.some(
      v => v.severity === 'high' || v.severity === 'critical'
    );

    if (hasHighVulnerabilities) {
      console.log(chalk.red.bold('🚨 IMMEDIATE ACTION REQUIRED:'));
      console.log(chalk.red('   Run: npm audit fix --force'));
      console.log(chalk.red('   This will fix critical vulnerabilities\n'));
    } else if (this.vulnerabilities.length > 0) {
      console.log(chalk.yellow('⚠️  Security fixes available:'));
      console.log(chalk.yellow('   Run: npm audit fix'));
      console.log(
        chalk.yellow(
          '   This will fix vulnerabilities without breaking changes\n'
        )
      );
    }

    const patchUpdates = this.outdatedPackages.filter(
      p =>
        semver.major(p.latest) === semver.major(p.current) &&
        semver.minor(p.latest) === semver.minor(p.current)
    );

    if (patchUpdates.length > 0) {
      console.log(chalk.green('✅ Safe updates available:'));
      console.log(chalk.green('   Run: npm update'));
      console.log(
        chalk.green(
          `   This will update ${patchUpdates.length} package(s) to latest patch versions\n`
        )
      );
    }

    const majorUpdates = this.outdatedPackages.filter(
      p => semver.major(p.latest) > semver.major(p.current)
    );

    if (majorUpdates.length > 0) {
      console.log(chalk.yellow('⚠️  Major updates available:'));
      console.log(
        chalk.yellow(
          `   ${majorUpdates.length} package(s) have major version updates`
        )
      );
      console.log(chalk.yellow('   Review breaking changes before updating:'));
      majorUpdates.slice(0, 3).forEach(p => {
        console.log(chalk.gray(`     - ${p.name}: ${p.current} → ${p.latest}`));
      });
      if (majorUpdates.length > 3) {
        console.log(chalk.gray(`     ... and ${majorUpdates.length - 3} more`));
      }
      console.log();
    }

    if (
      !hasHighVulnerabilities &&
      this.outdatedPackages.length === 0 &&
      this.vulnerabilities.length === 0
    ) {
      console.log(chalk.green('🎉 Your dependencies are healthy!'));
      console.log(chalk.green('   No immediate action required.\n'));
    }
  }
}

// CLI interface
async function main() {
  const checker = new DependencyChecker();
  const success = await checker.run();
  process.exit(success ? 0 : 1);
}

if (import.meta.url === `file://${__filename}`) {
  main().catch(console.error);
}

export { DependencyChecker };
