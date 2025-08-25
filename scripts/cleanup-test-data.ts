#!/usr/bin/env tsx

/**
 * Test Data Cleanup Script
 *
 * Provides comprehensive cleanup capabilities for test data:
 * - Full database cleanup
 * - Selective cleanup by customer/user/device
 * - Transaction-based isolation cleanup
 * - Cleanup verification and reporting
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Supabase connection configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

interface CleanupOptions {
  mode: 'full' | 'selective' | 'transaction' | 'verify';
  tables?: string[];
  customerId?: string;
  dryRun?: boolean;
  verbose?: boolean;
  force?: boolean;
}

interface CleanupReport {
  timestamp: string;
  mode: string;
  tablesProcessed: string[];
  recordsDeleted: Record<string, number>;
  errors: string[];
  duration: number;
}

class TestDataCleaner {
  private supabase;
  private readonly defaultTables = [
    'audit_logs',
    'alerts',
    'network_diagnostics',
    'remediation_actions',
    'diagnostic_sessions',
    'devices',
    'users',
    'customers',
  ];

  constructor(private options: CleanupOptions) {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  async cleanup(): Promise<boolean> {
    const startTime = Date.now();
    console.log(`🧹 Starting ${this.options.mode} cleanup...`);

    if (this.options.dryRun) {
      console.log('🔍 DRY RUN MODE - No data will be deleted\n');
    }

    const report: CleanupReport = {
      timestamp: new Date().toISOString(),
      mode: this.options.mode,
      tablesProcessed: [],
      recordsDeleted: {},
      errors: [],
      duration: 0,
    };

    try {
      switch (this.options.mode) {
        case 'full':
          await this.fullCleanup(report);
          break;
        case 'selective':
          await this.selectiveCleanup(report);
          break;
        case 'transaction':
          await this.transactionCleanup(report);
          break;
        case 'verify':
          await this.verifyCleanup(report);
          break;
      }

      report.duration = Date.now() - startTime;
      await this.generateReport(report);
      this.printSummary(report);

      if (report.errors.length > 0) {
        console.log(
          `\n⚠️ ${report.errors.length} errors occurred during cleanup`
        );
        return false;
      }

      console.log('✅ Cleanup completed successfully!');
      return true;
    } catch (error) {
      console.error('❌ Cleanup failed:', error);
      return false;
    }
  }

  private async fullCleanup(report: CleanupReport): Promise<void> {
    console.log('🗑️ Performing full database cleanup...');

    if (!this.options.force) {
      console.log('⚠️ Full cleanup requires --force flag for safety');
      throw new Error('Full cleanup cancelled - use --force to proceed');
    }

    const tables = this.options.tables || this.defaultTables;

    for (const table of tables) {
      await this.cleanTable(table, report);
    }
  }

  private async selectiveCleanup(report: CleanupReport): Promise<void> {
    console.log('🎯 Performing selective cleanup...');

    if (this.options.customerId) {
      await this.cleanByCustomer(this.options.customerId, report);
    } else if (this.options.tables) {
      for (const table of this.options.tables) {
        await this.cleanTable(table, report);
      }
    } else {
      throw new Error('Selective cleanup requires --customer-id or --tables');
    }
  }

  private async transactionCleanup(report: CleanupReport): Promise<void> {
    console.log('🔄 Performing transaction-based cleanup...');

    // Clean up data created in specific test runs or transactions
    // This would typically use timestamps or test markers
    await this.cleanTestTransactions(report);
  }

  private async verifyCleanup(report: CleanupReport): Promise<void> {
    console.log('🔍 Verifying database cleanliness...');

    const tables = this.options.tables || this.defaultTables;

    for (const table of tables) {
      await this.verifyTableCleanup(table, report);
    }
  }

  private async cleanTable(
    tableName: string,
    report: CleanupReport
  ): Promise<void> {
    try {
      console.log(`  🧽 Cleaning table: ${tableName}`);

      // First, count existing records
      const { count: beforeCount, error: countError } = await this.supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });

      if (countError) {
        report.errors.push(
          `Failed to count ${tableName}: ${countError.message}`
        );
        return;
      }

      if (beforeCount === 0) {
        if (this.options.verbose) {
          console.log(`    ℹ️ Table ${tableName} is already empty`);
        }
        return;
      }

      // Perform deletion if not dry run
      if (!this.options.dryRun) {
        const { error: deleteError } = await this.supabase
          .from(tableName)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all except dummy rows

        if (deleteError) {
          report.errors.push(
            `Failed to clean ${tableName}: ${deleteError.message}`
          );
          return;
        }
      }

      // Record the operation
      report.tablesProcessed.push(tableName);
      report.recordsDeleted[tableName] = beforeCount || 0;

      if (this.options.verbose) {
        console.log(
          `    ✅ ${this.options.dryRun ? 'Would delete' : 'Deleted'} ${beforeCount} records from ${tableName}`
        );
      }
    } catch (error) {
      const errorMessage = `Unexpected error cleaning ${tableName}: ${error}`;
      report.errors.push(errorMessage);
      console.error(`    ❌ ${errorMessage}`);
    }
  }

  private async cleanByCustomer(
    customerId: string,
    report: CleanupReport
  ): Promise<void> {
    console.log(`  👤 Cleaning data for customer: ${customerId}`);

    // Clean in dependency order
    const customerTables = [
      'audit_logs',
      'alerts',
      'network_diagnostics',
      'remediation_actions',
      'diagnostic_sessions',
      'devices',
      'users',
    ];

    for (const table of customerTables) {
      await this.cleanTableByCustomer(table, customerId, report);
    }

    // Finally, clean the customer record itself
    await this.cleanCustomerRecord(customerId, report);
  }

  private async cleanTableByCustomer(
    tableName: string,
    customerId: string,
    report: CleanupReport
  ): Promise<void> {
    try {
      console.log(`    🧽 Cleaning ${tableName} for customer ${customerId}`);

      // Count records for this customer
      const { count: beforeCount, error: countError } = await this.supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true })
        .eq('customer_id', customerId);

      if (countError) {
        // If customer_id column doesn't exist, skip this table
        if (
          countError.message.includes('column "customer_id" does not exist')
        ) {
          if (this.options.verbose) {
            console.log(
              `      ℹ️ Table ${tableName} doesn't have customer_id column, skipping`
            );
          }
          return;
        }
        report.errors.push(
          `Failed to count ${tableName} for customer ${customerId}: ${countError.message}`
        );
        return;
      }

      if (beforeCount === 0) {
        if (this.options.verbose) {
          console.log(
            `      ℹ️ No records found in ${tableName} for customer ${customerId}`
          );
        }
        return;
      }

      // Perform deletion if not dry run
      if (!this.options.dryRun) {
        const { error: deleteError } = await this.supabase
          .from(tableName)
          .delete()
          .eq('customer_id', customerId);

        if (deleteError) {
          report.errors.push(
            `Failed to clean ${tableName} for customer ${customerId}: ${deleteError.message}`
          );
          return;
        }
      }

      // Record the operation
      if (!report.tablesProcessed.includes(tableName)) {
        report.tablesProcessed.push(tableName);
      }
      report.recordsDeleted[`${tableName}_customer_${customerId}`] =
        beforeCount || 0;

      if (this.options.verbose) {
        console.log(
          `      ✅ ${this.options.dryRun ? 'Would delete' : 'Deleted'} ${beforeCount} records from ${tableName}`
        );
      }
    } catch (error) {
      const errorMessage = `Unexpected error cleaning ${tableName} for customer ${customerId}: ${error}`;
      report.errors.push(errorMessage);
      console.error(`      ❌ ${errorMessage}`);
    }
  }

  private async cleanCustomerRecord(
    customerId: string,
    report: CleanupReport
  ): Promise<void> {
    try {
      console.log(`    🧽 Cleaning customer record: ${customerId}`);

      if (!this.options.dryRun) {
        const { error } = await this.supabase
          .from('customers')
          .delete()
          .eq('id', customerId);

        if (error) {
          report.errors.push(
            `Failed to delete customer ${customerId}: ${error.message}`
          );
          return;
        }
      }

      report.recordsDeleted[`customer_${customerId}`] = 1;

      if (this.options.verbose) {
        console.log(
          `      ✅ ${this.options.dryRun ? 'Would delete' : 'Deleted'} customer record`
        );
      }
    } catch (error) {
      const errorMessage = `Unexpected error deleting customer ${customerId}: ${error}`;
      report.errors.push(errorMessage);
      console.error(`      ❌ ${errorMessage}`);
    }
  }

  private async cleanTestTransactions(report: CleanupReport): Promise<void> {
    console.log('  🔄 Cleaning transaction-based test data...');

    // Look for records created in the last hour (typical test run duration)
    const cutoffTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const tables = this.options.tables || this.defaultTables;

    for (const table of tables) {
      await this.cleanRecentRecords(table, cutoffTime, report);
    }
  }

  private async cleanRecentRecords(
    tableName: string,
    cutoffTime: string,
    report: CleanupReport
  ): Promise<void> {
    try {
      console.log(
        `    🧽 Cleaning recent records from ${tableName} (since ${cutoffTime})`
      );

      // Count recent records
      const { count: beforeCount, error: countError } = await this.supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true })
        .gte('created_at', cutoffTime);

      if (countError) {
        // If created_at column doesn't exist, skip this table
        if (countError.message.includes('column "created_at" does not exist')) {
          if (this.options.verbose) {
            console.log(
              `      ℹ️ Table ${tableName} doesn't have created_at column, skipping`
            );
          }
          return;
        }
        report.errors.push(
          `Failed to count recent ${tableName}: ${countError.message}`
        );
        return;
      }

      if (beforeCount === 0) {
        if (this.options.verbose) {
          console.log(`      ℹ️ No recent records found in ${tableName}`);
        }
        return;
      }

      // Perform deletion if not dry run
      if (!this.options.dryRun) {
        const { error: deleteError } = await this.supabase
          .from(tableName)
          .delete()
          .gte('created_at', cutoffTime);

        if (deleteError) {
          report.errors.push(
            `Failed to clean recent ${tableName}: ${deleteError.message}`
          );
          return;
        }
      }

      // Record the operation
      report.tablesProcessed.push(tableName);
      report.recordsDeleted[`${tableName}_recent`] = beforeCount || 0;

      if (this.options.verbose) {
        console.log(
          `      ✅ ${this.options.dryRun ? 'Would delete' : 'Deleted'} ${beforeCount} recent records`
        );
      }
    } catch (error) {
      const errorMessage = `Unexpected error cleaning recent records from ${tableName}: ${error}`;
      report.errors.push(errorMessage);
      console.error(`      ❌ ${errorMessage}`);
    }
  }

  private async verifyTableCleanup(
    tableName: string,
    report: CleanupReport
  ): Promise<void> {
    try {
      console.log(`  🔍 Verifying ${tableName}...`);

      const { count, error } = await this.supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });

      if (error) {
        report.errors.push(`Failed to verify ${tableName}: ${error.message}`);
        return;
      }

      report.tablesProcessed.push(tableName);
      report.recordsDeleted[tableName] = count || 0;

      if (count === 0) {
        console.log(`    ✅ ${tableName} is clean (0 records)`);
      } else {
        console.log(`    ⚠️ ${tableName} contains ${count} records`);
      }
    } catch (error) {
      const errorMessage = `Unexpected error verifying ${tableName}: ${error}`;
      report.errors.push(errorMessage);
      console.error(`    ❌ ${errorMessage}`);
    }
  }

  private async generateReport(report: CleanupReport): Promise<void> {
    const reportPath = path.join(
      ROOT_DIR,
      'test-results',
      'cleanup-report.json'
    );
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    if (this.options.verbose) {
      console.log(`📄 Cleanup report saved to: ${reportPath}`);
    }
  }

  private printSummary(report: CleanupReport): void {
    console.log('\n📊 Cleanup Summary:');
    console.log(`  Mode: ${report.mode}`);
    console.log(`  Duration: ${report.duration}ms`);
    console.log(`  Tables processed: ${report.tablesProcessed.length}`);

    const totalDeleted = Object.values(report.recordsDeleted).reduce(
      (sum, count) => sum + count,
      0
    );
    console.log(
      `  Records ${this.options.dryRun ? 'would be deleted' : 'deleted'}: ${totalDeleted}`
    );

    if (report.errors.length > 0) {
      console.log(`  Errors: ${report.errors.length}`);
    }

    // Show breakdown by table
    if (this.options.verbose && Object.keys(report.recordsDeleted).length > 0) {
      console.log('\n  Breakdown:');
      for (const [key, count] of Object.entries(report.recordsDeleted)) {
        console.log(`    ${key}: ${count} records`);
      }
    }
  }

  async listCustomers(): Promise<void> {
    console.log('📋 Available customers for selective cleanup:');

    const { data: customers, error } = await this.supabase
      .from('customers')
      .select('id, name, email, plan_type, status')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Failed to list customers:', error.message);
      return;
    }

    if (!customers || customers.length === 0) {
      console.log('  No customers found');
      return;
    }

    for (const customer of customers) {
      console.log(
        `  ${customer.id} - ${customer.name} (${customer.email}) - ${customer.plan_type} - ${customer.status}`
      );
    }
  }

  async estimateCleanupSize(): Promise<void> {
    console.log('📊 Estimating cleanup size...');

    const tables = this.options.tables || this.defaultTables;
    let totalRecords = 0;

    for (const table of tables) {
      try {
        const { count, error } = await this.supabase
          .from(table)
          .select('*', { count: 'exact', head: true });

        if (error) {
          console.log(`  ⚠️ ${table}: Error - ${error.message}`);
          continue;
        }

        console.log(`  ${table}: ${count || 0} records`);
        totalRecords += count || 0;
      } catch (error) {
        console.log(`  ⚠️ ${table}: Error - ${error}`);
      }
    }

    console.log(`\nTotal records to clean: ${totalRecords}`);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options: CleanupOptions = {
    mode: 'full',
    dryRun: false,
    verbose: false,
    force: false,
  };

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--mode':
        options.mode = args[++i] as CleanupOptions['mode'];
        break;
      case '--tables':
        options.tables = args[++i].split(',');
        break;
      case '--customer-id':
        options.customerId = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--list-customers':
        const cleaner = new TestDataCleaner(options);
        await cleaner.listCustomers();
        process.exit(0);
      case '--estimate':
        const estimator = new TestDataCleaner(options);
        await estimator.estimateCleanupSize();
        process.exit(0);
      case '--help':
        printHelp();
        process.exit(0);
    }
  }

  const cleaner = new TestDataCleaner(options);
  const success = await cleaner.cleanup();
  process.exit(success ? 0 : 1);
}

function printHelp() {
  console.log(`
Test Data Cleanup - Comprehensive database cleanup utilities

Usage: npm run cleanup:test -- [options]

Options:
  --mode <type>         Cleanup mode: full, selective, transaction, verify
  --tables <list>       Comma-separated list of tables to clean
  --customer-id <id>    Clean data for specific customer (selective mode)
  --dry-run            Show what would be deleted without actually deleting
  --verbose            Show detailed output
  --force              Required for full cleanup mode
  --list-customers     List available customers for selective cleanup
  --estimate           Estimate cleanup size without performing cleanup
  --help               Show this help

Cleanup Modes:
  full                 Clean all test data from all tables (requires --force)
  selective            Clean specific tables or customer data
  transaction          Clean data from recent test transactions
  verify               Verify database cleanliness (count remaining records)

Examples:
  npm run cleanup:test -- --mode full --force --dry-run
  npm run cleanup:test -- --mode selective --customer-id abc-123
  npm run cleanup:test -- --mode selective --tables users,devices
  npm run cleanup:test -- --mode transaction --verbose
  npm run cleanup:test -- --mode verify
  npm run cleanup:test -- --list-customers
  npm run cleanup:test -- --estimate

Safety Features:
  • Full cleanup requires --force flag
  • Dry run mode shows what would be deleted
  • Detailed error reporting and logging
  • Cleanup reports saved to test-results/

Environment Variables:
  SUPABASE_URL         Supabase instance URL (default: http://localhost:54321)
  SUPABASE_SERVICE_KEY Service role key for database access
`);
}

if (import.meta.url === `file://${__filename}`) {
  main().catch(console.error);
}

export { TestDataCleaner };
