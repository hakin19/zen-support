/**
 * MCP Tool Definitions for Network Operations
 * Uses Zod for runtime type validation and safety
 */

import { z } from 'zod';

// TODO: Install @anthropic/claude-code-sdk in Task 2
import type { CallToolResult } from '../types/sdk-types';

/**
 * Base schema for all network MCP tools
 */
const BaseToolInputSchema = z.object({
  deviceId: z.string().min(1).describe('Target device identifier'),
  sessionId: z.string().uuid().describe('Diagnostic session ID'),
  correlationId: z.string().uuid().describe('Request correlation ID'),
  timestamp: z.string().datetime().describe('Request timestamp'),
});

/**
 * Custom validation patterns for network data
 */
const IPAddressSchema = z
  .string()
  .regex(
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
    'Must be a valid IP address'
  );

const URLSchema = z.string().url();

/**
 * Network Diagnostic Tool Schemas
 */

// Ping test tool
export const PingTestSchema = BaseToolInputSchema.extend({
  target: z.union([IPAddressSchema, URLSchema]).describe('Target host or IP'),
  count: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(4)
    .describe('Number of pings'),
  packetSize: z
    .number()
    .int()
    .min(56)
    .max(65507)
    .default(56)
    .describe('Packet size in bytes'),
  timeout: z
    .number()
    .int()
    .min(1)
    .max(60)
    .default(5)
    .describe('Timeout in seconds'),
  interval: z
    .number()
    .min(0.2)
    .max(10)
    .default(1)
    .describe('Interval between pings'),
});

export type PingTestInput = z.infer<typeof PingTestSchema>;

// Traceroute tool
export const TracerouteSchema = BaseToolInputSchema.extend({
  target: z.union([IPAddressSchema, URLSchema]).describe('Target host or IP'),
  maxHops: z.number().int().min(1).max(64).default(30).describe('Maximum hops'),
  timeout: z
    .number()
    .int()
    .min(1)
    .max(60)
    .default(5)
    .describe('Timeout per hop'),
  protocol: z
    .enum(['icmp', 'udp', 'tcp'])
    .default('icmp')
    .describe('Protocol to use'),
  port: z
    .number()
    .int()
    .min(1)
    .max(65535)
    .optional()
    .describe('Port for TCP/UDP'),
});

export type TracerouteInput = z.infer<typeof TracerouteSchema>;

// Port scan tool
export const PortScanSchema = BaseToolInputSchema.extend({
  target: IPAddressSchema.describe('Target IP address'),
  ports: z
    .array(z.number().int().min(1).max(65535))
    .or(
      z.object({
        start: z.number().int().min(1).max(65535),
        end: z.number().int().min(1).max(65535),
      })
    )
    .describe('Ports to scan'),
  protocol: z
    .enum(['tcp', 'udp', 'both'])
    .default('tcp')
    .describe('Protocol to scan'),
  timeout: z
    .number()
    .int()
    .min(100)
    .max(5000)
    .default(1000)
    .describe('Timeout per port (ms)'),
  rateLimit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(100)
    .describe('Max concurrent scans'),
});

export type PortScanInput = z.infer<typeof PortScanSchema>;

// DNS query tool
export const DnsQuerySchema = BaseToolInputSchema.extend({
  domain: z.string().min(1).describe('Domain to query'),
  queryType: z
    .enum(['A', 'AAAA', 'CNAME', 'MX', 'NS', 'PTR', 'SOA', 'TXT', 'ANY'])
    .default('A')
    .describe('DNS query type'),
  nameserver: IPAddressSchema.optional().describe('Specific nameserver to use'),
  timeout: z.number().int().min(1).max(30).default(5).describe('Query timeout'),
});

export type DnsQueryInput = z.infer<typeof DnsQuerySchema>;

// Interface status tool
export const InterfaceStatusSchema = BaseToolInputSchema.extend({
  interfaceName: z.string().optional().describe('Specific interface or all'),
  includeStatistics: z
    .boolean()
    .default(true)
    .describe('Include traffic statistics'),
  includeErrors: z.boolean().default(true).describe('Include error counters'),
});

export type InterfaceStatusInput = z.infer<typeof InterfaceStatusSchema>;

/**
 * Script Generation Tool Schemas
 */

// Script generator tool
export const ScriptGeneratorSchema = BaseToolInputSchema.extend({
  scriptType: z
    .enum([
      'diagnostic',
      'configuration',
      'remediation',
      'backup',
      'restore',
      'monitoring',
    ])
    .describe('Type of script to generate'),
  targetPlatform: z
    .enum(['linux', 'windows', 'macos', 'cisco-ios', 'juniper', 'mikrotik'])
    .describe('Target platform'),
  actions: z
    .array(
      z.object({
        action: z.string().describe('Action to perform'),
        parameters: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('Action parameters'),
        validation: z.string().optional().describe('Validation command'),
      })
    )
    .describe('List of actions to include'),
  safetyChecks: z
    .object({
      preConditions: z.array(z.string()).describe('Pre-execution checks'),
      postConditions: z.array(z.string()).describe('Post-execution validation'),
      rollbackScript: z.string().optional().describe('Rollback commands'),
    })
    .describe('Safety validations'),
  constraints: z
    .object({
      maxExecutionTime: z
        .number()
        .int()
        .min(1)
        .max(3600)
        .describe('Max runtime in seconds'),
      requireConfirmation: z
        .boolean()
        .default(true)
        .describe('Require user confirmation'),
      dryRun: z.boolean().default(false).describe('Generate dry-run version'),
    })
    .describe('Execution constraints'),
});

export type ScriptGeneratorInput = z.infer<typeof ScriptGeneratorSchema>;

// Script validator tool
export const ScriptValidatorSchema = BaseToolInputSchema.extend({
  script: z.string().min(1).describe('Script content to validate'),
  platform: z
    .enum(['linux', 'windows', 'macos', 'cisco-ios', 'juniper', 'mikrotik'])
    .describe('Target platform'),
  validationRules: z
    .array(
      z.enum([
        'syntax',
        'dangerous-commands',
        'network-impact',
        'security-risks',
        'best-practices',
        'idempotency',
      ])
    )
    .default(['syntax', 'dangerous-commands', 'security-risks'])
    .describe('Validation rules to apply'),
  riskTolerance: z
    .enum(['none', 'low', 'medium', 'high'])
    .default('low')
    .describe('Acceptable risk level'),
});

export type ScriptValidatorInput = z.infer<typeof ScriptValidatorSchema>;

/**
 * Configuration Management Tool Schemas
 */

// Configuration backup tool
export const ConfigBackupSchema = BaseToolInputSchema.extend({
  backupType: z
    .enum(['full', 'incremental', 'selective'])
    .describe('Type of backup'),
  includePasswords: z
    .boolean()
    .default(false)
    .describe('Include sensitive data'),
  compression: z.boolean().default(true).describe('Compress backup'),
  encryption: z
    .object({
      enabled: z.boolean(),
      algorithm: z.enum(['aes256', 'aes128', 'none']).optional(),
      keyId: z.string().uuid().optional(),
    })
    .default({ enabled: true, algorithm: 'aes256' })
    .describe('Encryption settings'),
  retention: z
    .object({
      days: z.number().int().min(1).max(365),
      count: z.number().int().min(1).max(100),
    })
    .describe('Retention policy'),
});

export type ConfigBackupInput = z.infer<typeof ConfigBackupSchema>;

// Configuration compare tool
export const ConfigCompareSchema = BaseToolInputSchema.extend({
  source: z.string().describe('Source configuration'),
  target: z.string().describe('Target configuration'),
  ignoreComments: z.boolean().default(true).describe('Ignore comment lines'),
  ignoreWhitespace: z
    .boolean()
    .default(true)
    .describe('Ignore whitespace differences'),
  contextLines: z
    .number()
    .int()
    .min(0)
    .max(10)
    .default(3)
    .describe('Context lines in diff'),
  outputFormat: z.enum(['unified', 'side-by-side', 'json']).default('unified'),
});

export type ConfigCompareInput = z.infer<typeof ConfigCompareSchema>;

/**
 * Remediation Tool Schemas
 */

// Service restart tool
export const ServiceRestartSchema = BaseToolInputSchema.extend({
  serviceName: z.string().min(1).describe('Service to restart'),
  graceful: z.boolean().default(true).describe('Graceful restart'),
  timeout: z
    .number()
    .int()
    .min(1)
    .max(300)
    .default(60)
    .describe('Restart timeout'),
  healthCheck: z
    .object({
      enabled: z.boolean().default(true),
      endpoint: z.string().url().optional(),
      expectedStatus: z.number().int().min(100).max(599).optional(),
      retries: z.number().int().min(1).max(10).default(3),
    })
    .optional()
    .describe('Post-restart health check'),
  notification: z
    .object({
      enabled: z.boolean().default(true),
      channels: z.array(z.enum(['email', 'sms', 'slack', 'webhook'])),
      message: z.string().optional(),
    })
    .optional()
    .describe('Notification settings'),
});

export type ServiceRestartInput = z.infer<typeof ServiceRestartSchema>;

// Firewall rule tool
export const FirewallRuleSchema = BaseToolInputSchema.extend({
  action: z.enum(['add', 'remove', 'modify', 'list']).describe('Rule action'),
  rule: z
    .object({
      id: z.string().optional(),
      name: z.string(),
      direction: z.enum(['inbound', 'outbound', 'both']),
      protocol: z.enum(['tcp', 'udp', 'icmp', 'any']),
      sourceIp: z.union([IPAddressSchema, z.literal('any')]),
      sourcePorts: z.array(z.number().int().min(1).max(65535)).optional(),
      destinationIp: z.union([IPAddressSchema, z.literal('any')]),
      destinationPorts: z.array(z.number().int().min(1).max(65535)).optional(),
      action: z.enum(['allow', 'deny', 'reject']),
      priority: z.number().int().min(1).max(65535).optional(),
      enabled: z.boolean().default(true),
    })
    .optional()
    .describe('Firewall rule definition'),
  validation: z
    .boolean()
    .default(true)
    .describe('Validate rule before applying'),
  testConnection: z
    .object({
      enabled: z.boolean().default(true),
      target: IPAddressSchema.optional(),
      port: z.number().int().min(1).max(65535).optional(),
    })
    .optional()
    .describe('Test connectivity after rule change'),
});

export type FirewallRuleInput = z.infer<typeof FirewallRuleSchema>;

/**
 * Monitoring Tool Schemas
 */

// Performance monitor tool
export const PerformanceMonitorSchema = BaseToolInputSchema.extend({
  metrics: z
    .array(
      z.enum([
        'cpu',
        'memory',
        'disk',
        'network',
        'bandwidth',
        'latency',
        'packet-loss',
        'connections',
      ])
    )
    .describe('Metrics to monitor'),
  duration: z
    .number()
    .int()
    .min(1)
    .max(3600)
    .default(60)
    .describe('Monitoring duration'),
  interval: z
    .number()
    .int()
    .min(1)
    .max(60)
    .default(5)
    .describe('Sample interval'),
  thresholds: z
    .record(
      z.string(),
      z.object({
        warning: z.number(),
        critical: z.number(),
      })
    )
    .optional()
    .describe('Alert thresholds'),
  outputFormat: z.enum(['json', 'csv', 'prometheus']).default('json'),
});

export type PerformanceMonitorInput = z.infer<typeof PerformanceMonitorSchema>;

/**
 * Tool Registry and Factory
 */
export class NetworkMCPTools {
  private static tools = new Map<string, z.ZodSchema>();

  static {
    // Register all tools
    this.tools.set('ping_test', PingTestSchema);
    this.tools.set('traceroute', TracerouteSchema);
    this.tools.set('port_scan', PortScanSchema);
    this.tools.set('dns_query', DnsQuerySchema);
    this.tools.set('interface_status', InterfaceStatusSchema);
    this.tools.set('script_generator', ScriptGeneratorSchema);
    this.tools.set('script_validator', ScriptValidatorSchema);
    this.tools.set('config_backup', ConfigBackupSchema);
    this.tools.set('config_compare', ConfigCompareSchema);
    this.tools.set('service_restart', ServiceRestartSchema);
    this.tools.set('firewall_rule', FirewallRuleSchema);
    this.tools.set('performance_monitor', PerformanceMonitorSchema);
  }

  /**
   * Validate tool input
   */
  static validateInput(
    toolName: string,
    input: unknown
  ): {
    valid: boolean;
    data?: unknown;
    errors?: z.ZodError;
  } {
    const schema = this.tools.get(toolName);
    if (!schema) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    const result = schema.safeParse(input);
    if (result.success) {
      return { valid: true, data: result.data };
    } else {
      return { valid: false, errors: result.error };
    }
  }

  /**
   * Get tool schema
   */
  static getSchema(toolName: string): z.ZodSchema | undefined {
    return this.tools.get(toolName);
  }

  /**
   * List all available tools
   */
  static listTools(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Create tool result
   */
  static createToolResult(
    success: boolean,
    content: string | Record<string, unknown>,
    error?: string
  ): CallToolResult {
    if (success) {
      return {
        content: [
          {
            type: 'text',
            text:
              typeof content === 'string'
                ? content
                : JSON.stringify(content, null, 2),
          },
        ],
        isError: false,
      };
    } else {
      return {
        content: [
          {
            type: 'text',
            text: error ?? 'Tool execution failed',
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Get tool risk level
   */
  static getToolRiskLevel(toolName: string): 'low' | 'medium' | 'high' {
    const riskMap: Record<string, 'low' | 'medium' | 'high'> = {
      // Read-only tools - Low risk
      ping_test: 'low',
      traceroute: 'low',
      dns_query: 'low',
      interface_status: 'low',
      performance_monitor: 'low',

      // Analysis tools - Medium risk
      port_scan: 'medium',
      script_validator: 'medium',
      config_compare: 'medium',

      // Modification tools - High risk
      script_generator: 'high',
      config_backup: 'high',
      service_restart: 'high',
      firewall_rule: 'high',
    };

    return riskMap[toolName] ?? 'high'; // Default to high risk for unknown tools
  }

  /**
   * Check if tool requires approval
   */
  static requiresApproval(toolName: string): boolean {
    const riskLevel = this.getToolRiskLevel(toolName);
    return riskLevel === 'high' || riskLevel === 'medium';
  }

  /**
   * Check if tool is read-only (instance method for compatibility)
   */
  isReadOnlyTool(toolName: string): boolean {
    const riskLevel = NetworkMCPTools.getToolRiskLevel(toolName);
    return riskLevel === 'low';
  }
}

/**
 * Tool execution context
 */
export interface ToolExecutionContext {
  sessionId: string;
  deviceId: string;
  userId: string;
  approvalId?: string;
  auditLog: boolean;
  dryRun: boolean;
  timeout: number;
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
  success: boolean;
  toolName: string;
  input: unknown;
  output?: unknown;
  error?: string;
  executionTime: number;
  auditEntry?: {
    timestamp: string;
    userId: string;
    action: string;
    result: string;
  };
}
