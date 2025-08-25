#!/usr/bin/env tsx

/**
 * Test Watch Script for TDD Workflow
 *
 * Provides intelligent file watching for Test-Driven Development:
 * - Watches source files and automatically runs corresponding tests
 * - Debounces file changes to avoid excessive test runs
 * - Provides instant feedback for TDD red-green-refactor cycle
 * - Integrates with quality gates for continuous quality feedback
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

import chokidar from 'chokidar';
import { debounce } from 'lodash-es';

import type { ChildProcess } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

interface WatchOptions {
  pattern?: string;
  coverage?: boolean;
  verbose?: boolean;
  debounceMs?: number;
  packageName?: string;
  silent?: boolean;
}

class TestWatcher {
  private currentProcess: ChildProcess | null = null;
  private watcher: chokidar.FSWatcher | null = null;
  private readonly debouncedRunTests: () => void;

  constructor(private options: WatchOptions) {
    this.debouncedRunTests = debounce(() => {
      this.runTests();
    }, options.debounceMs || 300);
  }

  async start(): Promise<void> {
    console.log('🔍 Starting test watcher for TDD workflow...');
    console.log('📝 Red-Green-Refactor cycle enabled!');
    console.log('💡 Tip: Save a file to run its tests automatically\n');

    // Setup file watcher
    await this.setupWatcher();

    // Run initial test suite
    console.log('🏃 Running initial test suite...');
    this.runTests();

    // Keep the process alive
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
  }

  private async setupWatcher(): Promise<void> {
    const watchPatterns = this.getWatchPatterns();

    this.watcher = chokidar.watch(watchPatterns, {
      ignored: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/coverage/**',
        '**/test-results/**',
        '**/.git/**',
        '**/.next/**',
      ],
      persistent: true,
      ignoreInitial: true,
    });

    this.watcher
      .on('change', filePath => {
        if (!this.options.silent) {
          console.log(
            `\n📝 File changed: ${path.relative(ROOT_DIR, filePath)}`
          );
        }
        this.debouncedRunTests();
      })
      .on('add', filePath => {
        if (!this.options.silent) {
          console.log(`\n➕ File added: ${path.relative(ROOT_DIR, filePath)}`);
        }
        this.debouncedRunTests();
      })
      .on('unlink', filePath => {
        if (!this.options.silent) {
          console.log(
            `\n🗑️ File removed: ${path.relative(ROOT_DIR, filePath)}`
          );
        }
        this.debouncedRunTests();
      })
      .on('error', error => {
        console.error('❌ Watcher error:', error);
      });

    console.log(`👀 Watching: ${watchPatterns.join(', ')}\n`);
  }

  private getWatchPatterns(): string[] {
    if (this.options.pattern) {
      return [this.options.pattern];
    }

    if (this.options.packageName) {
      return [
        `packages/${this.options.packageName}/src/**/*.{ts,tsx}`,
        `packages/${this.options.packageName}/test/**/*.{ts,tsx}`,
      ];
    }

    return [
      'packages/**/src/**/*.{ts,tsx}',
      'packages/**/test/**/*.{ts,tsx}',
      'test/**/*.{ts,tsx}',
      'scripts/**/*.{ts,tsx}',
    ];
  }

  private runTests(): void {
    // Kill existing process if running
    if (this.currentProcess) {
      this.currentProcess.kill('SIGTERM');
      this.currentProcess = null;
    }

    const args = this.buildVitestArgs();

    if (!this.options.silent) {
      console.log(`🧪 Running: vitest ${args.join(' ')}`);
    }

    this.currentProcess = spawn('npx', ['vitest', ...args], {
      stdio: 'inherit',
      cwd: ROOT_DIR,
    });

    this.currentProcess.on('close', code => {
      this.currentProcess = null;

      if (!this.options.silent) {
        if (code === 0) {
          console.log('✅ Tests passed! Ready for next change...\n');
          this.printTDDTips();
        } else {
          console.log('❌ Tests failed! Fix and save to try again...\n');
          this.printFailureTips();
        }
      }
    });

    this.currentProcess.on('error', error => {
      console.error('Failed to start vitest:', error);
      this.currentProcess = null;
    });
  }

  private buildVitestArgs(): string[] {
    const args = ['watch'];

    // Always run in reporter mode for clean output
    args.push('--reporter=basic');

    // Add package filter if specified
    if (this.options.packageName) {
      args.push(`packages/${this.options.packageName}/**/*.test.ts`);
    }

    // Coverage only on explicit request (can slow down feedback)
    if (this.options.coverage) {
      args.push('--coverage');
    }

    if (this.options.verbose) {
      args.push('--reporter=verbose');
    }

    // Optimize for fast feedback
    args.push('--pool=forks');
    args.push('--poolOptions.forks.singleFork=false');

    return args;
  }

  private printTDDTips(): void {
    const tips = [
      '🔴 Red: Write a failing test',
      '🟢 Green: Write minimal code to pass',
      '🔵 Refactor: Improve code while keeping tests green',
    ];

    const randomTip = tips[Math.floor(Math.random() * tips.length)];
    console.log(`💡 TDD Tip: ${randomTip}`);
  }

  private printFailureTips(): void {
    const tips = [
      '🎯 Focus on making the failing test pass',
      '🔍 Check the test output above for clues',
      '🐛 Add console.log to debug if needed',
      '📖 Re-read the test to understand what it expects',
      '🧹 Consider if you need to clean up test data',
    ];

    const randomTip = tips[Math.floor(Math.random() * tips.length)];
    console.log(`🆘 Debug Tip: ${randomTip}`);
  }

  private cleanup(): void {
    console.log('\n🛑 Shutting down test watcher...');

    if (this.currentProcess) {
      this.currentProcess.kill('SIGTERM');
      this.currentProcess = null;
    }

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    console.log('👋 Test watcher stopped. Happy coding!');
    process.exit(0);
  }

  // Interactive commands during watch mode
  printCommands(): void {
    console.log('\n⌨️ Interactive Commands:');
    console.log('  Press "a" to run all tests');
    console.log('  Press "f" to run only failed tests');
    console.log('  Press "o" to run only changed files');
    console.log('  Press "c" to toggle coverage');
    console.log('  Press "q" to quit');
    console.log('  Press "h" to show this help\n');
  }

  setupInteractiveMode(): void {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', key => {
      const command = key.toString().toLowerCase();

      switch (command) {
        case 'a':
          console.log('\n🔄 Running all tests...');
          this.runTests();
          break;
        case 'f':
          console.log('\n🔄 Running failed tests...');
          // TODO: Implement failed test tracking
          this.runTests();
          break;
        case 'o':
          console.log('\n🔄 Running affected tests...');
          // TODO: Implement git diff detection
          this.runTests();
          break;
        case 'c':
          this.options.coverage = !this.options.coverage;
          console.log(
            `\n📊 Coverage ${this.options.coverage ? 'enabled' : 'disabled'}`
          );
          break;
        case 'q':
          this.cleanup();
          break;
        case 'h':
          this.printCommands();
          break;
        case '\u0003': // Ctrl+C
          this.cleanup();
          break;
      }
    });
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options: WatchOptions = {
    coverage: false,
    verbose: false,
    debounceMs: 300,
    silent: false,
  };

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--pattern':
        options.pattern = args[++i];
        break;
      case '--coverage':
        options.coverage = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--debounce':
        options.debounceMs = parseInt(args[++i]);
        break;
      case '--package':
        options.packageName = args[++i];
        break;
      case '--silent':
        options.silent = true;
        break;
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  const watcher = new TestWatcher(options);

  // Setup interactive mode unless silent
  if (!options.silent) {
    watcher.printCommands();
    watcher.setupInteractiveMode();
  }

  await watcher.start();
}

function printHelp() {
  console.log(`
Test Watcher - TDD Workflow Support

Usage: npm run test:watch -- [options]

Options:
  --pattern <glob>    Watch pattern (default: packages/**/src/**/*.ts)
  --coverage          Run with coverage (slower feedback)
  --verbose           Verbose test output
  --debounce <ms>     Debounce delay in milliseconds (default: 300)
  --package <name>    Watch specific package only
  --silent            Disable interactive mode and tips
  --help              Show this help

Examples:
  npm run test:watch                                 # Watch all packages
  npm run test:watch -- --package api              # Watch API package only
  npm run test:watch -- --pattern "**/*.util.ts"   # Watch utility files
  npm run test:watch -- --coverage                 # Watch with coverage
  npm run test:watch -- --silent                   # Minimal output

TDD Workflow:
  1. 🔴 Write a failing test
  2. 🟢 Write minimal code to make it pass
  3. 🔵 Refactor while keeping tests green
  4. Repeat!
`);
}

if (import.meta.url === `file://${__filename}`) {
  main().catch(console.error);
}

export { TestWatcher };
