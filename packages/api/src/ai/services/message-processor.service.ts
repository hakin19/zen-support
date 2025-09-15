/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable @typescript-eslint/restrict-template-expressions */

import { EventEmitter } from 'events';

import { z } from 'zod';

import { getSupabaseAdminClient } from '@aizen/shared/utils/supabase-client';

import { sanitizeForDatabase } from '../../utils/pii-sanitizer';

import type {
  SDKMessage,
  SDKAssistantMessage,
  SDKUserMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKPartialAssistantMessage,
  SDKCompactBoundaryMessage,
} from '@anthropic-ai/claude-code';

// Message validation schemas
const ToolUseContentSchema = z.object({
  type: z.literal('tool_use'),
  id: z.string(),
  name: z.string(),
  input: z.record(z.string(), z.unknown()),
});

// Note: Text content validation omitted until needed in transforms

interface ProcessedMessage {
  id: string;
  sessionId: string;
  type: SDKMessage['type'];
  timestamp: Date;
  content?: any;
  metadata?: Record<string, unknown>;
}

interface MessageFilter {
  types?: SDKMessage['type'][];
  sessionId?: string;
  toolNames?: string[];
  minTimestamp?: Date;
}

interface MessageTransform {
  name: string;
  filter?: MessageFilter;
  transform: (message: SDKMessage) => SDKMessage | null;
}

/**
 * Message Processing Pipeline for SDK Messages
 * Handles validation, transformation, routing, and persistence
 */
export class MessageProcessor extends EventEmitter {
  private messageBuffer: Map<string, ProcessedMessage[]> = new Map();
  private transforms: MessageTransform[] = [];
  private validators: Map<string, z.ZodSchema> = new Map();
  private maxBufferSize = 1000;

  constructor() {
    super();
    this.setupDefaultValidators();
  }

  /**
   * Process incoming SDK message through the pipeline
   */
  async processMessage(
    message: SDKMessage,
    sessionId: string
  ): Promise<ProcessedMessage> {
    // 1. Validate message
    await this.validateMessage(message);

    // 2. Apply transforms
    let transformedMessage: SDKMessage | null = message;
    for (const transform of this.transforms) {
      if (this.shouldApplyTransform(transform, message, sessionId)) {
        transformedMessage = transform.transform(transformedMessage);
        if (!transformedMessage) break;
      }
    }

    if (!transformedMessage) {
      throw new Error('Message filtered out by transforms');
    }

    // 3. Route message by type
    const processed = await this.routeMessage(transformedMessage, sessionId);

    // 4. Buffer message
    this.bufferMessage(processed);

    // 5. Persist if needed
    await this.persistMessage(processed);

    // 6. Emit processed message
    this.emit('message:processed', processed);

    return processed;
  }

  /**
   * Process a stream of messages
   */
  async *processStream(
    messages: AsyncIterable<SDKMessage>,
    sessionId: string
  ): AsyncGenerator<ProcessedMessage, void> {
    for await (const message of messages) {
      try {
        const processed = await this.processMessage(message, sessionId);
        yield processed;
      } catch (error) {
        this.emit('message:error', { sessionId, message, error });
        // Continue processing other messages
      }
    }
  }

  /**
   * Route message based on type
   */
  private async routeMessage(
    message: SDKMessage,
    sessionId: string
  ): Promise<ProcessedMessage> {
    const processed: ProcessedMessage = {
      id: this.generateMessageId(),
      sessionId,
      type: message.type,
      timestamp: new Date(),
      metadata: {},
    };

    switch (message.type) {
      case 'assistant':
        processed.content = await this.processAssistantMessage(message);
        break;

      case 'user':
        processed.content = await this.processUserMessage(
          message as SDKUserMessage
        );
        break;

      case 'result':
        processed.content = await this.processResultMessage(message);
        break;

      case 'system':
        processed.content = await this.processSystemMessage(message);
        break;

      case 'stream_event':
        processed.content = await this.processStreamEvent(message);
        break;

      default:
        processed.content = message;
    }

    return processed;
  }

  /**
   * Process assistant messages
   */
  private async processAssistantMessage(
    message: SDKAssistantMessage
  ): Promise<any> {
    const content = message.message.content || [];
    const processedContent = [];

    for (const block of content) {
      if (typeof block === 'string') {
        processedContent.push({ type: 'text', text: block });
      } else if (block.type === 'text') {
        processedContent.push(block);
      } else if (block.type === 'tool_use') {
        // Validate tool use block
        const validated = ToolUseContentSchema.parse(block);
        processedContent.push(validated);

        // Emit tool use event
        this.emit('tool:use', {
          toolName: validated.name,
          toolId: validated.id,
          input: validated.input,
        });
      }
    }

    return {
      role: message.message.role,
      content: processedContent,
      parentToolUseId: message.parent_tool_use_id,
      stopReason: message.message.stop_reason,
      stopSequence: message.message.stop_sequence,
    };
  }

  /**
   * Process user messages
   */
  private async processUserMessage(message: SDKUserMessage): Promise<any> {
    return {
      role: message.message.role,
      content: message.message.content,
      parentToolUseId: message.parent_tool_use_id,
    };
  }

  /**
   * Process result messages
   */
  private async processResultMessage(message: SDKResultMessage): Promise<any> {
    const result: any = {
      subtype: message.subtype,
      durationMs: message.duration_ms,
      durationApiMs: message.duration_api_ms,
      isError: message.is_error,
      numTurns: message.num_turns,
      totalCostUsd: message.total_cost_usd,
      usage: message.usage,
      modelUsage: message.modelUsage,
      permissionDenials: message.permission_denials,
    };

    if (message.subtype === 'success') {
      result.result = (message as any).result;
    }

    // Track metrics
    this.emit('metrics:usage', {
      sessionId: message.session_id,
      usage: message.usage,
      cost: message.total_cost_usd,
    });

    return result;
  }

  /**
   * Process system messages
   */
  private async processSystemMessage(
    message: SDKSystemMessage | SDKCompactBoundaryMessage
  ): Promise<any> {
    if ('subtype' in message) {
      if (message.subtype === 'init') {
        const initMessage = message;
        return {
          subtype: 'init',
          apiKeySource: initMessage.apiKeySource,
          cwd: initMessage.cwd,
          tools: initMessage.tools,
          mcpServers: initMessage.mcp_servers,
          model: initMessage.model,
          permissionMode: initMessage.permissionMode,
          slashCommands: initMessage.slash_commands,
          outputStyle: initMessage.output_style,
        };
      } else if (message.subtype === 'compact_boundary') {
        const compactMessage = message;
        return {
          subtype: 'compact_boundary',
          compactMetadata: compactMessage.compact_metadata,
        };
      }
    }

    return message;
  }

  /**
   * Process stream events (partial messages)
   */
  private async processStreamEvent(
    message: SDKPartialAssistantMessage
  ): Promise<any> {
    return {
      event: message.event,
      parentToolUseId: message.parent_tool_use_id,
    };
  }

  /**
   * Validate message structure
   */
  private async validateMessage(message: SDKMessage): Promise<void> {
    const validator = this.validators.get(message.type);
    if (validator) {
      try {
        validator.parse(message);
      } catch (error) {
        throw new Error(`Message validation failed: ${error}`);
      }
    }
  }

  /**
   * Buffer message for later retrieval
   */
  private bufferMessage(message: ProcessedMessage): void {
    const buffer = this.messageBuffer.get(message.sessionId) || [];

    buffer.push(message);

    // Trim buffer if too large
    if (buffer.length > this.maxBufferSize) {
      buffer.shift();
    }

    this.messageBuffer.set(message.sessionId, buffer);
  }

  /**
   * Persist message to database
   */
  private async persistMessage(message: ProcessedMessage): Promise<void> {
    // Only persist certain message types
    if (!['assistant', 'user', 'result'].includes(message.type)) {
      return;
    }

    try {
      const supabase = getSupabaseAdminClient() as any;
      // Sanitize content and metadata before persisting
      const sanitizedContent = sanitizeForDatabase(message.content);
      const sanitizedMetadata = sanitizeForDatabase(message.metadata);

      await supabase.from('ai_messages').insert({
        id: message.id,
        session_id: message.sessionId,
        message_type: message.type,
        content: sanitizedContent,
        metadata: sanitizedMetadata,
        created_at: message.timestamp.toISOString(),
      });
    } catch (error) {
      console.error('Failed to persist message:', error);
      // Don't throw - persistence is optional
    }
  }

  /**
   * Add a transform to the pipeline
   */
  addTransform(transform: MessageTransform): void {
    this.transforms.push(transform);
  }

  /**
   * Remove a transform from the pipeline
   */
  removeTransform(name: string): void {
    this.transforms = this.transforms.filter(t => t.name !== name);
  }

  /**
   * Check if transform should be applied
   */
  private shouldApplyTransform(
    transform: MessageTransform,
    message: SDKMessage,
    sessionId: string
  ): boolean {
    if (!transform.filter) return true;

    const filter = transform.filter;

    if (filter.types && !filter.types.includes(message.type)) {
      return false;
    }

    if (filter.sessionId && filter.sessionId !== sessionId) {
      return false;
    }

    if (filter.minTimestamp && new Date() < filter.minTimestamp) {
      return false;
    }

    if (filter.toolNames && message.type === 'assistant') {
      const assistantMessage = message as any;
      const hasMatchingTool = assistantMessage.message.content?.some(
        (content: any) =>
          content.type === 'tool_use' &&
          filter.toolNames?.includes(content.name)
      );
      if (!hasMatchingTool) return false;
    }

    return true;
  }

  /**
   * Setup default validators
   */
  private setupDefaultValidators(): void {
    // Add basic type validators
    this.validators.set(
      'assistant',
      z.object({
        type: z.literal('assistant'),
        uuid: z.string().optional(),
        session_id: z.string(),
        message: z.object({
          role: z.literal('assistant'),
          content: z.array(z.any()),
        }),
      })
    );

    this.validators.set(
      'user',
      z.object({
        type: z.literal('user'),
        uuid: z.string().optional(),
        session_id: z.string(),
        message: z.object({
          role: z.literal('user'),
          content: z.any(),
        }),
      })
    );

    this.validators.set(
      'result',
      z.object({
        type: z.literal('result'),
        uuid: z.string().optional(),
        session_id: z.string(),
        subtype: z.enum([
          'success',
          'error_max_turns',
          'error_during_execution',
        ]),
        is_error: z.boolean(),
      })
    );
  }

  /**
   * Get buffered messages for a session
   */
  getSessionMessages(
    sessionId: string,
    filter?: MessageFilter
  ): ProcessedMessage[] {
    const messages = this.messageBuffer.get(sessionId) || [];

    if (!filter) return messages;

    return messages.filter(msg => {
      if (filter.types && !filter.types.includes(msg.type)) {
        return false;
      }

      if (filter.minTimestamp && msg.timestamp < filter.minTimestamp) {
        return false;
      }

      return true;
    });
  }

  /**
   * Clear session buffer
   */
  clearSessionBuffer(sessionId: string): void {
    this.messageBuffer.delete(sessionId);
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get statistics for a session
   */
  getSessionStats(sessionId: string): Record<string, any> {
    const messages = this.messageBuffer.get(sessionId) || [];

    const stats = {
      totalMessages: messages.length,
      messagesByType: {} as Record<string, number>,
      toolUses: [] as string[],
      firstMessage: messages[0]?.timestamp,
      lastMessage: messages[messages.length - 1]?.timestamp,
    };

    for (const msg of messages) {
      stats.messagesByType[msg.type] =
        (stats.messagesByType[msg.type] || 0) + 1;

      if (msg.type === 'assistant' && msg.content?.content) {
        for (const block of msg.content.content) {
          if (block.type === 'tool_use') {
            stats.toolUses.push(block.name);
          }
        }
      }
    }

    return stats;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.messageBuffer.clear();
    this.transforms = [];
    this.validators.clear();
    this.removeAllListeners();
  }
}
