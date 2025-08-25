#!/usr/bin/env tsx

/**
 * Environment Health Check Script
 *
 * Validates that the development environment is properly configured
 * and all required services are running and accessible.
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import Redis from 'ioredis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Load environment variables
dotenv.config({ path: path.join(ROOT_DIR, '.env') });

interface HealthCheckResult {
  component: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  fix?: string;
}

class EnvironmentHealthChecker {
  private results: HealthCheckResult[] = [];
  private hasErrors = false;
  private hasWarnings = false;

  async run(): Promise<boolean> {
    console.log('🏥 Running environment health checks...\n');

    // Run all health checks
    await this.checkNodeVersion();
    await this.checkNpmVersion();
    await this.checkEnvironmentVariables();
    await this.checkSupabaseConnection();
    await this.checkRedisConnection();
    await this.checkDockerServices();
    await this.checkSSLCertificates();
    await this.checkGitConfiguration();
    await this.checkDependencies();
    await this.checkDiskSpace();

    // Print results
    this.printResults();

    return !this.hasErrors;
  }

  private async checkNodeVersion(): Promise<void> {
    try {
      const nodeVersion = process.version;
      const requiredMajor = 20;
      const currentMajor = parseInt(nodeVersion.slice(1).split('.')[0], 10);

      if (currentMajor >= requiredMajor) {
        this.addResult({
          component: 'Node.js',
          status: 'ok',
          message: `Version ${nodeVersion} (>= v${requiredMajor} required)`,
        });
      } else {
        this.addResult({
          component: 'Node.js',
          status: 'error',
          message: `Version ${nodeVersion} is below required v${requiredMajor}`,
          fix: `Install Node.js v${requiredMajor} or higher from https://nodejs.org`,
        });
      }
    } catch (error) {
      this.addResult({
        component: 'Node.js',
        status: 'error',
        message: 'Failed to check Node.js version',
        fix: 'Ensure Node.js is installed',
      });
    }
  }

  private async checkNpmVersion(): Promise<void> {
    try {
      const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
      const requiredMajor = 10;
      const currentMajor = parseInt(npmVersion.split('.')[0], 10);

      if (currentMajor >= requiredMajor) {
        this.addResult({
          component: 'npm',
          status: 'ok',
          message: `Version ${npmVersion} (>= v${requiredMajor} required)`,
        });
      } else {
        this.addResult({
          component: 'npm',
          status: 'warning',
          message: `Version ${npmVersion} is below recommended v${requiredMajor}`,
          fix: 'Run: npm install -g npm@latest',
        });
      }
    } catch (error) {
      this.addResult({
        component: 'npm',
        status: 'error',
        message: 'Failed to check npm version',
        fix: 'Ensure npm is installed',
      });
    }
  }

  private async checkEnvironmentVariables(): Promise<void> {
    const required = [
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_KEY',
      'DATABASE_URL',
      'REDIS_URL',
    ];

    const missing: string[] = [];
    for (const key of required) {
      if (!process.env[key]) {
        missing.push(key);
      }
    }

    if (missing.length === 0) {
      this.addResult({
        component: 'Environment Variables',
        status: 'ok',
        message: 'All required variables are set',
      });
    } else {
      this.addResult({
        component: 'Environment Variables',
        status: 'error',
        message: `Missing: ${missing.join(', ')}`,
        fix: 'Copy .env.example to .env and fill in the values',
      });
    }
  }

  private async checkSupabaseConnection(): Promise<void> {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      this.addResult({
        component: 'Supabase',
        status: 'error',
        message: 'Missing Supabase credentials',
        fix: 'Configure SUPABASE_URL and SUPABASE_ANON_KEY in .env',
      });
      return;
    }

    try {
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
      );

      // Try to fetch a simple query
      const { error } = await supabase
        .from('customers')
        .select('count')
        .limit(1);

      if (error) {
        this.addResult({
          component: 'Supabase',
          status: 'warning',
          message: `Connected but query failed: ${error.message}`,
          fix: 'Check database schema and migrations',
        });
      } else {
        this.addResult({
          component: 'Supabase',
          status: 'ok',
          message: 'Connected and operational',
        });
      }
    } catch (error) {
      this.addResult({
        component: 'Supabase',
        status: 'error',
        message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        fix: 'Check Supabase URL and keys in .env',
      });
    }
  }

  private async checkRedisConnection(): Promise<void> {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    try {
      const redis = new Redis(redisUrl, {
        retryStrategy: () => null,
        maxRetriesPerRequest: 1,
        connectTimeout: 5000,
      });

      await redis.ping();
      await redis.quit();

      this.addResult({
        component: 'Redis',
        status: 'ok',
        message: 'Connected and operational',
      });
    } catch (error) {
      this.addResult({
        component: 'Redis',
        status: 'warning',
        message: 'Not running or not accessible',
        fix: 'Run: docker-compose up -d redis',
      });
    }
  }

  private async checkDockerServices(): Promise<void> {
    try {
      const dockerVersion = execSync('docker --version', {
        encoding: 'utf8',
      }).trim();

      // Check if Docker daemon is running
      try {
        execSync('docker ps', { encoding: 'utf8' });
        this.addResult({
          component: 'Docker',
          status: 'ok',
          message: dockerVersion,
        });
      } catch {
        this.addResult({
          component: 'Docker',
          status: 'warning',
          message: 'Docker installed but daemon not running',
          fix: 'Start Docker Desktop or Docker daemon',
        });
      }
    } catch (error) {
      this.addResult({
        component: 'Docker',
        status: 'warning',
        message: 'Not installed or not in PATH',
        fix: 'Install Docker from https://docker.com',
      });
    }
  }

  private async checkSSLCertificates(): Promise<void> {
    const certsDir = path.join(ROOT_DIR, 'certs');

    try {
      await fs.access(certsDir);
      const files = await fs.readdir(certsDir);

      const hasCert = files.some(f => f.endsWith('.crt') || f.endsWith('.pem'));
      const hasKey = files.some(f => f.endsWith('.key'));

      if (hasCert && hasKey) {
        this.addResult({
          component: 'SSL Certificates',
          status: 'ok',
          message: 'Local certificates found',
        });
      } else {
        this.addResult({
          component: 'SSL Certificates',
          status: 'warning',
          message: 'SSL certificates not found',
          fix: 'Run: npm run ssl:setup',
        });
      }
    } catch {
      this.addResult({
        component: 'SSL Certificates',
        status: 'warning',
        message: 'Certificates directory not found',
        fix: 'Run: npm run ssl:setup',
      });
    }
  }

  private async checkGitConfiguration(): Promise<void> {
    try {
      const gitUser = execSync('git config user.name', {
        encoding: 'utf8',
      }).trim();
      const gitEmail = execSync('git config user.email', {
        encoding: 'utf8',
      }).trim();

      if (gitUser && gitEmail) {
        this.addResult({
          component: 'Git',
          status: 'ok',
          message: `Configured as ${gitUser} <${gitEmail}>`,
        });
      } else {
        this.addResult({
          component: 'Git',
          status: 'warning',
          message: 'User name or email not configured',
          fix: 'Run: git config --global user.name "Your Name" && git config --global user.email "your@email.com"',
        });
      }
    } catch {
      this.addResult({
        component: 'Git',
        status: 'error',
        message: 'Git not installed or not in PATH',
        fix: 'Install Git from https://git-scm.com',
      });
    }
  }

  private async checkDependencies(): Promise<void> {
    try {
      // Check if node_modules exists
      await fs.access(path.join(ROOT_DIR, 'node_modules'));

      // Check for outdated packages
      try {
        const outdated = execSync('npm outdated --json', { encoding: 'utf8' });
        const packages = JSON.parse(outdated || '{}');
        const count = Object.keys(packages).length;

        if (count === 0) {
          this.addResult({
            component: 'Dependencies',
            status: 'ok',
            message: 'All packages up to date',
          });
        } else {
          this.addResult({
            component: 'Dependencies',
            status: 'warning',
            message: `${count} outdated package(s)`,
            fix: 'Run: npm update',
          });
        }
      } catch {
        // npm outdated returns non-zero exit code when packages are outdated
        this.addResult({
          component: 'Dependencies',
          status: 'ok',
          message: 'Dependencies installed',
        });
      }
    } catch {
      this.addResult({
        component: 'Dependencies',
        status: 'error',
        message: 'node_modules not found',
        fix: 'Run: npm install',
      });
    }
  }

  private async checkDiskSpace(): Promise<void> {
    try {
      const output = execSync('df -h .', { encoding: 'utf8' });
      const lines = output.trim().split('\n');

      if (lines.length >= 2) {
        const parts = lines[1].split(/\s+/);
        const usagePercent = parseInt(parts[4].replace('%', ''), 10);

        if (usagePercent < 80) {
          this.addResult({
            component: 'Disk Space',
            status: 'ok',
            message: `${100 - usagePercent}% free`,
          });
        } else if (usagePercent < 90) {
          this.addResult({
            component: 'Disk Space',
            status: 'warning',
            message: `Only ${100 - usagePercent}% free`,
            fix: 'Consider freeing up disk space',
          });
        } else {
          this.addResult({
            component: 'Disk Space',
            status: 'error',
            message: `Critical: Only ${100 - usagePercent}% free`,
            fix: 'Free up disk space immediately',
          });
        }
      }
    } catch {
      // Skip disk space check on Windows or if df command fails
      this.addResult({
        component: 'Disk Space',
        status: 'ok',
        message: 'Check skipped',
      });
    }
  }

  private addResult(result: HealthCheckResult): void {
    this.results.push(result);
    if (result.status === 'error') {
      this.hasErrors = true;
    } else if (result.status === 'warning') {
      this.hasWarnings = true;
    }
  }

  private printResults(): void {
    console.log('📋 Health Check Results:\n');

    // Group results by status
    const okResults = this.results.filter(r => r.status === 'ok');
    const warningResults = this.results.filter(r => r.status === 'warning');
    const errorResults = this.results.filter(r => r.status === 'error');

    // Print OK results
    if (okResults.length > 0) {
      console.log('✅ Healthy Components:');
      okResults.forEach(r => {
        console.log(`   ${r.component}: ${r.message}`);
      });
      console.log();
    }

    // Print warnings
    if (warningResults.length > 0) {
      console.log('⚠️  Warnings:');
      warningResults.forEach(r => {
        console.log(`   ${r.component}: ${r.message}`);
        if (r.fix) {
          console.log(`      Fix: ${r.fix}`);
        }
      });
      console.log();
    }

    // Print errors
    if (errorResults.length > 0) {
      console.log('❌ Errors:');
      errorResults.forEach(r => {
        console.log(`   ${r.component}: ${r.message}`);
        if (r.fix) {
          console.log(`      Fix: ${r.fix}`);
        }
      });
      console.log();
    }

    // Print summary
    if (this.hasErrors) {
      console.log('🚨 Environment has critical issues that need to be fixed!');
    } else if (this.hasWarnings) {
      console.log(
        '⚠️  Environment is functional but has some warnings to address.'
      );
    } else {
      console.log('✅ Environment is healthy and ready for development!');
    }
  }
}

// CLI interface
async function main() {
  const checker = new EnvironmentHealthChecker();
  const success = await checker.run();
  process.exit(success ? 0 : 1);
}

if (import.meta.url === `file://${__filename}`) {
  main().catch(console.error);
}

export { EnvironmentHealthChecker };
