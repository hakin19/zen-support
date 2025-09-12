import {
  claude,
  ConsoleLogger,
  LogLevel,
  type Logger,
  type QueryBuilder,
  type ResponseParser,
  type CLIMessage,
  type ToolUseBlock,
  type ToolName,
} from '@instantlyeasy/claude-code-sdk-ts';

import { supabase } from '@aizen/shared';

export interface ClaudeCodeOptions {
  model?: 'sonnet' | 'opus';
  allowedTools?: ToolName[];
  deniedTools?: ToolName[];
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
  logger?: Logger;
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

export class ClaudeCodeService {
  private config: ClaudeCodeConfig;
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
  private readOnlyMode = false;

  constructor(config: ClaudeCodeConfig = {}) {
    this.config = {
      model: config.model ?? 'sonnet',
      timeout: config.timeout ?? 30000,
      defaultRole: config.defaultRole,
      logger: config.logger ?? new ConsoleLogger(LogLevel.ERROR),
    };
  }

  /**
   * Execute a query with optional configuration
   */
  async query(prompt: string, options?: ClaudeCodeOptions): Promise<string> {
    const builder = this.buildQuery(options);
    const parser = builder.query(prompt);

    // Track usage
    await this.trackUsage(parser);

    return parser.asText();
  }

  /**
   * Execute a query and return JSON response
   */
  async queryJSON<T = unknown>(
    prompt: string,
    options?: ClaudeCodeOptions
  ): Promise<T> {
    const builder = this.buildQuery(options);
    const parser = builder.query(prompt);

    await this.trackUsage(parser);

    const result = await parser.asJSON<T>();
    return result as T;
  }

  /**
   * Execute a query with a specific role
   */
  async queryWithRole(
    prompt: string,
    role: string,
    options?: ClaudeCodeOptions
  ): Promise<string> {
    const builder = this.buildQuery({ ...options, role });
    const parser = builder.query(prompt);

    await this.trackUsage(parser);

    return parser.asText();
  }

  /**
   * Stream a query response with callback
   */
  async streamQuery(
    prompt: string,
    onMessage: MessageHandler,
    options?: ClaudeCodeOptions
  ): Promise<void> {
    const builder = this.buildQuery(options);
    const parser = builder.query(prompt);

    await parser.stream(async (output: unknown) => {
      // Check if it's a CLIMessage with tool_use
      const cliMessage = output as CLIMessage;
      if (cliMessage.type === 'message' && cliMessage.data) {
        const messageData = cliMessage.data as {
          content?: Array<{ type: string; name?: string; input?: unknown }>;
        };
        // Check for tool_use blocks in the message content
        if (messageData.content && Array.isArray(messageData.content)) {
          for (const block of messageData.content) {
            if (block.type === 'tool_use' && block.name === 'device_action') {
              const toolBlock = block as ToolUseBlock;
              if (this.approvalHandler) {
                const approved = await this.approvalHandler(
                  toolBlock.input as unknown as DeviceAction
                );
                if (!approved) {
                  // Handle rejection
                  return;
                }
              }
            }
          }
        }
      }

      onMessage(output);
    });

    await this.trackUsage(parser);
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

    const { data, error } = await supabase
      .from('ai_prompts')
      .select('*')
      .eq('name', name)
      .eq('is_active', true)
      .single();

    if (error || !data) {
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
    // Note: customer_id and created_by would normally come from auth context
    // For now, using placeholders that would be replaced in production
    // Using type assertion to handle the Supabase client typing issue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const { error } = await (supabase as any).from('ai_prompts').upsert([
      {
        name: template.name,
        template: template.template,
        variables: template.variables,
        category: template.category,
        metadata: template.metadata,
        is_active: template.is_active !== false,
        customer_id: template.customer_id ?? 'system',
        created_by: template.created_by ?? 'system',
      },
    ]);

    if (error) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      throw new Error(`Failed to save prompt template: ${error.message}`);
    }

    this.promptTemplates.set(template.name, template);
  }

  /**
   * Set read-only mode (no write tools allowed)
   */
  setReadOnlyMode(enabled: boolean): void {
    this.readOnlyMode = enabled;
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
   * Build a query with configuration
   */
  private buildQuery(options?: ClaudeCodeOptions): QueryBuilder {
    let builder = claude()
      .withModel(options?.model ?? (this.config.model as 'sonnet' | 'opus'))
      .withTimeout(options?.timeout ?? (this.config.timeout as number))
      .withLogger(this.config.logger as Logger);

    // Apply role
    if (options?.role ?? this.config.defaultRole) {
      builder = builder.withRole(
        options?.role ?? (this.config.defaultRole as string)
      );
    }

    // Configure tools
    if (this.readOnlyMode) {
      builder = builder.allowTools(); // No tools = read-only
    } else if (options?.allowedTools) {
      // Note: allowedTools is expected to be string[] by the SDK
      builder = builder.allowTools(...options.allowedTools);
    }

    if (options?.deniedTools) {
      // Note: deniedTools is expected to be string[] by the SDK
      builder = builder.denyTools(...options.deniedTools);
    }

    // Configure permissions
    if (options?.skipPermissions) {
      builder = builder.skipPermissions();
    } else if (options?.acceptEdits) {
      builder = builder.acceptEdits();
    }

    // Set working directory
    if (options?.workingDirectory) {
      builder = builder.inDirectory(options.workingDirectory);
    }

    // Set session if available
    if (this.sessionId) {
      builder = builder.withSessionId(this.sessionId);
    }

    return builder;
  }

  /**
   * Track usage metrics
   */
  private async trackUsage(parser: ResponseParser): Promise<void> {
    try {
      const usage = await parser.getUsage();

      if (usage) {
        this.lastUsage = {
          totalTokens: usage.totalTokens,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalCost: usage.totalCost,
          cacheReadTokens: usage.cacheReadTokens,
          cacheCreationTokens: usage.cacheCreationTokens,
        };

        // Accumulate total usage
        this.totalUsage.totalTokens += usage.totalTokens;
        this.totalUsage.inputTokens += usage.inputTokens;
        this.totalUsage.outputTokens += usage.outputTokens;
        this.totalUsage.totalCost += usage.totalCost;
      }
    } catch (error) {
      // Usage tracking is optional, don't fail the request
      console.error('Failed to track usage:', error);
    }
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
}
