import { describe, it, expect, beforeEach } from 'vitest';

import type {
  SDKMessage,
  SDKAssistantMessage,
  SDKResultMessage,
  SDKSystemMessage,
} from '@anthropic-ai/claude-code';

import { SDKMessageTracker } from './sdk-message-tracker.service';

describe('SDKMessageTracker', () => {
  let tracker: SDKMessageTracker;

  beforeEach(() => {
    tracker = new SDKMessageTracker();
  });

  describe('trackMessage', () => {
    it('should track messages with correlation IDs', () => {
      const message: SDKSystemMessage = {
        type: 'system',
        subtype: 'init',
        uuid: 'test-uuid',
        session_id: 'test-session',
        apiKeySource: 'user',
        cwd: '/test',
        tools: [],
        mcp_servers: [],
        model: 'claude-3.5-sonnet',
        permissionMode: 'default',
        slash_commands: [],
        output_style: 'default',
      };

      const tracked = tracker.trackMessage(message, 'session-1', 'corr-1');

      expect(tracked).toEqual({
        correlationId: 'corr-1',
        sessionId: 'session-1',
        message,
        timestamp: expect.any(Date),
        messageNumber: 1,
        parentToolUseId: undefined,
      });
    });

    it('should increment message numbers per session', () => {
      const message: SDKSystemMessage = {
        type: 'system',
        subtype: 'init',
        uuid: 'test-uuid',
        session_id: 'test-session',
        apiKeySource: 'user',
        cwd: '/test',
        tools: [],
        mcp_servers: [],
        model: 'claude-3.5-sonnet',
        permissionMode: 'default',
        slash_commands: [],
        output_style: 'default',
      };

      const tracked1 = tracker.trackMessage(message, 'session-1', 'corr-1');
      const tracked2 = tracker.trackMessage(message, 'session-1', 'corr-2');
      const tracked3 = tracker.trackMessage(message, 'session-2', 'corr-3');

      expect(tracked1.messageNumber).toBe(1);
      expect(tracked2.messageNumber).toBe(2);
      expect(tracked3.messageNumber).toBe(1); // Different session
    });
  });

  describe('getSessionMessages', () => {
    it('should return all messages for a session', () => {
      const message1: SDKSystemMessage = {
        type: 'system',
        subtype: 'init',
        uuid: 'uuid-1',
        session_id: 'session-1',
        apiKeySource: 'user',
        cwd: '/test',
        tools: [],
        mcp_servers: [],
        model: 'claude-3.5-sonnet',
        permissionMode: 'default',
        slash_commands: [],
        output_style: 'default',
      };

      const message2: SDKAssistantMessage = {
        type: 'assistant',
        uuid: 'uuid-2',
        session_id: 'session-1',
        message: {
          id: 'msg-1',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello' }],
          model: 'claude-3.5-sonnet',
        },
        parent_tool_use_id: null,
      };

      tracker.trackMessage(message1, 'session-1', 'corr-1');
      tracker.trackMessage(message2, 'session-1', 'corr-2');

      const messages = tracker.getSessionMessages('session-1');
      expect(messages).toHaveLength(2);
      expect(messages[0].message).toEqual(message1);
      expect(messages[1].message).toEqual(message2);
    });

    it('should return empty array for unknown session', () => {
      const messages = tracker.getSessionMessages('unknown-session');
      expect(messages).toEqual([]);
    });
  });

  describe('getMessagesByCorrelationId', () => {
    it('should return all messages with the same correlation ID', () => {
      const message1: SDKSystemMessage = {
        type: 'system',
        subtype: 'init',
        uuid: 'uuid-1',
        session_id: 'session-1',
        apiKeySource: 'user',
        cwd: '/test',
        tools: [],
        mcp_servers: [],
        model: 'claude-3.5-sonnet',
        permissionMode: 'default',
        slash_commands: [],
        output_style: 'default',
      };

      tracker.trackMessage(message1, 'session-1', 'corr-1');
      tracker.trackMessage(message1, 'session-2', 'corr-1');
      tracker.trackMessage(message1, 'session-3', 'corr-2');

      const messages = tracker.getMessagesByCorrelationId('corr-1');
      expect(messages).toHaveLength(2);
      expect(messages[0].correlationId).toBe('corr-1');
      expect(messages[1].correlationId).toBe('corr-1');
    });

    it('should return messages sorted by timestamp', () => {
      const message: SDKSystemMessage = {
        type: 'system',
        subtype: 'init',
        uuid: 'uuid-1',
        session_id: 'session-1',
        apiKeySource: 'user',
        cwd: '/test',
        tools: [],
        mcp_servers: [],
        model: 'claude-3.5-sonnet',
        permissionMode: 'default',
        slash_commands: [],
        output_style: 'default',
      };

      // Track messages with slight delay to ensure different timestamps
      tracker.trackMessage(message, 'session-1', 'corr-1');

      // Mock timestamp for second message
      const tracked2 = tracker.trackMessage(message, 'session-2', 'corr-1');
      tracked2.timestamp = new Date(Date.now() + 1000);

      const messages = tracker.getMessagesByCorrelationId('corr-1');
      expect(messages).toHaveLength(2);
      expect(messages[0].sessionId).toBe('session-1');
      expect(messages[1].sessionId).toBe('session-2');
    });
  });

  describe('session metrics', () => {
    it('should track session metrics correctly', () => {
      const initMessage: SDKSystemMessage = {
        type: 'system',
        subtype: 'init',
        uuid: 'uuid-1',
        session_id: 'session-1',
        apiKeySource: 'user',
        cwd: '/test',
        tools: [],
        mcp_servers: [],
        model: 'claude-3.5-sonnet',
        permissionMode: 'default',
        slash_commands: [],
        output_style: 'default',
      };

      const resultMessage: SDKResultMessage = {
        type: 'result',
        subtype: 'success',
        uuid: 'uuid-2',
        session_id: 'session-1',
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: false,
        num_turns: 1,
        result: 'Success',
        total_cost_usd: 0.01,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 10,
          cache_creation_input_tokens: 5,
        },
        permission_denials: [],
      };

      tracker.trackMessage(initMessage, 'session-1', 'corr-1');
      tracker.trackMessage(resultMessage, 'session-1', 'corr-1');

      const metrics = tracker.getSessionMetrics('session-1');
      expect(metrics).toBeDefined();
      expect(metrics?.messageCount).toBe(2);
      expect(metrics?.totalInputTokens).toBe(100);
      expect(metrics?.totalOutputTokens).toBe(50);
      expect(metrics?.totalCacheReadTokens).toBe(10);
      expect(metrics?.totalCacheCreationTokens).toBe(5);
      expect(metrics?.totalCostUsd).toBe(0.01);
      expect(metrics?.averageResponseTimeMs).toBe(500); // 1000ms / 2 messages
    });

    it('should track tool calls in assistant messages', () => {
      const assistantMessage: SDKAssistantMessage = {
        type: 'assistant',
        uuid: 'uuid-1',
        session_id: 'session-1',
        message: {
          id: 'msg-1',
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me help you' },
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'network_diagnostic',
              input: { test: 'data' },
            } as any,
          ],
          model: 'claude-3.5-sonnet',
        },
        parent_tool_use_id: null,
      };

      tracker.trackMessage(assistantMessage, 'session-1', 'corr-1');

      const metrics = tracker.getSessionMetrics('session-1');
      expect(metrics?.toolCallCount).toBe(1);
    });

    it('should track permission denials', () => {
      const resultMessage: SDKResultMessage = {
        type: 'result',
        subtype: 'success',
        uuid: 'uuid-1',
        session_id: 'session-1',
        duration_ms: 1000,
        duration_api_ms: 800,
        is_error: false,
        num_turns: 1,
        result: 'Completed with denials',
        total_cost_usd: 0.01,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: null,
          cache_creation_input_tokens: null,
        },
        permission_denials: [
          {
            tool_name: 'dangerous_tool',
            tool_use_id: 'tool-1',
            tool_input: { action: 'delete_all' },
          },
        ],
      };

      tracker.trackMessage(resultMessage, 'session-1', 'corr-1');

      const metrics = tracker.getSessionMetrics('session-1');
      expect(metrics?.permissionDenialCount).toBe(1);
    });
  });

  describe('tool metrics', () => {
    it('should track tool usage metrics', () => {
      const assistantMessage: SDKAssistantMessage = {
        type: 'assistant',
        uuid: 'uuid-1',
        session_id: 'session-1',
        message: {
          id: 'msg-1',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'network_diagnostic',
              input: { test: 'data' },
            } as any,
          ],
          model: 'claude-3.5-sonnet',
        },
        parent_tool_use_id: null,
      };

      tracker.trackMessage(assistantMessage, 'session-1', 'corr-1');
      tracker.trackToolResult('network_diagnostic', true, 500);

      const toolMetrics = tracker.getToolMetrics('network_diagnostic');
      expect(toolMetrics).toBeDefined();
      expect(toolMetrics?.callCount).toBe(1);
      expect(toolMetrics?.successCount).toBe(1);
      expect(toolMetrics?.failureCount).toBe(0);
      expect(toolMetrics?.averageDurationMs).toBe(500);
    });

    it('should track tool failures', () => {
      const assistantMessage: SDKAssistantMessage = {
        type: 'assistant',
        uuid: 'uuid-1',
        session_id: 'session-1',
        message: {
          id: 'msg-1',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'network_diagnostic',
              input: { test: 'data' },
            } as any,
          ],
          model: 'claude-3.5-sonnet',
        },
        parent_tool_use_id: null,
      };

      tracker.trackMessage(assistantMessage, 'session-1', 'corr-1');
      tracker.trackToolResult('network_diagnostic', false, 200);

      const toolMetrics = tracker.getToolMetrics('network_diagnostic');
      expect(toolMetrics?.successCount).toBe(0);
      expect(toolMetrics?.failureCount).toBe(1);
    });
  });

  describe('exportSessionData', () => {
    it('should export all session data', () => {
      const message: SDKSystemMessage = {
        type: 'system',
        subtype: 'init',
        uuid: 'uuid-1',
        session_id: 'session-1',
        apiKeySource: 'user',
        cwd: '/test',
        tools: [],
        mcp_servers: [],
        model: 'claude-3.5-sonnet',
        permissionMode: 'default',
        slash_commands: [],
        output_style: 'default',
      };

      tracker.trackMessage(message, 'session-1', 'corr-1');

      const exported = tracker.exportSessionData('session-1');
      expect(exported.messages).toHaveLength(1);
      expect(exported.metrics).toBeDefined();
      expect(exported.toolMetrics).toEqual([]);
    });
  });

  describe('clearSession', () => {
    it('should clear all data for a session', () => {
      const message: SDKSystemMessage = {
        type: 'system',
        subtype: 'init',
        uuid: 'uuid-1',
        session_id: 'session-1',
        apiKeySource: 'user',
        cwd: '/test',
        tools: [],
        mcp_servers: [],
        model: 'claude-3.5-sonnet',
        permissionMode: 'default',
        slash_commands: [],
        output_style: 'default',
      };

      tracker.trackMessage(message, 'session-1', 'corr-1');
      tracker.clearSession('session-1');

      expect(tracker.getSessionMessages('session-1')).toEqual([]);
      expect(tracker.getSessionMetrics('session-1')).toBeUndefined();
    });
  });

  describe('clearAll', () => {
    it('should clear all tracked data', () => {
      const message: SDKSystemMessage = {
        type: 'system',
        subtype: 'init',
        uuid: 'uuid-1',
        session_id: 'session-1',
        apiKeySource: 'user',
        cwd: '/test',
        tools: [],
        mcp_servers: [],
        model: 'claude-3.5-sonnet',
        permissionMode: 'default',
        slash_commands: [],
        output_style: 'default',
      };

      tracker.trackMessage(message, 'session-1', 'corr-1');
      tracker.trackMessage(message, 'session-2', 'corr-2');

      tracker.clearAll();

      expect(tracker.getSessionMessages('session-1')).toEqual([]);
      expect(tracker.getSessionMessages('session-2')).toEqual([]);
      expect(tracker.getAllToolMetrics()).toEqual([]);
    });
  });
});
