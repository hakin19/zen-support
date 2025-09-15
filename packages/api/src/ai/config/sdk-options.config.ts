/**
 * Claude Code SDK Options Configuration
 * Defines the SDK configuration with safety-first defaults for the Aizen vNE system
 */

// TODO: Install @anthropic/claude-code-sdk in Task 2
// import type {
//   Options,
//   PermissionMode,
//   CanUseTool,
//   PermissionResult,
//   McpServerConfig,
// } from '../types/sdk-types';

// Use official SDK types to avoid mismatch with orchestrator
import type {
  Options,
  PermissionMode,
  CanUseTool,
  PermissionResult,
  McpServerConfig,
} from '@anthropic-ai/claude-code';

/**
 * Enhanced SDK Options with safety and security controls
 */
export interface AizenSDKOptions extends Partial<Options> {
  // Safety controls
  safetyMode: 'strict' | 'standard' | 'relaxed';
  requireHITL: boolean; // Human-in-the-loop requirement
  maxExecutionTime: number; // Maximum time for AI operations

  // Network-specific settings
  networkContext?: {
    deviceId: string;
    deviceType: string;
    customerTier: 'trial' | 'standard' | 'premium';
    allowedOperations: NetworkOperation[];
  };

  // Audit and compliance
  auditMode: boolean;
  complianceLevel?: 'none' | 'basic' | 'hipaa' | 'pci' | 'sox';

  // Custom safety policies
  safetyPolicies?: SafetyPolicy[];
}

/**
 * Network operations that can be performed
 */
export type NetworkOperation =
  | 'read-only'
  | 'diagnostic'
  | 'configuration-read'
  | 'configuration-write'
  | 'restart-service'
  | 'restart-device'
  | 'firmware-update'
  | 'security-scan'
  | 'traffic-analysis';

/**
 * Safety policy definition
 */
export interface SafetyPolicy {
  id: string;
  name: string;
  description: string;
  rules: SafetyRule[];
  priority: number;
  enabled: boolean;
}

/**
 * Individual safety rule
 */
export interface SafetyRule {
  type: 'allow' | 'deny' | 'require-approval';
  condition: {
    toolName?: string;
    toolPattern?: RegExp;
    inputPattern?: RegExp;
    riskLevel?: 'low' | 'medium' | 'high';
  };
  message?: string;
  requireMFA?: boolean;
}

/**
 * Tool permission configuration
 */
export interface ToolPermissionConfig {
  toolName: string;
  alwaysAllow: boolean;
  alwaysDeny: boolean;
  requireApproval: boolean;
  approvalTimeout: number;
  riskLevel: 'low' | 'medium' | 'high';
  auditLog: boolean;
}

/**
 * Default safety configurations by mode
 */
export const SAFETY_PRESETS = {
  strict: {
    allowedTools: ['Read', 'Glob', 'Grep'],
    disallowedTools: [
      'Bash',
      'Write',
      'Edit',
      'MultiEdit',
      'NotebookEdit',
      'WebFetch',
      'WebSearch',
    ],
    permissionMode: 'default' as PermissionMode,
    maxThinkingTokens: 50000,
    maxTurns: 10,
    requireHITL: true,
    auditMode: true,
  },
  standard: {
    allowedTools: ['Read', 'Glob', 'Grep', 'Bash', 'Write', 'Edit'],
    disallowedTools: ['WebFetch', 'WebSearch'],
    permissionMode: 'default' as PermissionMode,
    maxThinkingTokens: 100000,
    maxTurns: 20,
    requireHITL: true,
    auditMode: true,
  },
  relaxed: {
    allowedTools: undefined, // All tools allowed
    disallowedTools: [],
    permissionMode: 'acceptEdits' as PermissionMode,
    maxThinkingTokens: 150000,
    maxTurns: 30,
    requireHITL: false,
    auditMode: false,
  },
};

/**
 * Tool risk categorization for network operations
 */
export const TOOL_RISK_LEVELS: Record<string, ToolPermissionConfig> = {
  // Read-only tools - Low risk
  Read: {
    toolName: 'Read',
    alwaysAllow: true,
    alwaysDeny: false,
    requireApproval: false,
    approvalTimeout: 0,
    riskLevel: 'low',
    auditLog: false,
  },
  Glob: {
    toolName: 'Glob',
    alwaysAllow: true,
    alwaysDeny: false,
    requireApproval: false,
    approvalTimeout: 0,
    riskLevel: 'low',
    auditLog: false,
  },
  Grep: {
    toolName: 'Grep',
    alwaysAllow: true,
    alwaysDeny: false,
    requireApproval: false,
    approvalTimeout: 0,
    riskLevel: 'low',
    auditLog: false,
  },

  // Diagnostic tools - Medium risk
  Bash: {
    toolName: 'Bash',
    alwaysAllow: false,
    alwaysDeny: false,
    requireApproval: true,
    approvalTimeout: 30000,
    riskLevel: 'medium',
    auditLog: true,
  },

  // Modification tools - High risk
  Write: {
    toolName: 'Write',
    alwaysAllow: false,
    alwaysDeny: false,
    requireApproval: true,
    approvalTimeout: 60000,
    riskLevel: 'high',
    auditLog: true,
  },
  Edit: {
    toolName: 'Edit',
    alwaysAllow: false,
    alwaysDeny: false,
    requireApproval: true,
    approvalTimeout: 60000,
    riskLevel: 'high',
    auditLog: true,
  },
  MultiEdit: {
    toolName: 'MultiEdit',
    alwaysAllow: false,
    alwaysDeny: false,
    requireApproval: true,
    approvalTimeout: 60000,
    riskLevel: 'high',
    auditLog: true,
  },

  // External access tools - High risk (usually denied)
  WebFetch: {
    toolName: 'WebFetch',
    alwaysAllow: false,
    alwaysDeny: true,
    requireApproval: false,
    approvalTimeout: 0,
    riskLevel: 'high',
    auditLog: true,
  },
  WebSearch: {
    toolName: 'WebSearch',
    alwaysAllow: false,
    alwaysDeny: true,
    requireApproval: false,
    approvalTimeout: 0,
    riskLevel: 'high',
    auditLog: true,
  },
};

/**
 * Default SDK Options factory
 */
export class SDKOptionsFactory {
  /**
   * Create SDK options with safety defaults
   */
  static createDefaultOptions(
    mode: 'strict' | 'standard' | 'relaxed' = 'standard'
  ): Partial<Options> {
    const preset = SAFETY_PRESETS[mode];

    return {
      model: process.env.CLAUDE_MODEL ?? 'claude-3-5-sonnet-20241022',
      fallbackModel: 'claude-3-5-haiku-20241022',
      cwd: process.cwd(),
      env: this.getSanitizedEnv(),
      allowedTools: preset.allowedTools,
      disallowedTools: preset.disallowedTools,
      permissionMode: preset.permissionMode,
      maxThinkingTokens: preset.maxThinkingTokens,
      maxTurns: preset.maxTurns,
      includePartialMessages: false,
      strictMcpConfig: true,
      customSystemPrompt: this.getSystemPrompt(mode),
      appendSystemPrompt: this.getAppendedSystemPrompt(),
    };
  }

  /**
   * Create options for network diagnostics
   */
  static createDiagnosticOptions(): Partial<Options> {
    return {
      ...this.createDefaultOptions('standard'),
      allowedTools: ['Read', 'Glob', 'Grep', 'Bash'],
      disallowedTools: ['Write', 'Edit', 'MultiEdit', 'WebFetch', 'WebSearch'],
      maxTurns: 15,
      appendSystemPrompt: `
You are analyzing network diagnostic data. Focus on:
1. Identifying root causes of network issues
2. Providing actionable remediation steps
3. Prioritizing fixes by impact and risk
4. Ensuring all recommendations are safe and reversible
Never modify configuration files directly during diagnostics.`,
    };
  }

  /**
   * Create options for remediation scripts
   */
  static createRemediationOptions(): Partial<Options> {
    return {
      ...this.createDefaultOptions('strict'),
      allowedTools: ['Read', 'Write', 'Edit'],
      // Override disallowedTools to remove conflict with allowedTools
      disallowedTools: [
        'Bash',
        'MultiEdit',
        'NotebookEdit',
        'WebFetch',
        'WebSearch',
      ],
      maxTurns: 10,
      appendSystemPrompt: `
You are generating remediation scripts for network devices. Requirements:
1. All scripts must include rollback procedures
2. Validate preconditions before making changes
3. Log all actions for audit purposes
4. Test changes incrementally
5. Never disable security features
6. Always preserve existing configurations as backup`,
    };
  }

  /**
   * Create canUseTool permission handler
   */
  static createPermissionHandler(
    approvalCallback: (
      tool: string,
      input: unknown,
      signal?: AbortSignal
    ) => Promise<boolean>
  ): CanUseTool {
    return async (
      toolName: string,
      input: unknown,
      options: { signal: AbortSignal }
    ): Promise<PermissionResult> => {
      // Get tool configuration
      const toolConfig = TOOL_RISK_LEVELS[toolName];

      if (!toolConfig) {
        // Unknown tool - deny by default
        return {
          behavior: 'deny',
          message: `Unknown tool: ${toolName}. Access denied for safety.`,
        } as unknown as PermissionResult;
      }

      // Check if always allowed
      if (toolConfig.alwaysAllow) {
        return {
          behavior: 'allow',
          updatedInput: input,
        } as unknown as PermissionResult;
      }

      // Check if always denied
      if (toolConfig.alwaysDeny) {
        return {
          behavior: 'deny',
          message: `Tool ${toolName} is not allowed in the current safety mode.`,
        } as unknown as PermissionResult;
      }

      // Require approval for medium/high risk tools
      if (toolConfig.requireApproval) {
        try {
          const approved = await approvalCallback(
            toolName,
            input,
            options.signal
          );

          if (approved) {
            // Log the approval
            console.log(`[AUDIT] Tool ${toolName} approved for use`, {
              tool: toolName,
              riskLevel: toolConfig.riskLevel,
              timestamp: new Date().toISOString(),
            });

            return {
              behavior: 'allow',
              updatedInput: input,
            } as unknown as PermissionResult;
          } else {
            return {
              behavior: 'deny',
              message: `User denied permission for ${toolName}`,
            } as unknown as PermissionResult;
          }
        } catch (error) {
          return {
            behavior: 'deny',
            message: `Approval timeout or error for ${toolName}`,
          } as unknown as PermissionResult;
        }
      }

      // Default allow for unspecified cases
      return {
        behavior: 'allow',
        updatedInput: input,
      } as unknown as PermissionResult;
    };
  }

  /**
   * Get sanitized environment variables
   */
  private static getSanitizedEnv(): Record<string, string> {
    const sanitized: Record<string, string> = {};
    const allowedEnvVars = [
      'NODE_ENV',
      'PORT',
      'API_URL',
      'LOG_LEVEL',
      // Add other safe environment variables
    ];

    for (const key of allowedEnvVars) {
      if (process.env[key]) {
        sanitized[key] = process.env[key]!;
      }
    }

    return sanitized;
  }

  /**
   * Get base system prompt
   */
  private static getSystemPrompt(
    mode: 'strict' | 'standard' | 'relaxed'
  ): string {
    const basePrompt = `You are an AI-powered Virtual Network Engineer (vNE) for the Zen & Zen Network Support system.
Your primary goal is to help diagnose and resolve network issues safely and efficiently.

Operating Mode: ${mode.toUpperCase()}

Core Principles:
1. Safety First: Never make changes that could cause network outages
2. Audit Everything: All actions must be logged and traceable
3. Verify Before Acting: Always validate preconditions
4. Rollback Ready: Every change must have a rollback plan
5. Human-in-the-Loop: Require approval for high-risk operations`;

    const modeSpecific = {
      strict: `
STRICT MODE RESTRICTIONS:
- Read-only operations only
- No configuration changes allowed
- No external network access
- Maximum security and safety`,
      standard: `
STANDARD MODE GUIDELINES:
- Diagnostic and safe remediation allowed
- Configuration changes require approval
- External access restricted
- Balanced safety and functionality`,
      relaxed: `
RELAXED MODE PERMISSIONS:
- Full diagnostic and remediation capabilities
- Automated approvals for common operations
- Use with caution and proper authorization`,
    };

    return basePrompt + modeSpecific[mode];
  }

  /**
   * Get appended system prompt
   */
  private static getAppendedSystemPrompt(): string {
    return `
Network Expertise Areas:
- Layer 2/3 troubleshooting (switching, routing, VLANs)
- TCP/IP stack analysis
- DNS and DHCP diagnostics
- Firewall and security policies
- Performance optimization
- Wireless network issues
- VPN connectivity
- Load balancing and redundancy

When analyzing issues:
1. Start with basic connectivity tests
2. Gather comprehensive diagnostic data
3. Analyze patterns and correlations
4. Identify root cause, not just symptoms
5. Provide clear, actionable recommendations
6. Include verification steps

Remember: You are working on production networks. Every action matters.`;
  }

  /**
   * Create MCP server configuration for network tools
   */
  static createMcpServerConfig(): Record<string, McpServerConfig> {
    return {
      'network-tools': {
        type: 'sdk',
        name: 'network-tools',
        // Instance will be created with actual MCP tools
      } as McpServerConfig,
    };
  }

  /**
   * Validate SDK options
   */
  static validateOptions(options: Partial<Options>): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Validate model
    if (options.model && !options.model.includes('claude')) {
      errors.push('Model must be a Claude model');
    }

    // Validate max tokens
    if (options.maxThinkingTokens && options.maxThinkingTokens > 200000) {
      errors.push('maxThinkingTokens exceeds safe limit of 200000');
    }

    // Validate max turns
    if (options.maxTurns && options.maxTurns > 50) {
      errors.push('maxTurns exceeds safe limit of 50');
    }

    // Check for conflicting tool configurations
    if (options.allowedTools && options.disallowedTools) {
      const overlap = options.allowedTools.filter(tool =>
        options.disallowedTools!.includes(tool)
      );
      if (overlap.length > 0) {
        errors.push(
          `Tools cannot be both allowed and disallowed: ${overlap.join(', ')}`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

/**
 * Environment-based configuration
 */
export function getEnvironmentSDKOptions(): Partial<Options> {
  const env = process.env.NODE_ENV ?? 'development';

  switch (env) {
    case 'production':
      return SDKOptionsFactory.createDefaultOptions('strict');
    case 'staging':
      return SDKOptionsFactory.createDefaultOptions('standard');
    case 'development':
      return SDKOptionsFactory.createDefaultOptions('relaxed');
    default:
      return SDKOptionsFactory.createDefaultOptions('standard');
  }
}

/**
 * Export types for use in other modules
 */
export type {
  Options,
  PermissionMode,
  CanUseTool,
  PermissionResult,
  McpServerConfig,
};
