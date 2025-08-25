#!/usr/bin/env tsx

/**
 * Test Database Reset Script
 *
 * Complete test database reset and initialization utility:
 * - Drops and recreates database schema
 * - Runs migrations and seedings
 * - Creates database snapshots for fast restore
 * - Manages database state for testing
 */

import { spawn, execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

interface ResetOptions {
  mode: 'full' | 'migrations' | 'data' | 'snapshot';
  strategy?: 'minimal' | 'standard' | 'comprehensive';
  verbose?: boolean;
  force?: boolean;
  backup?: boolean;
  restore?: string;
}

class TestDatabaseReset {
  private readonly snapshotDir = path.join(
    ROOT_DIR,
    'test-results',
    'db-snapshots'
  );

  constructor(private options: ResetOptions) {}

  async reset(): Promise<boolean> {
    console.log(`🔄 Starting database reset with ${this.options.mode} mode...`);

    try {
      // Ensure Supabase is running
      await this.ensureSupabase();

      // Create backup if requested
      if (this.options.backup) {
        await this.createSnapshot('pre-reset-backup');
      }

      // Perform reset based on mode
      switch (this.options.mode) {
        case 'full':
          await this.fullReset();
          break;
        case 'migrations':
          await this.migrationsReset();
          break;
        case 'data':
          await this.dataReset();
          break;
        case 'snapshot':
          if (this.options.restore) {
            await this.restoreSnapshot(this.options.restore);
          } else {
            await this.createSnapshot();
          }
          break;
      }

      console.log('✅ Database reset completed successfully!');
      return true;
    } catch (error) {
      console.error('❌ Database reset failed:', error);
      return false;
    }
  }

  private async ensureSupabase(): Promise<void> {
    try {
      execSync('curl -f http://localhost:54321/health', { stdio: 'ignore' });
      console.log('✅ Supabase is running');
    } catch {
      console.log('🔄 Starting Supabase...');
      execSync('npm run test:supabase:start', { stdio: 'inherit' });

      // Wait for Supabase to be ready
      await this.waitForSupabase();
    }
  }

  private async waitForSupabase(maxAttempts = 30): Promise<void> {
    console.log('⏳ Waiting for Supabase to be ready...');

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

  private async fullReset(): Promise<void> {
    console.log('🔥 Performing full database reset...');

    if (!this.options.force) {
      console.log('⚠️ Full reset requires --force flag for safety');
      throw new Error('Full reset cancelled - use --force to proceed');
    }

    // Step 1: Stop and restart Supabase to clear all data
    console.log('  🛑 Stopping Supabase...');
    execSync('supabase stop', {
      stdio: this.options.verbose ? 'inherit' : 'ignore',
    });

    console.log('  🔄 Starting fresh Supabase instance...');
    execSync('supabase start', {
      stdio: this.options.verbose ? 'inherit' : 'ignore',
    });

    await this.waitForSupabase();

    // Step 2: Apply migrations
    await this.runMigrations();

    // Step 3: Seed data
    await this.seedData();

    console.log('✅ Full reset completed');
  }

  private async migrationsReset(): Promise<void> {
    console.log('📋 Performing migrations reset...');

    // Clean all data first
    await this.executeCommand([
      'tsx',
      'scripts/cleanup-test-data.ts',
      '--mode',
      'full',
      '--force',
    ]);

    // Apply migrations
    await this.runMigrations();

    console.log('✅ Migrations reset completed');
  }

  private async dataReset(): Promise<void> {
    console.log('🗑️ Performing data reset...');

    // Clean existing data
    await this.executeCommand([
      'tsx',
      'scripts/cleanup-test-data.ts',
      '--mode',
      'full',
      '--force',
    ]);

    // Seed fresh data
    await this.seedData();

    console.log('✅ Data reset completed');
  }

  private async runMigrations(): Promise<void> {
    console.log('  📋 Running migrations...');

    execSync('supabase db push', {
      stdio: this.options.verbose ? 'inherit' : 'pipe',
      cwd: ROOT_DIR,
    });

    if (this.options.verbose) {
      console.log('    ✅ Migrations applied');
    }
  }

  private async seedData(): Promise<void> {
    console.log('  🌱 Seeding test data...');

    const strategy = this.options.strategy || 'standard';
    const args = [
      'tsx',
      'scripts/seed-test-data.ts',
      '--strategy',
      strategy,
      '--clean',
    ];

    if (this.options.verbose) {
      args.push('--verbose');
    }

    await this.executeCommand(args);

    if (this.options.verbose) {
      console.log(`    ✅ Test data seeded with ${strategy} strategy`);
    }
  }

  private async createSnapshot(name?: string): Promise<void> {
    const snapshotName = name || `snapshot-${Date.now()}`;
    console.log(`📸 Creating database snapshot: ${snapshotName}`);

    // Ensure snapshot directory exists
    await fs.mkdir(this.snapshotDir, { recursive: true });

    // Create database dump
    const dumpPath = path.join(this.snapshotDir, `${snapshotName}.sql`);

    try {
      // Use pg_dump to create a snapshot
      const dumpCommand = `pg_dump -h localhost -p 54322 -U postgres -d postgres > "${dumpPath}"`;
      execSync(dumpCommand, {
        stdio: this.options.verbose ? 'inherit' : 'ignore',
        env: { ...process.env, PGPASSWORD: 'postgres' },
      });

      // Create metadata file
      const metadata = {
        name: snapshotName,
        timestamp: new Date().toISOString(),
        strategy: this.options.strategy,
        mode: this.options.mode,
      };

      await fs.writeFile(
        path.join(this.snapshotDir, `${snapshotName}.json`),
        JSON.stringify(metadata, null, 2)
      );

      console.log(`✅ Snapshot saved: ${dumpPath}`);
    } catch (error) {
      throw new Error(`Failed to create snapshot: ${error}`);
    }
  }

  private async restoreSnapshot(snapshotName: string): Promise<void> {
    console.log(`📥 Restoring database snapshot: ${snapshotName}`);

    const dumpPath = path.join(this.snapshotDir, `${snapshotName}.sql`);

    try {
      // Verify snapshot exists
      await fs.access(dumpPath);

      // Stop Supabase to ensure clean restore
      console.log('  🛑 Stopping Supabase for clean restore...');
      execSync('supabase stop', {
        stdio: this.options.verbose ? 'inherit' : 'ignore',
      });

      console.log('  🔄 Starting Supabase...');
      execSync('supabase start', {
        stdio: this.options.verbose ? 'inherit' : 'ignore',
      });

      await this.waitForSupabase();

      // Restore from dump
      console.log('  📥 Restoring from snapshot...');
      const restoreCommand = `psql -h localhost -p 54322 -U postgres -d postgres < "${dumpPath}"`;
      execSync(restoreCommand, {
        stdio: this.options.verbose ? 'inherit' : 'ignore',
        env: { ...process.env, PGPASSWORD: 'postgres' },
      });

      console.log(`✅ Snapshot restored: ${snapshotName}`);
    } catch (error) {
      throw new Error(`Failed to restore snapshot: ${error}`);
    }
  }

  private async executeCommand(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const [command, ...cmdArgs] = args;

      if (this.options.verbose) {
        console.log(`    Running: ${args.join(' ')}`);
      }

      const process = spawn(command, cmdArgs, {
        stdio: this.options.verbose ? 'inherit' : 'pipe',
        cwd: ROOT_DIR,
      });

      process.on('close', code => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with exit code ${code}`));
        }
      });

      process.on('error', error => {
        reject(error);
      });
    });
  }

  async listSnapshots(): Promise<void> {
    console.log('📋 Available database snapshots:');

    try {
      const files = await fs.readdir(this.snapshotDir);
      const snapshots = files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));

      if (snapshots.length === 0) {
        console.log('  No snapshots found');
        return;
      }

      for (const snapshot of snapshots) {
        try {
          const metadataPath = path.join(this.snapshotDir, `${snapshot}.json`);
          const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));

          console.log(`  ${snapshot}:`);
          console.log(
            `    Created: ${new Date(metadata.timestamp).toLocaleString()}`
          );
          console.log(`    Strategy: ${metadata.strategy || 'unknown'}`);
          console.log(`    Mode: ${metadata.mode || 'unknown'}`);
        } catch {
          console.log(`  ${snapshot}: (metadata not available)`);
        }
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('  No snapshots directory found');
      } else {
        console.error('  Error reading snapshots:', error);
      }
    }
  }

  async validateDatabase(): Promise<boolean> {
    console.log('🔍 Validating database state...');

    try {
      // Check if Supabase is running
      execSync('curl -f http://localhost:54321/health', { stdio: 'ignore' });
      console.log('  ✅ Supabase is running');

      // Check if migrations are applied
      const migrationCheck = execSync('supabase db diff --check', {
        encoding: 'utf8',
        stdio: 'pipe',
      });

      if (migrationCheck.trim() === '') {
        console.log('  ✅ All migrations are applied');
      } else {
        console.log('  ⚠️ Database schema is not up to date');
        if (this.options.verbose) {
          console.log(`     Diff: ${migrationCheck}`);
        }
        return false;
      }

      // Validate test data using the cleanup script
      await this.executeCommand([
        'tsx',
        'scripts/cleanup-test-data.ts',
        '--mode',
        'verify',
        '--verbose',
      ]);

      console.log('✅ Database validation passed');
      return true;
    } catch (error) {
      console.error('❌ Database validation failed:', error);
      return false;
    }
  }

  getRecommendedStrategy(): string {
    const strategies = {
      minimal: 'Quick tests, single entities',
      standard: 'Integration tests, multiple entities',
      comprehensive: 'Performance tests, large datasets',
    };

    console.log('💡 Recommended seeding strategies:');
    for (const [strategy, description] of Object.entries(strategies)) {
      console.log(`  ${strategy}: ${description}`);
    }

    return 'standard';
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options: ResetOptions = {
    mode: 'full',
    strategy: 'standard',
    verbose: false,
    force: false,
    backup: false,
  };

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--mode':
        options.mode = args[++i] as ResetOptions['mode'];
        break;
      case '--strategy':
        options.strategy = args[++i] as ResetOptions['strategy'];
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--backup':
        options.backup = true;
        break;
      case '--restore':
        options.restore = args[++i];
        break;
      case '--list-snapshots':
        const lister = new TestDatabaseReset(options);
        await lister.listSnapshots();
        process.exit(0);
      case '--validate':
        const validator = new TestDatabaseReset(options);
        const isValid = await validator.validateDatabase();
        process.exit(isValid ? 0 : 1);
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  const resetter = new TestDatabaseReset(options);

  // Show recommended strategy if not specified
  if (!args.includes('--strategy') && options.verbose) {
    resetter.getRecommendedStrategy();
  }

  const success = await resetter.reset();
  process.exit(success ? 0 : 1);
}

function printHelp() {
  console.log(`
Test Database Reset - Complete database reset and snapshot management

Usage: npm run reset:test-db -- [options]

Options:
  --mode <type>         Reset mode: full, migrations, data, snapshot
  --strategy <type>     Data seeding strategy: minimal, standard, comprehensive
  --verbose             Show detailed output
  --force               Required for full reset mode
  --backup              Create backup before reset
  --restore <name>      Restore from snapshot (with snapshot mode)
  --list-snapshots      List available database snapshots
  --validate            Validate current database state
  --help                Show this help

Reset Modes:
  full                  Complete reset: stop/start Supabase, migrations, data (requires --force)
  migrations            Reset to clean state and apply migrations
  data                  Clean all data and reseed
  snapshot              Create or restore database snapshots

Seeding Strategies:
  minimal               Single customer, user, device for basic tests
  standard              Multiple entities with realistic distribution (default)
  comprehensive         Large dataset for performance testing

Examples:
  npm run reset:test-db -- --mode full --force --backup
  npm run reset:test-db -- --mode data --strategy minimal
  npm run reset:test-db -- --mode migrations --verbose
  npm run reset:test-db -- --mode snapshot --restore snapshot-123456
  npm run reset:test-db -- --list-snapshots
  npm run reset:test-db -- --validate

Workflow Integration:
  • Use before running test suites
  • Create snapshots of known good states
  • Restore to specific test scenarios
  • Validate database health

Safety Features:
  • Full reset requires --force flag
  • Automatic backups available
  • Snapshot management
  • Database state validation
`);
}

if (import.meta.url === `file://${__filename}`) {
  main().catch(console.error);
}

export { TestDatabaseReset };
