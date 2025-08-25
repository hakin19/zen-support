#!/usr/bin/env tsx

/**
 * Coverage Aggregator Script
 *
 * Combines coverage reports from all packages in the monorepo
 * to create a unified coverage report and metrics.
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

interface PackageCoverage {
  name: string;
  path: string;
  coverage: CoverageSummary;
}

interface CoverageSummary {
  statements: { total: number; covered: number; pct: number };
  branches: { total: number; covered: number; pct: number };
  functions: { total: number; covered: number; pct: number };
  lines: { total: number; covered: number; pct: number };
}

class CoverageAggregator {
  private readonly packages = ['api', 'shared', 'web', 'device-agent'];
  private readonly aggregatedDir = path.join(
    ROOT_DIR,
    'coverage',
    'aggregated'
  );

  async aggregate(): Promise<void> {
    console.log('📊 Aggregating coverage reports from all packages...\n');

    try {
      // Ensure aggregated directory exists
      await fs.mkdir(this.aggregatedDir, { recursive: true });

      // Collect coverage from all packages
      const packageCoverages = await this.collectPackageCoverages();

      if (packageCoverages.length === 0) {
        console.error('❌ No coverage reports found. Run tests first.');
        process.exit(1);
      }

      // Calculate aggregated metrics
      const aggregated = this.calculateAggregatedCoverage(packageCoverages);

      // Generate reports
      await this.generateAggregatedReport(packageCoverages, aggregated);
      await this.generateDetailedReport(packageCoverages, aggregated);
      await this.generateMarkdownReport(packageCoverages, aggregated);

      // Print summary
      this.printSummary(packageCoverages, aggregated);

      console.log('\n✅ Coverage aggregation complete!');
      console.log(`📁 Reports saved to: ${this.aggregatedDir}`);
    } catch (error) {
      console.error('❌ Failed to aggregate coverage:', error);
      process.exit(1);
    }
  }

  private async collectPackageCoverages(): Promise<PackageCoverage[]> {
    const coverages: PackageCoverage[] = [];

    // First check root coverage
    const rootCoverageFile = path.join(
      ROOT_DIR,
      'coverage',
      'coverage-summary.json'
    );

    try {
      const rootData = await fs.readFile(rootCoverageFile, 'utf8');
      const rootCoverage = JSON.parse(rootData);

      // Extract per-package data from root coverage
      for (const packageName of this.packages) {
        const packagePath = `packages/${packageName}`;
        const packageCoverage = this.extractPackageCoverage(
          rootCoverage,
          packagePath
        );

        if (packageCoverage) {
          coverages.push({
            name: packageName,
            path: packagePath,
            coverage: packageCoverage,
          });
        }
      }
    } catch (error) {
      console.log(
        '⚠️  No root coverage found, checking individual packages...'
      );

      // Fallback to individual package coverage
      for (const packageName of this.packages) {
        const coverageFile = path.join(
          ROOT_DIR,
          'packages',
          packageName,
          'coverage',
          'coverage-summary.json'
        );

        try {
          const data = await fs.readFile(coverageFile, 'utf8');
          const coverage = JSON.parse(data);

          if (coverage.total) {
            coverages.push({
              name: packageName,
              path: `packages/${packageName}`,
              coverage: coverage.total,
            });
            console.log(`  ✓ Found coverage for ${packageName}`);
          }
        } catch {
          console.log(`  ⚠️  No coverage found for ${packageName}`);
        }
      }
    }

    return coverages;
  }

  private extractPackageCoverage(
    fullCoverage: any,
    packagePath: string
  ): CoverageSummary | null {
    const summary: CoverageSummary = {
      statements: { total: 0, covered: 0, pct: 0 },
      branches: { total: 0, covered: 0, pct: 0 },
      functions: { total: 0, covered: 0, pct: 0 },
      lines: { total: 0, covered: 0, pct: 0 },
    };

    let hasData = false;

    // Aggregate all files in the package
    for (const [filePath, fileCoverage] of Object.entries(fullCoverage)) {
      if (
        filePath.includes(packagePath) &&
        filePath !== 'total' &&
        typeof fileCoverage === 'object'
      ) {
        const coverage = fileCoverage as any;
        hasData = true;

        summary.statements.total += coverage.statements.total || 0;
        summary.statements.covered += coverage.statements.covered || 0;
        summary.branches.total += coverage.branches.total || 0;
        summary.branches.covered += coverage.branches.covered || 0;
        summary.functions.total += coverage.functions.total || 0;
        summary.functions.covered += coverage.functions.covered || 0;
        summary.lines.total += coverage.lines.total || 0;
        summary.lines.covered += coverage.lines.covered || 0;
      }
    }

    if (!hasData) return null;

    // Calculate percentages
    summary.statements.pct =
      summary.statements.total > 0
        ? (summary.statements.covered / summary.statements.total) * 100
        : 100;
    summary.branches.pct =
      summary.branches.total > 0
        ? (summary.branches.covered / summary.branches.total) * 100
        : 100;
    summary.functions.pct =
      summary.functions.total > 0
        ? (summary.functions.covered / summary.functions.total) * 100
        : 100;
    summary.lines.pct =
      summary.lines.total > 0
        ? (summary.lines.covered / summary.lines.total) * 100
        : 100;

    return summary;
  }

  private calculateAggregatedCoverage(
    packageCoverages: PackageCoverage[]
  ): CoverageSummary {
    const aggregated: CoverageSummary = {
      statements: { total: 0, covered: 0, pct: 0 },
      branches: { total: 0, covered: 0, pct: 0 },
      functions: { total: 0, covered: 0, pct: 0 },
      lines: { total: 0, covered: 0, pct: 0 },
    };

    // Sum all metrics
    for (const pkg of packageCoverages) {
      aggregated.statements.total += pkg.coverage.statements.total;
      aggregated.statements.covered += pkg.coverage.statements.covered;
      aggregated.branches.total += pkg.coverage.branches.total;
      aggregated.branches.covered += pkg.coverage.branches.covered;
      aggregated.functions.total += pkg.coverage.functions.total;
      aggregated.functions.covered += pkg.coverage.functions.covered;
      aggregated.lines.total += pkg.coverage.lines.total;
      aggregated.lines.covered += pkg.coverage.lines.covered;
    }

    // Calculate percentages
    aggregated.statements.pct =
      aggregated.statements.total > 0
        ? (aggregated.statements.covered / aggregated.statements.total) * 100
        : 100;
    aggregated.branches.pct =
      aggregated.branches.total > 0
        ? (aggregated.branches.covered / aggregated.branches.total) * 100
        : 100;
    aggregated.functions.pct =
      aggregated.functions.total > 0
        ? (aggregated.functions.covered / aggregated.functions.total) * 100
        : 100;
    aggregated.lines.pct =
      aggregated.lines.total > 0
        ? (aggregated.lines.covered / aggregated.lines.total) * 100
        : 100;

    return aggregated;
  }

  private async generateAggregatedReport(
    packageCoverages: PackageCoverage[],
    aggregated: CoverageSummary
  ): Promise<void> {
    const report = {
      timestamp: new Date().toISOString(),
      total: aggregated,
      packages: packageCoverages.reduce(
        (acc, pkg) => {
          acc[pkg.name] = pkg.coverage;
          return acc;
        },
        {} as Record<string, CoverageSummary>
      ),
    };

    const reportFile = path.join(
      this.aggregatedDir,
      'coverage-aggregated.json'
    );
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
  }

  private async generateDetailedReport(
    packageCoverages: PackageCoverage[],
    aggregated: CoverageSummary
  ): Promise<void> {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalPackages: packageCoverages.length,
        packagesWithCoverage: packageCoverages.length,
        overallCoverage: {
          statements: aggregated.statements.pct.toFixed(2),
          branches: aggregated.branches.pct.toFixed(2),
          functions: aggregated.functions.pct.toFixed(2),
          lines: aggregated.lines.pct.toFixed(2),
        },
      },
      packages: packageCoverages.map(pkg => ({
        name: pkg.name,
        path: pkg.path,
        coverage: {
          statements: `${pkg.coverage.statements.pct.toFixed(2)}%`,
          branches: `${pkg.coverage.branches.pct.toFixed(2)}%`,
          functions: `${pkg.coverage.functions.pct.toFixed(2)}%`,
          lines: `${pkg.coverage.lines.pct.toFixed(2)}%`,
        },
        metrics: {
          statements: `${pkg.coverage.statements.covered}/${pkg.coverage.statements.total}`,
          branches: `${pkg.coverage.branches.covered}/${pkg.coverage.branches.total}`,
          functions: `${pkg.coverage.functions.covered}/${pkg.coverage.functions.total}`,
          lines: `${pkg.coverage.lines.covered}/${pkg.coverage.lines.total}`,
        },
      })),
    };

    const reportFile = path.join(this.aggregatedDir, 'coverage-detailed.json');
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
  }

  private async generateMarkdownReport(
    packageCoverages: PackageCoverage[],
    aggregated: CoverageSummary
  ): Promise<void> {
    const markdown = `# Monorepo Coverage Report

Generated: ${new Date().toISOString()}

## Overall Coverage

| Metric | Coverage | Details |
|--------|----------|---------|
| **Statements** | ${aggregated.statements.pct.toFixed(2)}% | ${aggregated.statements.covered}/${aggregated.statements.total} |
| **Branches** | ${aggregated.branches.pct.toFixed(2)}% | ${aggregated.branches.covered}/${aggregated.branches.total} |
| **Functions** | ${aggregated.functions.pct.toFixed(2)}% | ${aggregated.functions.covered}/${aggregated.functions.total} |
| **Lines** | ${aggregated.lines.pct.toFixed(2)}% | ${aggregated.lines.covered}/${aggregated.lines.total} |

## Package Coverage

| Package | Statements | Branches | Functions | Lines |
|---------|------------|----------|-----------|-------|
${packageCoverages
  .map(
    pkg =>
      `| **${pkg.name}** | ${pkg.coverage.statements.pct.toFixed(2)}% | ${pkg.coverage.branches.pct.toFixed(2)}% | ${pkg.coverage.functions.pct.toFixed(2)}% | ${pkg.coverage.lines.pct.toFixed(2)}% |`
  )
  .join('\n')}

## Coverage Thresholds

| Package | Required Coverage | Status |
|---------|-------------------|---------|
| **shared** | 70% | ${this.getThresholdStatus(packageCoverages.find(p => p.name === 'shared')?.coverage.lines.pct || 0, 70)} |
| **api** | 65% | ${this.getThresholdStatus(packageCoverages.find(p => p.name === 'api')?.coverage.lines.pct || 0, 65)} |
| **web** | 60% | ${this.getThresholdStatus(packageCoverages.find(p => p.name === 'web')?.coverage.lines.pct || 0, 60)} |
| **device-agent** | 60% | ${this.getThresholdStatus(packageCoverages.find(p => p.name === 'device-agent')?.coverage.lines.pct || 0, 60)} |

## Coverage Trends

To track coverage over time, run:
\`\`\`bash
npm run quality:check
\`\`\`

This will save historical data and check for coverage regressions.

## Generating Badges

To generate coverage badges for your README:
\`\`\`bash
npm run coverage:badge
\`\`\`

---

_Generated by coverage-aggregator.ts_
`;

    const reportFile = path.join(this.aggregatedDir, 'COVERAGE_REPORT.md');
    await fs.writeFile(reportFile, markdown);
  }

  private getThresholdStatus(actual: number, required: number): string {
    return actual >= required
      ? `✅ Passing (${actual.toFixed(1)}%)`
      : `❌ Failing (${actual.toFixed(1)}%)`;
  }

  private printSummary(
    packageCoverages: PackageCoverage[],
    aggregated: CoverageSummary
  ): void {
    console.log('📈 Coverage Summary:\n');
    console.log('Overall Coverage:');
    console.log(`  Statements: ${this.formatMetric(aggregated.statements)}`);
    console.log(`  Branches:   ${this.formatMetric(aggregated.branches)}`);
    console.log(`  Functions:  ${this.formatMetric(aggregated.functions)}`);
    console.log(`  Lines:      ${this.formatMetric(aggregated.lines)}`);

    console.log('\nPackage Coverage:');
    for (const pkg of packageCoverages) {
      console.log(
        `  ${pkg.name.padEnd(15)} Lines: ${pkg.coverage.lines.pct.toFixed(1)}%`
      );
    }
  }

  private formatMetric(metric: {
    total: number;
    covered: number;
    pct: number;
  }): string {
    const pctStr = metric.pct.toFixed(1).padStart(5);
    const icon = metric.pct >= 60 ? '✅' : '❌';
    return `${icon} ${pctStr}% (${metric.covered}/${metric.total})`;
  }
}

// CLI interface
async function main() {
  const aggregator = new CoverageAggregator();
  await aggregator.aggregate();
}

if (import.meta.url === `file://${__filename}`) {
  main().catch(console.error);
}

export { CoverageAggregator };
