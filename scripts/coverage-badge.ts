#!/usr/bin/env tsx

/**
 * Coverage Badge Generator
 *
 * Generates SVG badges for coverage metrics to display in README
 * Reads coverage data and creates visual badges for each metric
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

interface CoverageSummary {
  statements: { pct: number };
  branches: { pct: number };
  functions: { pct: number };
  lines: { pct: number };
}

class CoverageBadgeGenerator {
  private readonly coverageFile = path.join(
    ROOT_DIR,
    'coverage',
    'coverage-summary.json'
  );
  private readonly badgeDir = path.join(ROOT_DIR, 'coverage', 'badges');

  async generate(): Promise<void> {
    console.log('🎨 Generating coverage badges...\n');

    try {
      // Ensure badge directory exists
      await fs.mkdir(this.badgeDir, { recursive: true });

      // Check if coverage report exists
      const coverageExists = await this.checkCoverageExists();
      if (!coverageExists) {
        console.error(
          '❌ Coverage report not found. Run tests with coverage first.'
        );
        process.exit(1);
      }

      // Load coverage data
      const coverageData = await this.loadCoverageData();
      const coverage = coverageData.total;

      // Generate badges for each metric
      await this.generateBadge('statements', coverage.statements.pct);
      await this.generateBadge('branches', coverage.branches.pct);
      await this.generateBadge('functions', coverage.functions.pct);
      await this.generateBadge('lines', coverage.lines.pct);

      // Generate overall coverage badge (average of all metrics)
      const overall =
        (coverage.statements.pct +
          coverage.branches.pct +
          coverage.functions.pct +
          coverage.lines.pct) /
        4;
      await this.generateBadge('coverage', overall);

      console.log('✅ Coverage badges generated successfully!');
      console.log(`📁 Badges saved to: ${this.badgeDir}`);

      // Generate markdown snippet for README
      await this.generateReadmeSnippet(coverage, overall);
    } catch (error) {
      console.error('❌ Failed to generate badges:', error);
      process.exit(1);
    }
  }

  private async checkCoverageExists(): Promise<boolean> {
    try {
      await fs.access(this.coverageFile);
      return true;
    } catch {
      return false;
    }
  }

  private async loadCoverageData(): Promise<any> {
    const data = await fs.readFile(this.coverageFile, 'utf8');
    return JSON.parse(data);
  }

  private async generateBadge(
    label: string,
    percentage: number
  ): Promise<void> {
    const color = this.getColor(percentage);
    const displayLabel = label.charAt(0).toUpperCase() + label.slice(1);
    const displayValue = `${percentage.toFixed(1)}%`;

    const svg = this.createSvg(displayLabel, displayValue, color);
    const filename = path.join(this.badgeDir, `${label}.svg`);

    await fs.writeFile(filename, svg);
    console.log(`  ✓ ${displayLabel}: ${displayValue} (${color})`);
  }

  private getColor(percentage: number): string {
    if (percentage >= 80) return '#4c1'; // Bright green
    if (percentage >= 60) return '#97ca00'; // Green
    if (percentage >= 40) return '#dfb317'; // Yellow
    if (percentage >= 20) return '#fe7d37'; // Orange
    return '#e05d44'; // Red
  }

  private createSvg(label: string, value: string, color: string): string {
    // Calculate text widths (approximate)
    const labelWidth = label.length * 7 + 10;
    const valueWidth = value.length * 7 + 10;
    const totalWidth = labelWidth + valueWidth;

    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">
    <text aria-hidden="true" x="${labelWidth * 5}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${(labelWidth - 10) * 10}">${label}</text>
    <text x="${labelWidth * 5}" y="140" transform="scale(.1)" fill="#fff" textLength="${(labelWidth - 10) * 10}">${label}</text>
    <text aria-hidden="true" x="${labelWidth * 10 + valueWidth * 5}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${(valueWidth - 10) * 10}">${value}</text>
    <text x="${labelWidth * 10 + valueWidth * 5}" y="140" transform="scale(.1)" fill="#fff" textLength="${(valueWidth - 10) * 10}">${value}</text>
  </g>
</svg>`;
  }

  private async generateReadmeSnippet(
    coverage: CoverageSummary,
    overall: number
  ): Promise<void> {
    const snippet = `## Coverage Report

![Coverage](./coverage/badges/coverage.svg)
![Statements](./coverage/badges/statements.svg)
![Branches](./coverage/badges/branches.svg)
![Functions](./coverage/badges/functions.svg)
![Lines](./coverage/badges/lines.svg)

### Coverage Summary

| Metric | Coverage |
|--------|----------|
| Overall | ${overall.toFixed(1)}% |
| Statements | ${coverage.statements.pct.toFixed(1)}% |
| Branches | ${coverage.branches.pct.toFixed(1)}% |
| Functions | ${coverage.functions.pct.toFixed(1)}% |
| Lines | ${coverage.lines.pct.toFixed(1)}% |

_Last updated: ${new Date().toISOString()}_
`;

    const snippetFile = path.join(this.badgeDir, 'README_SNIPPET.md');
    await fs.writeFile(snippetFile, snippet);

    console.log('\n📝 README snippet generated:');
    console.log(`   ${snippetFile}`);
    console.log(
      '\n   Copy the content above to your README.md to display badges.'
    );
  }
}

// CLI interface
async function main() {
  const generator = new CoverageBadgeGenerator();
  await generator.generate();
}

if (import.meta.url === `file://${__filename}`) {
  main().catch(console.error);
}

export { CoverageBadgeGenerator };
