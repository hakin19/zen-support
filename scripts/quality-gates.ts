#!/usr/bin/env tsx

/**
 * Quality Gates Script
 *
 * Enforces code quality standards including:
 * - Coverage thresholds
 * - Coverage trend tracking
 * - Differential coverage for PRs
 * - Quality metrics validation
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

interface CoverageThreshold {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

interface CoverageSummary {
  statements: { total: number; covered: number; pct: number };
  branches: { total: number; covered: number; pct: number };
  functions: { total: number; covered: number; pct: number };
  lines: { total: number; covered: number; pct: number };
}

interface QualityReport {
  timestamp: string;
  coverage: CoverageSummary;
  passed: boolean;
  thresholds: CoverageThreshold;
  errors: string[];
  warnings: string[];
}

class QualityGates {
  private readonly coverageDir = path.join(ROOT_DIR, 'coverage');
  private readonly historyDir = path.join(ROOT_DIR, 'coverage', 'history');
  private readonly reportFile = path.join(
    this.coverageDir,
    'coverage-summary.json'
  );

  private readonly isMVP = process.env.TEST_MODE === 'MVP';

  private readonly globalThresholds: CoverageThreshold = this.isMVP
    ? {
        // Relaxed thresholds for MVP phase
        statements: 40,
        branches: 40,
        functions: 40,
        lines: 40,
      }
    : {
        statements: 60,
        branches: 60,
        functions: 60,
        lines: 60,
      };

  private readonly packageThresholds: Record<string, CoverageThreshold> =
    this.isMVP
      ? {
          // During MVP, use global relaxed thresholds for all packages
        }
      : {
          'packages/shared': {
            statements: 70,
            branches: 70,
            functions: 70,
            lines: 70,
          },
          'packages/api': {
            statements: 65,
            branches: 65,
            functions: 65,
            lines: 65,
          },
        };

  async run(): Promise<boolean> {
    console.log(
      `🚨 Running Quality Gates...${this.isMVP ? ' (MVP thresholds enabled)' : ''}\n`
    );

    try {
      // Ensure directories exist
      await this.ensureDirectories();

      // Check if coverage report exists
      const coverageExists = await this.checkCoverageExists();
      if (!coverageExists) {
        console.error(
          '❌ Coverage report not found. Run tests with coverage first.'
        );
        return false;
      }

      // Load coverage data
      const coverage = await this.loadCoverageData();

      // Run quality checks
      const report = await this.validateQualityGates(coverage);

      // Save historical data
      await this.saveHistoricalData(report);

      // Generate report
      await this.generateReport(report);

      // Print results
      this.printResults(report);

      return report.passed;
    } catch (error) {
      console.error('❌ Quality gates failed with error:', error);
      return false;
    }
  }

  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.coverageDir, { recursive: true });
    await fs.mkdir(this.historyDir, { recursive: true });
  }

  private async checkCoverageExists(): Promise<boolean> {
    try {
      await fs.access(this.reportFile);
      return true;
    } catch {
      return false;
    }
  }

  private async loadCoverageData(): Promise<any> {
    const data = await fs.readFile(this.reportFile, 'utf8');
    return JSON.parse(data);
  }

  private async validateQualityGates(
    coverageData: any
  ): Promise<QualityReport> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let passed = true;

    // Check global coverage
    const totalCoverage = coverageData.total;

    if (totalCoverage.statements.pct < this.globalThresholds.statements) {
      errors.push(
        `Global statement coverage ${totalCoverage.statements.pct.toFixed(2)}% < ${this.globalThresholds.statements}%`
      );
      passed = false;
    }

    if (totalCoverage.branches.pct < this.globalThresholds.branches) {
      errors.push(
        `Global branch coverage ${totalCoverage.branches.pct.toFixed(2)}% < ${this.globalThresholds.branches}%`
      );
      passed = false;
    }

    if (totalCoverage.functions.pct < this.globalThresholds.functions) {
      errors.push(
        `Global function coverage ${totalCoverage.functions.pct.toFixed(2)}% < ${this.globalThresholds.functions}%`
      );
      passed = false;
    }

    if (totalCoverage.lines.pct < this.globalThresholds.lines) {
      errors.push(
        `Global line coverage ${totalCoverage.lines.pct.toFixed(2)}% < ${this.globalThresholds.lines}%`
      );
      passed = false;
    }

    // Check package-specific coverage
    for (const [packagePath, thresholds] of Object.entries(
      this.packageThresholds
    )) {
      const packageCoverage = this.getPackageCoverage(
        coverageData,
        packagePath
      );
      if (packageCoverage) {
        const packageErrors = this.checkPackageThresholds(
          packagePath,
          packageCoverage,
          thresholds
        );
        if (packageErrors.length > 0) {
          errors.push(...packageErrors);
          passed = false;
        }
      }
    }

    // Check for coverage trends (warnings only)
    const previousReport = await this.getLastHistoricalData();
    if (previousReport) {
      const trendWarnings = this.checkCoverageTrends(
        totalCoverage,
        previousReport.coverage
      );
      warnings.push(...trendWarnings);
    }

    return {
      timestamp: new Date().toISOString(),
      coverage: totalCoverage,
      passed,
      thresholds: this.globalThresholds,
      errors,
      warnings,
    };
  }

  private getPackageCoverage(
    coverageData: any,
    packagePath: string
  ): CoverageSummary | null {
    // Sum up all files in the package
    const packageFiles = Object.keys(coverageData).filter(
      file => file.startsWith(packagePath) && file !== 'total'
    );

    if (packageFiles.length === 0) return null;

    const statements = { total: 0, covered: 0, pct: 0 };
    const branches = { total: 0, covered: 0, pct: 0 };
    const functions = { total: 0, covered: 0, pct: 0 };
    const lines = { total: 0, covered: 0, pct: 0 };

    for (const file of packageFiles) {
      const fileCoverage = coverageData[file];
      statements.total += fileCoverage.statements.total;
      statements.covered += fileCoverage.statements.covered;
      branches.total += fileCoverage.branches.total;
      branches.covered += fileCoverage.branches.covered;
      functions.total += fileCoverage.functions.total;
      functions.covered += fileCoverage.functions.covered;
      lines.total += fileCoverage.lines.total;
      lines.covered += fileCoverage.lines.covered;
    }

    // Calculate percentages
    statements.pct =
      statements.total > 0
        ? (statements.covered / statements.total) * 100
        : 100;
    branches.pct =
      branches.total > 0 ? (branches.covered / branches.total) * 100 : 100;
    functions.pct =
      functions.total > 0 ? (functions.covered / functions.total) * 100 : 100;
    lines.pct = lines.total > 0 ? (lines.covered / lines.total) * 100 : 100;

    return { statements, branches, functions, lines };
  }

  private checkPackageThresholds(
    packagePath: string,
    coverage: CoverageSummary,
    thresholds: CoverageThreshold
  ): string[] {
    const errors: string[] = [];

    if (coverage.statements.pct < thresholds.statements) {
      errors.push(
        `${packagePath} statement coverage ${coverage.statements.pct.toFixed(2)}% < ${thresholds.statements}%`
      );
    }

    if (coverage.branches.pct < thresholds.branches) {
      errors.push(
        `${packagePath} branch coverage ${coverage.branches.pct.toFixed(2)}% < ${thresholds.branches}%`
      );
    }

    if (coverage.functions.pct < thresholds.functions) {
      errors.push(
        `${packagePath} function coverage ${coverage.functions.pct.toFixed(2)}% < ${thresholds.functions}%`
      );
    }

    if (coverage.lines.pct < thresholds.lines) {
      errors.push(
        `${packagePath} line coverage ${coverage.lines.pct.toFixed(2)}% < ${thresholds.lines}%`
      );
    }

    return errors;
  }

  private checkCoverageTrends(
    current: CoverageSummary,
    previous: CoverageSummary
  ): string[] {
    const warnings: string[] = [];
    const threshold = 2; // 2% decrease triggers warning

    if (current.statements.pct < previous.statements.pct - threshold) {
      warnings.push(
        `Statement coverage decreased by ${(previous.statements.pct - current.statements.pct).toFixed(2)}%`
      );
    }

    if (current.branches.pct < previous.branches.pct - threshold) {
      warnings.push(
        `Branch coverage decreased by ${(previous.branches.pct - current.branches.pct).toFixed(2)}%`
      );
    }

    if (current.functions.pct < previous.functions.pct - threshold) {
      warnings.push(
        `Function coverage decreased by ${(previous.functions.pct - current.functions.pct).toFixed(2)}%`
      );
    }

    if (current.lines.pct < previous.lines.pct - threshold) {
      warnings.push(
        `Line coverage decreased by ${(previous.lines.pct - current.lines.pct).toFixed(2)}%`
      );
    }

    return warnings;
  }

  private async saveHistoricalData(report: QualityReport): Promise<void> {
    const filename = `coverage-${report.timestamp.split('T')[0]}-${Date.now()}.json`;
    const filepath = path.join(this.historyDir, filename);
    await fs.writeFile(filepath, JSON.stringify(report, null, 2));
  }

  private async getLastHistoricalData(): Promise<QualityReport | null> {
    try {
      const files = await fs.readdir(this.historyDir);
      const reportFiles = files
        .filter(f => f.startsWith('coverage-') && f.endsWith('.json'))
        .sort()
        .reverse();

      if (reportFiles.length === 0) return null;

      const lastFile = reportFiles[0];
      const data = await fs.readFile(
        path.join(this.historyDir, lastFile),
        'utf8'
      );
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  private async generateReport(report: QualityReport): Promise<void> {
    const reportPath = path.join(this.coverageDir, 'quality-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    // Generate markdown report
    const markdown = this.generateMarkdownReport(report);
    const markdownPath = path.join(this.coverageDir, 'quality-report.md');
    await fs.writeFile(markdownPath, markdown);
  }

  private generateMarkdownReport(report: QualityReport): string {
    const { coverage, passed, errors, warnings } = report;

    return `# Quality Gates Report

**Status**: ${passed ? '✅ PASSED' : '❌ FAILED'}  
**Generated**: ${new Date(report.timestamp).toLocaleString()}

## Coverage Summary

| Metric | Coverage | Threshold | Status |
|--------|----------|-----------|---------|
| Statements | ${coverage.statements.pct.toFixed(2)}% | ${this.globalThresholds.statements}% | ${coverage.statements.pct >= this.globalThresholds.statements ? '✅' : '❌'} |
| Branches | ${coverage.branches.pct.toFixed(2)}% | ${this.globalThresholds.branches}% | ${coverage.branches.pct >= this.globalThresholds.branches ? '✅' : '❌'} |
| Functions | ${coverage.functions.pct.toFixed(2)}% | ${this.globalThresholds.functions}% | ${coverage.functions.pct >= this.globalThresholds.functions ? '✅' : '❌'} |
| Lines | ${coverage.lines.pct.toFixed(2)}% | ${this.globalThresholds.lines}% | ${coverage.lines.pct >= this.globalThresholds.lines ? '✅' : '❌'} |

## Errors

${errors.length === 0 ? 'No errors found! 🎉' : errors.map(error => `- ❌ ${error}`).join('\n')}

## Warnings

${warnings.length === 0 ? 'No warnings.' : warnings.map(warning => `- ⚠️ ${warning}`).join('\n')}

## Quality Gates Status

${
  passed
    ? '✅ All quality gates passed! Code meets quality standards.'
    : '❌ Quality gates failed. Please address the errors above before merging.'
}
`;
  }

  private printResults(report: QualityReport): void {
    const { coverage, passed, errors, warnings } = report;

    console.log('📊 Coverage Summary:');
    console.log(
      `  Statements: ${this.formatCoverage(coverage.statements.pct, this.globalThresholds.statements)}`
    );
    console.log(
      `  Branches:   ${this.formatCoverage(coverage.branches.pct, this.globalThresholds.branches)}`
    );
    console.log(
      `  Functions:  ${this.formatCoverage(coverage.functions.pct, this.globalThresholds.functions)}`
    );
    console.log(
      `  Lines:      ${this.formatCoverage(coverage.lines.pct, this.globalThresholds.lines)}\n`
    );

    if (warnings.length > 0) {
      console.log('⚠️ Warnings:');
      warnings.forEach(warning => console.log(`  - ${warning}`));
      console.log();
    }

    if (errors.length > 0) {
      console.log('❌ Errors:');
      errors.forEach(error => console.log(`  - ${error}`));
      console.log();
    }

    if (passed) {
      console.log('✅ Quality gates PASSED! All thresholds met.');
    } else {
      console.log('❌ Quality gates FAILED! Please fix the errors above.');
    }

    console.log(`\n📄 Detailed report saved to: coverage/quality-report.md`);
  }

  private formatCoverage(actual: number, threshold: number): string {
    const icon = actual >= threshold ? '✅' : '❌';
    const actualStr = actual.toFixed(2).padStart(6);
    return `${icon} ${actualStr}% (min: ${threshold}%)`;
  }
}

// CLI interface
async function main() {
  const gates = new QualityGates();
  const passed = await gates.run();
  process.exit(passed ? 0 : 1);
}

if (import.meta.url === `file://${__filename}`) {
  main().catch(console.error);
}

export { QualityGates };
