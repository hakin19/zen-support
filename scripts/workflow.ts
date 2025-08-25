#!/usr/bin/env tsx

/**
 * Workflow Orchestrator Script
 *
 * Unified CLI for all development tasks with interactive menu,
 * task chaining, and automation for common workflows.
 */

import { execSync, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

interface WorkflowOption {
  name: string;
  value: string;
  description?: string;
}

interface WorkflowTask {
  name: string;
  command: string;
  description: string;
  interactive?: boolean;
}

class WorkflowOrchestrator {
  private readonly workflows: Record<string, WorkflowTask[]> = {
    'quick-start': [
      {
        name: 'Environment Check',
        command: 'npm run env:check',
        description: 'Verify environment is ready',
      },
      {
        name: 'Install Dependencies',
        command: 'npm install',
        description: 'Install all packages',
      },
      {
        name: 'Start Services',
        command: 'npm run test:supabase:start',
        description: 'Start test database',
      },
      {
        name: 'Run Tests',
        command: 'npm test',
        description: 'Verify everything works',
      },
    ],
    'dev-cycle': [
      {
        name: 'Lint & Fix',
        command: 'npm run lint:fix',
        description: 'Fix code style issues',
      },
      {
        name: 'Type Check',
        command: 'npm run type-check',
        description: 'Check TypeScript types',
      },
      {
        name: 'Run Tests',
        command: 'npm test',
        description: 'Run test suite',
      },
      {
        name: 'Coverage Check',
        command: 'npm run quality:check',
        description: 'Verify coverage thresholds',
      },
    ],
    'pre-commit': [
      {
        name: 'Format Code',
        command: 'npm run format',
        description: 'Format all files',
      },
      {
        name: 'Lint Check',
        command: 'npm run lint',
        description: 'Check for lint errors',
      },
      {
        name: 'Type Check',
        command: 'npm run type-check',
        description: 'Validate TypeScript',
      },
      {
        name: 'Test Coverage',
        command: 'npm run test:coverage',
        description: 'Run tests with coverage',
      },
    ],
    'feature-start': [
      {
        name: 'Update Main',
        command: 'git checkout main && git pull',
        description: 'Get latest from main',
      },
      {
        name: 'Create Branch',
        command: 'npm run branch:setup',
        description: 'Create feature branch',
        interactive: true,
      },
      {
        name: 'Environment Check',
        command: 'npm run env:check',
        description: 'Verify environment',
      },
    ],
    'feature-complete': [
      {
        name: 'Run Tests',
        command: 'npm run test:coverage',
        description: 'Verify all tests pass',
      },
      {
        name: 'Quality Gates',
        command: 'npm run quality:check',
        description: 'Check coverage thresholds',
      },
      {
        name: 'Generate Badges',
        command: 'npm run coverage:badge',
        description: 'Update coverage badges',
      },
      {
        name: 'Commit Changes',
        command: 'git add -A && git commit',
        description: 'Commit your work',
        interactive: true,
      },
    ],
    'release-prep': [
      {
        name: 'Pre-release Check',
        command: 'npm run pre-release',
        description: 'Validate release readiness',
      },
      {
        name: 'Build All',
        command: 'npm run build',
        description: 'Build all packages',
      },
      {
        name: 'Generate Docs',
        command: 'npm run docs:generate',
        description: 'Update documentation',
      },
      {
        name: 'Create Changelog',
        command: 'npm run changelog',
        description: 'Generate changelog',
      },
    ],
    troubleshoot: [
      {
        name: 'Environment Health',
        command: 'npm run env:check',
        description: 'Check environment status',
      },
      {
        name: 'Clean Install',
        command: 'rm -rf node_modules && npm install',
        description: 'Reinstall dependencies',
      },
      {
        name: 'Reset Database',
        command: 'npm run test:supabase:reset',
        description: 'Reset test database',
      },
      {
        name: 'Clear Caches',
        command: 'npm run clean:cache',
        description: 'Clear all caches',
      },
    ],
  };

  async run(): Promise<void> {
    console.log(chalk.cyan.bold('\n🚀 Zen Support Workflow Orchestrator\n'));

    while (true) {
      const action = await this.selectAction();

      if (action === 'exit') {
        console.log(chalk.green('\n👋 Goodbye!\n'));
        break;
      }

      if (action === 'custom') {
        await this.runCustomCommand();
      } else {
        await this.runWorkflow(action);
      }

      const { continueWork } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'continueWork',
          message: 'Continue with another workflow?',
          default: true,
        },
      ]);

      if (!continueWork) {
        console.log(chalk.green('\n✨ Great work! See you next time.\n'));
        break;
      }
    }
  }

  private async selectAction(): Promise<string> {
    const choices: WorkflowOption[] = [
      {
        name: '🚀 Quick Start - Set up development environment',
        value: 'quick-start',
      },
      {
        name: '🔄 Dev Cycle - Run lint, type-check, and tests',
        value: 'dev-cycle',
      },
      {
        name: '📝 Pre-commit - Prepare code for commit',
        value: 'pre-commit',
      },
      {
        name: '🌟 Feature Start - Begin new feature development',
        value: 'feature-start',
      },
      {
        name: '✅ Feature Complete - Finish feature development',
        value: 'feature-complete',
      },
      {
        name: '📦 Release Prep - Prepare for release',
        value: 'release-prep',
      },
      {
        name: '🔧 Troubleshoot - Fix common issues',
        value: 'troubleshoot',
      },
      {
        name: '⚙️  Custom Command - Run a custom command',
        value: 'custom',
      },
      {
        name: '🚪 Exit',
        value: 'exit',
      },
    ];

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices,
      },
    ]);

    return action;
  }

  private async runWorkflow(workflowName: string): Promise<void> {
    const workflow = this.workflows[workflowName];

    if (!workflow) {
      console.log(chalk.red(`Unknown workflow: ${workflowName}`));
      return;
    }

    console.log(chalk.blue(`\n📋 Running ${workflowName} workflow...\n`));

    for (const task of workflow) {
      console.log(chalk.yellow(`\n➤ ${task.name}`));
      console.log(chalk.gray(`  ${task.description}`));

      const spinner = ora('Running...').start();

      try {
        if (task.interactive) {
          spinner.stop();
          await this.runInteractiveCommand(task.command);
        } else {
          await this.runCommand(task.command);
          spinner.succeed(chalk.green(`${task.name} completed`));
        }
      } catch (error) {
        spinner.fail(chalk.red(`${task.name} failed`));

        const { shouldContinue } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldContinue',
            message: 'Task failed. Continue with remaining tasks?',
            default: false,
          },
        ]);

        if (!shouldContinue) {
          console.log(chalk.yellow('\n⚠️  Workflow cancelled'));
          break;
        }
      }
    }

    console.log(chalk.green(`\n✅ ${workflowName} workflow completed!\n`));
  }

  private async runCustomCommand(): Promise<void> {
    const { command } = await inquirer.prompt([
      {
        type: 'input',
        name: 'command',
        message: 'Enter command to run:',
        validate: input => input.length > 0 || 'Please enter a command',
      },
    ]);

    const spinner = ora('Running custom command...').start();

    try {
      await this.runCommand(command);
      spinner.succeed(chalk.green('Command completed'));
    } catch (error) {
      spinner.fail(chalk.red('Command failed'));
      console.error(error);
    }
  }

  private runCommand(command: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        execSync(command, {
          cwd: ROOT_DIR,
          stdio: 'pipe',
          encoding: 'utf8',
        });
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  private runInteractiveCommand(command: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command.split(' ');

      const child = spawn(cmd, args, {
        cwd: ROOT_DIR,
        stdio: 'inherit',
        shell: true,
      });

      child.on('close', code => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command exited with code ${code}`));
        }
      });

      child.on('error', reject);
    });
  }

  async showHelp(): void {
    console.log(chalk.cyan.bold('\n📚 Available Workflows:\n'));

    for (const [name, tasks] of Object.entries(this.workflows)) {
      console.log(chalk.yellow(`${name}:`));
      tasks.forEach(task => {
        console.log(`  • ${task.name}: ${task.description}`);
      });
      console.log();
    }

    console.log(chalk.gray('Run without arguments for interactive mode'));
    console.log(
      chalk.gray('Run with --workflow=<name> to execute a specific workflow\n')
    );
  }
}

// CLI interface
async function main() {
  const orchestrator = new WorkflowOrchestrator();

  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    await orchestrator.showHelp();
  } else if (args.some(arg => arg.startsWith('--workflow='))) {
    const workflowArg = args.find(arg => arg.startsWith('--workflow='));
    const workflowName = workflowArg!.split('=')[1];
    await orchestrator.runWorkflow(workflowName);
  } else {
    await orchestrator.run();
  }
}

if (import.meta.url === `file://${__filename}`) {
  main().catch(console.error);
}

export { WorkflowOrchestrator };
