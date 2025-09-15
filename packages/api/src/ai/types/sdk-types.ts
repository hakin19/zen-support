/* eslint-disable no-undef */
/**
 * Temporary type definitions for Claude Code SDK
 * These will be replaced with actual SDK types in Task 2
 */

// Basic SDK types for development
export type PermissionMode = 'default' | 'plan' | 'acceptEdits';

export interface Options {
  model?: string;
  fallbackModel?: string;
  cwd?: string;
  env?: Record<string, string>;
  allowedTools?: string[];
  disallowedTools?: string[];
  permissionMode?: PermissionMode;
  maxThinkingTokens?: number;
  maxTurns?: number;
  includePartialMessages?: boolean;
  strictMcpConfig?: boolean;
  customSystemPrompt?: string;
  appendSystemPrompt?: string;
  mcpServers?: Record<string, McpServerConfig>;
  canUseTool?: CanUseTool;
}

export interface PermissionResult {
  behavior: 'allow' | 'deny';
  message?: string;
  interrupt?: boolean;
  updatedInput?: unknown;
  updatedPermissions?: unknown;
}

export type CanUseTool = (
  toolName: string,
  input: unknown,
  options: { signal: AbortSignal }
) => Promise<PermissionResult>;

export interface McpServerConfig {
  type?: string;
  name?: string;
  // Additional properties will be defined when implementing
}

export interface CallToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}
