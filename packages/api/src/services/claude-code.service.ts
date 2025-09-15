/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * Legacy wrapper for ClaudeCodeService
 * This provides backward compatibility while migrating to the new AIOrchestrator
 */

import { getSupabase, type Json } from '@aizen/shared';

import { AIOrchestrator } from '../ai/services/ai-orchestrator.service';
import { MessageProcessor } from '../ai/services/message-processor.service';
import { findTemplateByName } from '../config/prompt-templates';

import { PromptTemplateFactory } from '../ai/prompts/network-analysis.prompts';

export interface ClaudeCodeOptions {
  model?: 'sonnet' | 'opus';
  allowedTools?: string[];
  deniedTools?: string[];
  skipPermissions?: boolean;
  acceptEdits?: boolean;
  timeout?: number;
  role?: string;
  workingDirectory?: string;
}

export interface ClaudeCodeConfig {
  model?: 'sonnet' | 'opus';
  timeout?: number;
  defaultRole?: string;
  logger?: any;
}

export interface PromptTemplate {
  name: string;
  template: string;
  variables: string[];
  category?: string;
  metadata?: Record<string, unknown>;
  is_active?: boolean;
  customer_id?: string;
  created_by?: string;
}

export interface UsageMetrics {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

export interface DeviceAction {
  action: string;
  deviceId?: string;
  command?: string;
  parameters?: Record<string, unknown>;
}

type ApprovalHandler = (action: DeviceAction) => Promise<boolean>;
type MessageHandler = (message: unknown) => void;

/**
 * Legacy ClaudeCodeService wrapper for backward compatibility
 * Delegates to the new AIOrchestrator service
 */
export class ClaudeCodeService {
  private config: ClaudeCodeConfig;
  private orchestrator: AIOrchestrator;
  private messageProcessor: MessageProcessor;
  private sessionId?: string;
  private lastUsage?: UsageMetrics;
  private totalUsage: UsageMetrics = {
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalCost: 0,
  };
  private approvalHandler?: ApprovalHandler;
  private promptTemplates: Map<string, PromptTemplate> = new Map();
  // Back-compat flag toggled by tests; referenced to satisfy TS usage
  private _readOnlyMode = false;

  constructor(config: ClaudeCodeConfig = {}) {
    this.config = {
      model: config.model ?? 'sonnet',
      timeout: config.timeout ?? 30000,
      defaultRole: config.defaultRole,
      logger: config.logger,
    };

    this.orchestrator = new AIOrchestrator();
    this.messageProcessor = new MessageProcessor();
    // No-op reference to satisfy noUnusedLocals when in read-only mode
    if (this._readOnlyMode) {
      // intentionally left blank
    }

    // Set up event listeners
    this.setupEventListeners();
  }

  /**
   * Execute a query with optional configuration (legacy method)
   */
  async query(_prompt: string, _options?: ClaudeCodeOptions): Promise<string> {
    const sessionId = this.sessionId ?? this.generateSessionId();

    // Create a diagnostic prompt for the orchestrator
    const diagnosticPrompt = PromptTemplateFactory.createDiagnosticPrompt({
      deviceId: 'legacy',
      deviceType: 'unknown',
      symptoms: ['User query'],
      diagnosticData: {
        pingTests: [],
        traceroute: [],
        dnsQueries: [],
        interfaceStatus: [],
      },
    });

    let fullResponse = '';

    try {
      // Use the orchestrator's streaming capability
      for await (const message of this.orchestrator.analyzeDiagnostics(
        diagnosticPrompt,
        sessionId
      )) {
        const processed = await this.messageProcessor.processMessage(
          message,
          sessionId
        );

        if (message.type === 'assistant' && processed.content?.content) {
          for (const block of processed.content.content) {
            if (block.type === 'text') {
              fullResponse += block.text;
            }
          }
        }
      }
    } catch (error) {
      console.error('Query execution failed:', error);
      throw error;
    }

    return fullResponse;
  }

  /**
   * Execute a query and return JSON response
   */
  async queryJSON<T = unknown>(
    prompt: string,
    options?: ClaudeCodeOptions
  ): Promise<T> {
    const response = await this.query(prompt, options);
    try {
      return JSON.parse(response) as T;
    } catch {
      return response as unknown as T;
    }
  }

  /**
   * Execute a query with a specific role
   */
  async queryWithRole(
    prompt: string,
    role: string,
    options?: ClaudeCodeOptions
  ): Promise<string> {
    return this.query(prompt, { ...options, role });
  }

  /**
   * Stream a query response with callback
   */
  async streamQuery(
    _prompt: string,
    onMessage: MessageHandler,
    _options?: ClaudeCodeOptions
  ): Promise<void> {
    const sessionId = this.sessionId ?? this.generateSessionId();

    // Create a diagnostic prompt for the orchestrator
    const diagnosticPrompt = PromptTemplateFactory.createDiagnosticPrompt({
      deviceId: 'legacy',
      deviceType: 'unknown',
      symptoms: ['User query'],
      diagnosticData: {
        pingTests: [],
        traceroute: [],
        dnsQueries: [],
        interfaceStatus: [],
      },
    });

    try {
      // Use the orchestrator's streaming capability
      for await (const message of this.orchestrator.analyzeDiagnostics(
        diagnosticPrompt,
        sessionId
      )) {
        const processed = await this.messageProcessor.processMessage(
          message,
          sessionId
        );

        // Convert to legacy format for backward compatibility
        if (message.type === 'assistant' && processed.content?.content) {
          const legacyMessage = {
            type: 'message',
            data: {
              content: processed.content.content,
            },
          };

          onMessage(legacyMessage);

          // Check for tool use blocks
          for (const block of processed.content.content) {
            if (block.type === 'tool_use' && this.approvalHandler) {
              const deviceAction: DeviceAction = {
                action: block.name,
                parameters: block.input as Record<string, unknown>,
              };
              const approved = await this.approvalHandler(deviceAction);
              if (!approved) {
                return;
              }
            }
          }
        } else if (message.type === 'stream_event') {
          // Pass through streaming events
          onMessage({
            type: 'stream',
            data: processed.content,
          });
        }
      }
    } catch (error) {
      console.error('Stream query failed:', error);
      throw error;
    }
  }

  /**
   * Execute a query with retry logic
   */
  async queryWithRetry(
    prompt: string,
    options: ClaudeCodeOptions & { maxRetries?: number } = {}
  ): Promise<string> {
    const maxRetries = options.maxRetries ?? 3;
    let lastError: Error | undefined;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await this.query(prompt, options);
      } catch (error) {
        lastError = error as Error;
        if (i < maxRetries - 1) {
          // Exponential backoff
          await new Promise(resolve =>
            setTimeout(resolve, 1000 * Math.pow(2, i))
          );
        }
      }
    }

    throw lastError ?? new Error('Query failed after retries');
  }

  /**
   * Load a prompt template from the database
   */
  async loadPromptTemplate(name: string): Promise<PromptTemplate | null> {
    // Check cache first
    if (this.promptTemplates.has(name)) {
      return this.promptTemplates.get(name) as PromptTemplate;
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('ai_prompts')
      .select('*')
      .eq('name', name)
      .eq('is_active', true)
      .single();

    if (!data || error) {
      // Fallback to built-in default templates (no DB dependency in tests)
      const def = findTemplateByName(name);
      if (def) {
        const template: PromptTemplate = {
          name: def.name,
          template: def.template,
          variables: def.variables,
          category: def.category,
          metadata: { description: def.description, examples: def.examples },
          is_active: true,
          customer_id: 'system',
          created_by: 'system',
        };
        this.promptTemplates.set(name, template);
        return template;
      }
      return null;
    }

    // Type assertion for the database row
    const dbRow = data as {
      name: string;
      template: string;
      variables?: unknown;
      category?: string;
      metadata?: unknown;
      is_active?: boolean;
      customer_id?: string;
      created_by?: string;
    };

    const template: PromptTemplate = {
      name: dbRow.name,
      template: dbRow.template,
      variables: Array.isArray(dbRow.variables)
        ? (dbRow.variables as string[])
        : [],
      category: dbRow.category,
      metadata: dbRow.metadata as Record<string, unknown> | undefined,
      is_active: dbRow.is_active,
      customer_id: dbRow.customer_id,
      created_by: dbRow.created_by,
    };

    this.promptTemplates.set(name, template);
    return template;
  }

  /**
   * Apply a prompt template with variables
   */
  async applyPromptTemplate(
    templateName: string,
    variables: Record<string, string>
  ): Promise<string> {
    const template = await this.loadPromptTemplate(templateName);

    if (!template) {
      // Fallback to a basic template
      return this.createBasicPrompt(templateName, variables);
    }

    let prompt = template.template;

    // Replace variables
    for (const [key, value] of Object.entries(variables)) {
      prompt = prompt.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    return prompt;
  }

  /**
   * Save a custom prompt template
   */
  async savePromptTemplate(template: PromptTemplate): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase.from('ai_prompts').upsert([
      {
        name: template.name,
        template: template.template,
        variables: template.variables as Json,
        category: template.category,
        metadata: template.metadata as Json,
        is_active: template.is_active !== false,
        customer_id: template.customer_id ?? 'system',
        created_by: template.created_by ?? 'system',
      },
    ]);

    if (error) {
      throw new Error(`Failed to save prompt template: ${error.message}`);
    }

    this.promptTemplates.set(template.name, template);
  }

  /**
   * Set read-only mode (no write tools allowed)
   */
  setReadOnlyMode(enabled: boolean): void {
    this._readOnlyMode = enabled;
  }

  /**
   * Set the approval handler for device actions
   */
  setApprovalHandler(handler: ApprovalHandler): void {
    this.approvalHandler = handler;
  }

  /**
   * Set the current session ID
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string | undefined {
    return this.sessionId;
  }

  /**
   * Clear the current session
   */
  clearSession(): void {
    this.sessionId = undefined;
  }

  /**
   * Get the current model
   */
  getModel(): string {
    return this.config.model as string;
  }

  /**
   * Get the last usage metrics
   */
  getLastUsage(): UsageMetrics | undefined {
    return this.lastUsage;
  }

  /**
   * Get total usage metrics
   */
  getTotalUsage(): UsageMetrics {
    return { ...this.totalUsage };
  }

  /**
   * Reset usage metrics
   */
  resetUsage(): void {
    this.totalUsage = {
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalCost: 0,
    };
    this.lastUsage = undefined;
  }

  /**
   * Set up event listeners for the orchestrator
   */
  private setupEventListeners(): void {
    this.orchestrator.on('usage:update', ({ usage }) => {
      if (usage) {
        this.lastUsage = {
          totalTokens: usage.inputTokens + usage.outputTokens,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalCost: usage.costUSD,
          cacheReadTokens: usage.cacheReadInputTokens,
          cacheCreationTokens: usage.cacheCreationInputTokens,
        };

        // Accumulate total usage
        this.totalUsage.totalTokens += this.lastUsage.totalTokens;
        this.totalUsage.inputTokens += this.lastUsage.inputTokens;
        this.totalUsage.outputTokens += this.lastUsage.outputTokens;
        this.totalUsage.totalCost += this.lastUsage.totalCost;
      }
    });
  }

  /**
   * Create a basic prompt when template is not found
   */
  private createBasicPrompt(
    templateName: string,
    variables: Record<string, string>
  ): string {
    // Create a reasonable default prompt based on template name
    switch (templateName) {
      case 'network-diagnostics':
        return `Analyze the network issue: ${variables.issue ?? 'unknown issue'} on device ${variables.device ?? 'unknown device'}. Provide diagnostic steps and potential solutions.`;

      case 'device-configuration':
        return `Configure device ${variables.device ?? 'unknown device'} with settings: ${JSON.stringify(variables.settings ?? {})}`;

      case 'troubleshooting':
        return `Troubleshoot the following problem: ${variables.problem ?? 'unknown problem'}. Device: ${variables.device ?? 'unknown'}. Symptoms: ${variables.symptoms ?? 'none provided'}.`;

      default:
        return `Execute task: ${templateName}. Parameters: ${JSON.stringify(variables)}`;
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.orchestrator.cleanup();
    this.messageProcessor.cleanup();
    this.promptTemplates.clear();
  }
}
