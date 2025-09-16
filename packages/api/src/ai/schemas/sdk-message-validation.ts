/**
 * SDK Message Type Validation Schemas
 * Runtime validation for Claude Code SDK message types using Zod
 *
 * IMPORTANT: This file contains two distinct types of message schemas:
 *
 * 1. MessageSchema: For conversation messages between user and assistant
 *    - Structure: { role: 'user' | 'assistant', content: string | ContentBlock[] }
 *    - Used for: Chat history, conversation context, message persistence
 *    - DO NOT use for: Real-time streaming events from SDK
 *
 * 2. StreamingMessageSchema: For real-time SDK streaming events
 *    - Structure: { type: 'text' | 'tool_use' | 'thinking' | ..., [data] }
 *    - Used for: Processing live SDK response streams, SSE events
 *    - DO NOT use for: Stored conversation history
 *
 * Keep these schemas clearly scoped to avoid validation mismatches.
 */

import { z } from 'zod';

/**
 * Text message content schema
 */
export const TextContentSchema = z.object({
  type: z.literal('text'),
  text: z.string().min(1),
});

/**
 * Tool use message content schema
 */
export const ToolUseContentSchema = z.object({
  type: z.literal('tool_use'),
  id: z.string().min(1),
  name: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
});

/**
 * Tool result message content schema
 */
export const ToolResultContentSchema = z.object({
  type: z.literal('tool_result'),
  tool_use_id: z.string().min(1),
  content: z.union([
    z.string(),
    z.array(
      z.union([
        TextContentSchema,
        z.object({
          type: z.literal('image'),
          source: z.object({
            type: z.literal('base64'),
            media_type: z.string(),
            data: z.string(),
          }),
        }),
      ])
    ),
  ]),
  is_error: z.boolean().optional(),
});

/**
 * Message content union schema
 */
export const MessageContentSchema = z.union([
  TextContentSchema,
  ToolUseContentSchema,
  ToolResultContentSchema,
]);

/**
 * Complete message schema for conversation history
 * Used for chat messages between user and assistant
 * NOT for streaming SDK events - use StreamingMessageSchema instead
 */
export const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.union([z.string(), z.array(MessageContentSchema)]),
});

/**
 * SDK Query Options schema
 */
export const SDKQueryOptionsSchema = z.object({
  model: z.string().optional(),
  fallbackModel: z.string().optional(),
  systemPrompt: z.string().optional(),
  appendSystemPrompt: z.string().optional(),
  permissionMode: z
    .enum(['default', 'plan', 'acceptEdits', 'bypassPermissions'])
    .optional(),
  allowedTools: z.array(z.string()).optional(),
  disallowedTools: z.array(z.string()).optional(),
  maxThinkingTokens: z.number().int().positive().optional(),
  maxTurns: z.number().int().positive().optional(),
  includePartialMessages: z.boolean().optional(),
  canUseTool: z.any().optional(), // Functions can't be validated with Zod
  env: z.record(z.string(), z.string()).optional(),
  cwd: z.string().optional(),
  strictMcpConfig: z.boolean().optional(),
  mcpServers: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Tool call result schema
 */
export const CallToolResultSchema = z.object({
  content: z.array(
    z.union([
      TextContentSchema,
      z.object({
        type: z.literal('image'),
        image: z.string(),
      }),
    ])
  ),
  isError: z.boolean().optional(),
});

/**
 * Permission result schema
 */
export const PermissionResultSchema = z.union([
  z.object({
    behavior: z.literal('allow'),
    updatedInput: z.unknown(), // Required field
    updatedPermissions: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    behavior: z.literal('deny'),
    message: z.string(),
    interrupt: z.boolean().optional(),
  }),
  z.object({
    behavior: z.literal('suggestions'),
    suggestions: z.array(
      z.object({
        toolName: z.string(),
        input: z.unknown(),
        reason: z.string(),
      })
    ),
  }),
]);

/**
 * SDK streaming message schema for real-time events
 * Used for processing live SDK response streams and SSE events
 * Each message has a 'type' field that determines its structure
 * NOT for conversation history - use MessageSchema instead
 */
export const StreamingMessageSchema = z.union([
  z.object({
    type: z.literal('text'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('tool_use'),
    id: z.string(),
    name: z.string(),
    input: z.record(z.string(), z.unknown()),
  }),
  z.object({
    type: z.literal('tool_result'),
    tool_use_id: z.string(),
    result: z.unknown(),
  }),
  z.object({
    type: z.literal('thinking'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('usage'),
    inputTokens: z.number(),
    outputTokens: z.number(),
    totalTokens: z.number(),
  }),
]);

/**
 * WebSocket approval message schema
 */
export const ApprovalMessageSchema = z.object({
  type: z.literal('approval_response'),
  approvalId: z.string().min(1),
  approved: z.boolean(),
  reason: z.string().optional(),
  modifiedInput: z.unknown().optional(),
});

/**
 * Validation helper functions
 */
export class SDKMessageValidator {
  /**
   * Validate a conversation message object (role + content structure)
   * Use this for chat history and stored messages
   * DO NOT use for streaming SDK events
   */
  static validateMessage(message: unknown): {
    valid: boolean;
    data?: z.infer<typeof MessageSchema>;
    error?: z.ZodError;
  } {
    const result = MessageSchema.safeParse(message);
    if (result.success) {
      return { valid: true, data: result.data };
    }
    return { valid: false, error: result.error };
  }

  /**
   * Validate SDK query options
   */
  static validateQueryOptions(options: unknown): {
    valid: boolean;
    data?: z.infer<typeof SDKQueryOptionsSchema>;
    error?: z.ZodError;
  } {
    const result = SDKQueryOptionsSchema.safeParse(options);
    if (result.success) {
      return { valid: true, data: result.data };
    }
    return { valid: false, error: result.error };
  }

  /**
   * Validate permission result
   */
  static validatePermissionResult(result: unknown): {
    valid: boolean;
    data?: PermissionResultValidation;
    error?: z.ZodError;
  } {
    const validation = PermissionResultSchema.safeParse(result);
    if (validation.success) {
      return { valid: true, data: validation.data };
    }
    return { valid: false, error: validation.error };
  }

  /**
   * Validate streaming SDK event message (type-based structure)
   * Use this for real-time SDK response streams and SSE events
   * DO NOT use for conversation history messages
   */
  static validateStreamingMessage(message: unknown): {
    valid: boolean;
    data?: z.infer<typeof StreamingMessageSchema>;
    error?: z.ZodError;
  } {
    const result = StreamingMessageSchema.safeParse(message);
    if (result.success) {
      return { valid: true, data: result.data };
    }
    return { valid: false, error: result.error };
  }

  /**
   * Validate tool call result
   */
  static validateToolResult(result: unknown): {
    valid: boolean;
    data?: z.infer<typeof CallToolResultSchema>;
    error?: z.ZodError;
  } {
    const validation = CallToolResultSchema.safeParse(result);
    if (validation.success) {
      return { valid: true, data: validation.data };
    }
    return { valid: false, error: validation.error };
  }

  /**
   * Create validated conversation message
   * Creates a message with role + content structure for chat history
   */
  static createMessage(
    role: 'user' | 'assistant',
    content: string | unknown[]
  ): z.infer<typeof MessageSchema> {
    const message = { role, content };
    const validation = this.validateMessage(message);
    if (!validation.valid) {
      throw new Error(`Invalid message: ${validation.error?.message}`);
    }
    return validation.data as z.infer<typeof MessageSchema>;
  }

  /**
   * Sanitize and validate unknown input
   */
  static sanitizeInput(input: unknown): unknown {
    // Remove undefined values
    if (typeof input === 'object' && input !== null) {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined) {
          sanitized[key] = value;
        }
      }
      return sanitized;
    }
    return input;
  }

  /**
   * Validate approval message from WebSocket
   */
  static validateApprovalMessage(message: unknown): {
    valid: boolean;
    data?: z.infer<typeof ApprovalMessageSchema>;
    error?: z.ZodError;
  } {
    const result = ApprovalMessageSchema.safeParse(message);
    if (result.success) {
      return { valid: true, data: result.data };
    }
    return { valid: false, error: result.error };
  }

  /**
   * Extract error message from validation error
   */
  static getErrorMessage(error: z.ZodError): string {
    if (!error?.issues) {
      return 'Validation error';
    }
    return error.issues
      .map(e => {
        const path = e.path.length > 0 ? `${e.path.join('.')}: ` : '';
        return `${path}${e.message}`;
      })
      .join(', ');
  }
}

/**
 * Export types for use in other modules
 * Note: PermissionResultValidation is for runtime validation only.
 * Use the SDK's PermissionResult type for type definitions.
 */
export type Message = z.infer<typeof MessageSchema>;
export type MessageContent = z.infer<typeof MessageContentSchema>;
export type PermissionResultValidation = z.infer<typeof PermissionResultSchema>;
export type CallToolResult = z.infer<typeof CallToolResultSchema>;
export type StreamingMessage = z.infer<typeof StreamingMessageSchema>;
export type SDKQueryOptions = z.infer<typeof SDKQueryOptionsSchema>;
export type ApprovalMessage = z.infer<typeof ApprovalMessageSchema>;
