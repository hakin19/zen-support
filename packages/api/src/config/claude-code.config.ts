import { LogLevel } from '@instantlyeasy/claude-code-sdk-ts';

/**
 * Claude Code SDK Configuration
 * Reads from environment variables and provides defaults
 */

export interface ClaudeCodeEnvironmentConfig {
  model: 'sonnet' | 'opus';
  timeout: number;
  defaultRole?: string;
  logLevel: LogLevel;
  skipPermissions: boolean;
  acceptEdits: boolean;
}

/**
 * Parse log level from string
 */
function parseLogLevel(level?: string): LogLevel {
  switch (level?.toLowerCase()) {
    case 'debug':
      return LogLevel.DEBUG;
    case 'info':
      return LogLevel.INFO;
    case 'warn':
      return LogLevel.WARN;
    case 'error':
    default:
      return LogLevel.ERROR;
  }
}

/**
 * Get Claude Code configuration from environment variables
 */
export function getClaudeCodeConfig(): ClaudeCodeEnvironmentConfig {
  return {
    model: (process.env.CLAUDE_CODE_MODEL as 'sonnet' | 'opus') || 'sonnet',
    timeout: parseInt(process.env.CLAUDE_CODE_TIMEOUT || '30000', 10),
    defaultRole: process.env.CLAUDE_CODE_DEFAULT_ROLE,
    logLevel: parseLogLevel(process.env.CLAUDE_CODE_LOG_LEVEL),
    skipPermissions: process.env.CLAUDE_CODE_SKIP_PERMISSIONS === 'true',
    acceptEdits: process.env.CLAUDE_CODE_ACCEPT_EDITS === 'true',
  };
}

/**
 * Validate Claude Code configuration
 */
export function validateClaudeCodeConfig(
  config: ClaudeCodeEnvironmentConfig
): void {
  // Validate model
  if (!['sonnet', 'opus'].includes(config.model)) {
    throw new Error(
      `Invalid CLAUDE_CODE_MODEL: ${config.model}. Must be 'sonnet' or 'opus'.`
    );
  }

  // Validate timeout
  if (config.timeout < 1000 || config.timeout > 600000) {
    throw new Error(
      `Invalid CLAUDE_CODE_TIMEOUT: ${config.timeout}. Must be between 1000 and 600000 milliseconds.`
    );
  }

  // Warn about dangerous settings
  if (config.skipPermissions) {
    console.warn(
      '⚠️  WARNING: CLAUDE_CODE_SKIP_PERMISSIONS is enabled. Claude Code will not ask for permission before using tools.'
    );
  }

  if (config.acceptEdits) {
    console.warn(
      '⚠️  WARNING: CLAUDE_CODE_ACCEPT_EDITS is enabled. Claude Code will automatically accept all file edits.'
    );
  }
}

/**
 * Get default allowed tools based on role
 */
export function getDefaultToolsByRole(role?: string): string[] {
  switch (role) {
    case 'network-engineer':
      return ['Read', 'Grep', 'LS', 'Bash'];
    case 'developer':
      return ['Read', 'Write', 'Edit', 'Grep', 'LS', 'Bash'];
    case 'analyst':
      return ['Read', 'Grep', 'LS'];
    case 'viewer':
      return ['Read', 'LS'];
    default:
      return ['Read', 'Grep', 'LS']; // Safe defaults
  }
}

/**
 * Get denied tools for safety
 */
export function getDeniedTools(): string[] {
  // These tools are potentially dangerous and should be explicitly allowed
  return process.env.NODE_ENV === 'production'
    ? ['WebSearch', 'WebFetch'] // Deny external access in production
    : [];
}
