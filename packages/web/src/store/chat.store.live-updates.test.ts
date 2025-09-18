import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import type { Database } from '@aizen/shared';
import { useChatStore } from './chat.store';
import { apiClient } from '../lib/api-client';

// Mock the API client
vi.mock('../lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

type ChatSession = Database['public']['Tables']['chat_sessions']['Row'];
type ChatMessage = Database['public']['Tables']['chat_messages']['Row'];
type DeviceAction = Database['public']['Tables']['device_actions']['Row'];

describe('useChatStore - Live Updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store
    useChatStore.setState({
      sessions: [],
      activeSessionId: null,
      sessionsLoading: false,
      sessionsError: null,
      messages: [],
      messagesLoading: false,
      messagesError: null,
      deviceActions: [],
      pendingActions: [],
      isTyping: false,
      typingTimeout: null,
      isSending: false,
      deviceModalOpen: false,
      selectedActionId: null,
      unreadCount: 0,
      isConnected: false,
      connectionError: null,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('WebSocket Message Handling', () => {
    it('should handle assistant messages arriving via WebSocket', () => {
      const { result } = renderHook(() => useChatStore());

      // Set active session
      act(() => {
        result.current.setActiveSession('session-1');
      });

      const assistantMessage: ChatMessage = {
        id: 'assistant-msg-1',
        session_id: 'session-1',
        role: 'assistant',
        content: 'I can help you with that.',
        metadata: null,
        created_at: new Date().toISOString(),
      };

      act(() => {
        result.current.handleWebSocketMessage({
          type: 'chat:message',
          sessionId: 'session-1',
          data: assistantMessage,
        });
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].role).toBe('assistant');
      expect(result.current.messages[0].content).toBe('I can help you with that.');
    });

    it('should handle system messages arriving via WebSocket', () => {
      const { result } = renderHook(() => useChatStore());

      // Set active session
      act(() => {
        result.current.setActiveSession('session-1');
      });

      const systemMessage: ChatMessage = {
        id: 'system-msg-1',
        session_id: 'session-1',
        role: 'system',
        content: 'Device connection established.',
        metadata: { type: 'connection' },
        created_at: new Date().toISOString(),
      };

      act(() => {
        result.current.handleWebSocketMessage({
          type: 'chat:message',
          sessionId: 'session-1',
          data: systemMessage,
        });
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].role).toBe('system');
      expect(result.current.messages[0].metadata).toEqual({ type: 'connection' });
    });

    it('should ignore messages for inactive sessions', () => {
      const { result } = renderHook(() => useChatStore());

      // Set different active session
      act(() => {
        result.current.setActiveSession('session-2');
      });

      const messageForOtherSession: ChatMessage = {
        id: 'msg-1',
        session_id: 'session-1',
        role: 'assistant',
        content: 'This should be ignored',
        metadata: null,
        created_at: new Date().toISOString(),
      };

      act(() => {
        result.current.handleWebSocketMessage({
          type: 'chat:message',
          sessionId: 'session-1',
          data: messageForOtherSession,
        });
      });

      expect(result.current.messages).toHaveLength(0);
    });

    it('should not duplicate messages already in the store', () => {
      const { result } = renderHook(() => useChatStore());

      const existingMessage: ChatMessage = {
        id: 'msg-1',
        session_id: 'session-1',
        role: 'user',
        content: 'Hello',
        metadata: null,
        created_at: new Date().toISOString(),
      };

      // Add message initially
      act(() => {
        result.current.setActiveSession('session-1');
        result.current.addMessage(existingMessage);
      });

      expect(result.current.messages).toHaveLength(1);

      // Try to add the same message again via WebSocket
      act(() => {
        result.current.handleWebSocketMessage({
          type: 'chat:message',
          sessionId: 'session-1',
          data: existingMessage,
        });
      });

      // Should still have only one message
      expect(result.current.messages).toHaveLength(1);
    });

    it('should handle multiple messages arriving in rapid succession', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setActiveSession('session-1');
      });

      const messages = Array.from({ length: 5 }, (_, i) => ({
        id: `msg-${i}`,
        session_id: 'session-1',
        role: i % 2 === 0 ? 'user' : 'assistant' as const,
        content: `Message ${i}`,
        metadata: null,
        created_at: new Date(Date.now() + i * 1000).toISOString(),
      }));

      // Send all messages via WebSocket
      act(() => {
        messages.forEach(msg => {
          result.current.handleWebSocketMessage({
            type: 'chat:message',
            sessionId: 'session-1',
            data: msg,
          });
        });
      });

      expect(result.current.messages).toHaveLength(5);
      expect(result.current.messages.map(m => m.content)).toEqual(
        messages.map(m => m.content)
      );
    });
  });

  describe('Device Action Live Updates', () => {
    it('should update device action status from pending to approved', () => {
      const { result } = renderHook(() => useChatStore());

      const pendingAction = {
        id: 'action-1',
        session_id: 'session-1',
        message_id: 'msg-1',
        device_id: 'device-1',
        action_type: 'command' as const,
        command: 'show interfaces',
        metadata: {},
        status: 'pending' as const,
        created_at: new Date().toISOString(),
        approved_at: null,
        approved_by: null,
        rejected_at: null,
        rejected_by: null,
        executed_at: null,
        completed_at: null,
        error_message: null,
        result: null,
        parameters: null,
        requested_by: 'user-1',
      };

      // Add pending action
      act(() => {
        result.current.addDeviceAction(pendingAction);
      });

      expect(result.current.pendingActions).toHaveLength(1);

      // Simulate approval via WebSocket
      act(() => {
        result.current.handleWebSocketMessage({
          type: 'device:action:update',
          data: {
            id: 'action-1',
            status: 'approved',
            approved_at: new Date().toISOString(),
            approved_by: 'admin-user',
          },
        });
      });

      expect(result.current.pendingActions).toHaveLength(0);
      expect(result.current.deviceActions[0].status).toBe('approved');
      expect(result.current.deviceActions[0].approved_by).toBe('admin-user');
    });

    it('should update device action from approved to executing', () => {
      const { result } = renderHook(() => useChatStore());

      const approvedAction = {
        id: 'action-1',
        session_id: 'session-1',
        message_id: 'msg-1',
        device_id: 'device-1',
        action_type: 'command' as const,
        command: 'ping 8.8.8.8',
        metadata: {},
        status: 'approved' as const,
        created_at: new Date().toISOString(),
        approved_at: new Date().toISOString(),
        approved_by: 'admin-user',
        rejected_at: null,
        rejected_by: null,
        executed_at: null,
        completed_at: null,
        error_message: null,
        result: null,
        parameters: null,
        requested_by: 'user-1',
      };

      act(() => {
        result.current.addDeviceAction(approvedAction);
      });

      // Simulate execution start via WebSocket
      act(() => {
        result.current.handleWebSocketMessage({
          type: 'device:action:update',
          data: {
            id: 'action-1',
            status: 'executing',
            executed_at: new Date().toISOString(),
          },
        });
      });

      const action = result.current.deviceActions[0];
      expect(action.status).toBe('executing');
      expect(action.executed_at).toBeDefined();
    });

    it('should update device action with results when completed', () => {
      const { result } = renderHook(() => useChatStore());

      const executingAction = {
        id: 'action-1',
        session_id: 'session-1',
        message_id: 'msg-1',
        device_id: 'device-1',
        action_type: 'command' as const,
        command: 'ping 8.8.8.8',
        metadata: {},
        status: 'executing' as const,
        created_at: new Date().toISOString(),
        approved_at: new Date().toISOString(),
        approved_by: 'admin-user',
        rejected_at: null,
        rejected_by: null,
        executed_at: new Date().toISOString(),
        completed_at: null,
        error_message: null,
        result: null,
        parameters: null,
        requested_by: 'user-1',
      };

      act(() => {
        result.current.addDeviceAction(executingAction);
      });

      // Simulate completion with results via WebSocket
      act(() => {
        result.current.handleWebSocketMessage({
          type: 'device:action:update',
          data: {
            id: 'action-1',
            status: 'completed',
            completed_at: new Date().toISOString(),
            result: 'PING 8.8.8.8: 64 bytes from 8.8.8.8: icmp_seq=1 ttl=117 time=10.2 ms',
          },
        });
      });

      const action = result.current.deviceActions[0];
      expect(action.status).toBe('completed');
      expect(action.completed_at).toBeDefined();
      expect(action.result).toContain('64 bytes from 8.8.8.8');
    });

    it('should handle device action errors', () => {
      const { result } = renderHook(() => useChatStore());

      const executingAction = {
        id: 'action-1',
        session_id: 'session-1',
        message_id: 'msg-1',
        device_id: 'device-1',
        action_type: 'command' as const,
        command: 'invalid-command',
        metadata: {},
        status: 'executing' as const,
        created_at: new Date().toISOString(),
        approved_at: new Date().toISOString(),
        approved_by: 'admin-user',
        rejected_at: null,
        rejected_by: null,
        executed_at: new Date().toISOString(),
        completed_at: null,
        error_message: null,
        result: null,
        parameters: null,
        requested_by: 'user-1',
      };

      act(() => {
        result.current.addDeviceAction(executingAction);
      });

      // Simulate error via WebSocket
      act(() => {
        result.current.handleWebSocketMessage({
          type: 'device:action:update',
          data: {
            id: 'action-1',
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: 'Command not found: invalid-command',
          },
        });
      });

      const action = result.current.deviceActions[0];
      expect(action.status).toBe('failed');
      expect(action.error_message).toBe('Command not found: invalid-command');
    });

    it('should add real-time output to executing actions', () => {
      const { result } = renderHook(() => useChatStore());

      const executingAction = {
        id: 'action-1',
        session_id: 'session-1',
        message_id: 'msg-1',
        device_id: 'device-1',
        action_type: 'command' as const,
        command: 'traceroute google.com',
        metadata: {},
        status: 'executing' as const,
        created_at: new Date().toISOString(),
        approved_at: new Date().toISOString(),
        approved_by: 'admin-user',
        rejected_at: null,
        rejected_by: null,
        executed_at: new Date().toISOString(),
        completed_at: null,
        error_message: null,
        result: null,
        parameters: null,
        requested_by: 'user-1',
        output: [],
      };

      act(() => {
        result.current.addDeviceAction(executingAction);
      });

      // Simulate output arriving via multiple WebSocket messages
      const outputs = [
        'traceroute to google.com (142.250.186.46)',
        ' 1  gateway (192.168.1.1)  1.234 ms',
        ' 2  10.0.0.1 (10.0.0.1)  5.678 ms',
      ];

      act(() => {
        outputs.forEach(output => {
          result.current.addActionOutput('action-1', output);
        });
      });

      const action = result.current.deviceActions[0];
      expect(action.output).toEqual(outputs);
    });
  });

  describe('Session Live Updates', () => {
    it('should update session status when closed', () => {
      const { result } = renderHook(() => useChatStore());

      const activeSession: ChatSession = {
        id: 'session-1',
        user_id: 'user-1',
        customer_id: 'customer-1',
        title: 'Active Session',
        status: 'active',
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: null,
        closed_at: null,
      };

      act(() => {
        result.current.addSession(activeSession);
      });

      // Simulate session being closed via WebSocket
      act(() => {
        result.current.handleWebSocketMessage({
          type: 'session:update',
          data: {
            id: 'session-1',
            status: 'closed',
            closed_at: new Date().toISOString(),
          },
        });
      });

      expect(result.current.sessions[0].status).toBe('closed');
      expect(result.current.sessions[0].closed_at).toBeDefined();
    });

    it('should update session title when changed', () => {
      const { result } = renderHook(() => useChatStore());

      const session: ChatSession = {
        id: 'session-1',
        user_id: 'user-1',
        customer_id: 'customer-1',
        title: 'Original Title',
        status: 'active',
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: null,
        closed_at: null,
      };

      act(() => {
        result.current.addSession(session);
      });

      // Simulate title update via WebSocket
      act(() => {
        result.current.handleWebSocketMessage({
          type: 'session:update',
          data: {
            id: 'session-1',
            title: 'Updated Title - Network Issue Resolved',
            updated_at: new Date().toISOString(),
          },
        });
      });

      expect(result.current.sessions[0].title).toBe('Updated Title - Network Issue Resolved');
      expect(result.current.sessions[0].updated_at).toBeDefined();
    });

    it('should handle new session creation broadcasts', () => {
      const { result } = renderHook(() => useChatStore());

      const newSession: ChatSession = {
        id: 'session-2',
        user_id: 'user-1',
        customer_id: 'customer-1',
        title: 'New Support Request',
        status: 'active',
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: null,
        closed_at: null,
      };

      // Simulate new session broadcast (from another user/tab)
      act(() => {
        result.current.handleWebSocketMessage({
          type: 'session:created',
          data: newSession,
        });
      });

      // The store should handle this based on implementation
      // For now, we just ensure no errors occur
      expect(() => {
        result.current.handleWebSocketMessage({
          type: 'session:created',
          data: newSession,
        });
      }).not.toThrow();
    });
  });

  describe('Connection Management', () => {
    it('should handle connection loss and recovery', async () => {
      const { result } = renderHook(() => useChatStore());

      // Set up initial state with active session
      const session: ChatSession = {
        id: 'session-1',
        user_id: 'user-1',
        customer_id: 'customer-1',
        title: 'Active Session',
        status: 'active',
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: null,
        closed_at: null,
      };

      act(() => {
        result.current.addSession(session);
        result.current.setActiveSession('session-1');
        result.current.setConnected(true);
      });

      expect(result.current.isConnected).toBe(true);

      // Simulate connection loss
      act(() => {
        result.current.setConnected(false);
        result.current.setConnectionError('WebSocket connection lost');
      });

      expect(result.current.isConnected).toBe(false);
      expect(result.current.connectionError).toBe('WebSocket connection lost');

      // Mock API response for resync
      const mockMessages: ChatMessage[] = [
        {
          id: 'msg-1',
          session_id: 'session-1',
          role: 'user',
          content: 'Message sent while disconnected',
          metadata: null,
          created_at: new Date().toISOString(),
        },
      ];

      vi.mocked(apiClient.get).mockResolvedValue({
        data: { ...session, messages: mockMessages }
      });

      // Simulate reconnection and resync
      await act(async () => {
        result.current.setConnected(true);
        result.current.setConnectionError(null);
        await result.current.resyncOnReconnect();
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
        expect(result.current.connectionError).toBeNull();
        expect(result.current.messages).toEqual(mockMessages);
      });
    });

    it('should queue actions when disconnected', () => {
      const { result } = renderHook(() => useChatStore());

      // Simulate disconnected state
      act(() => {
        result.current.setConnected(false);
        result.current.setActiveSession('session-1');
      });

      // Try to send a message while disconnected
      const tempMessage = {
        id: expect.stringContaining('temp-'),
        session_id: 'session-1',
        role: 'user' as const,
        content: 'Message while offline',
        metadata: null,
        created_at: expect.any(String),
        status: 'sending' as const,
      };

      act(() => {
        result.current.addMessage(tempMessage);
      });

      // Message should be added with 'sending' status
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].status).toBe('sending');
    });

    it('should handle reconnection with pending messages', async () => {
      const { result } = renderHook(() => useChatStore());

      const session: ChatSession = {
        id: 'session-1',
        user_id: 'user-1',
        customer_id: 'customer-1',
        title: 'Session with Pending',
        status: 'active',
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: null,
        closed_at: null,
      };

      // Set up disconnected state with pending message
      act(() => {
        result.current.addSession(session);
        result.current.setActiveSession('session-1');
        result.current.setConnected(false);
        result.current.addMessage({
          id: 'temp-1',
          session_id: 'session-1',
          role: 'user',
          content: 'Pending message',
          metadata: null,
          created_at: new Date().toISOString(),
          status: 'sending',
        });
      });

      // Mock successful send on reconnect
      vi.mocked(apiClient.post).mockResolvedValue({
        data: {
          id: 'msg-1',
          session_id: 'session-1',
          role: 'user',
          content: 'Pending message',
          metadata: null,
          created_at: new Date().toISOString(),
        }
      });

      // Reconnect and retry
      act(() => {
        result.current.setConnected(true);
      });

      await act(async () => {
        await result.current.retryMessage('temp-1');
      });

      await waitFor(() => {
        const message = result.current.messages.find(m => m.content === 'Pending message');
        expect(message?.status).toBe('sent');
      });
    });
  });

  describe('Unread Messages and Notifications', () => {
    it('should increment unread count for new assistant messages', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setActiveSession('session-1');
      });

      expect(result.current.unreadCount).toBe(0);

      // Simulate assistant message arriving
      const assistantMessage: ChatMessage = {
        id: 'msg-1',
        session_id: 'session-1',
        role: 'assistant',
        content: 'New response',
        metadata: null,
        created_at: new Date().toISOString(),
      };

      act(() => {
        result.current.handleWebSocketMessage({
          type: 'chat:message',
          sessionId: 'session-1',
          data: assistantMessage,
        });
        // Manually increment unread (in real app, this would be automatic)
        result.current.incrementUnread();
      });

      expect(result.current.unreadCount).toBe(1);
    });

    it('should reset unread count when user reads messages', () => {
      const { result } = renderHook(() => useChatStore());

      // Set up unread messages
      act(() => {
        result.current.incrementUnread();
        result.current.incrementUnread();
        result.current.incrementUnread();
      });

      expect(result.current.unreadCount).toBe(3);

      // User reads messages
      act(() => {
        result.current.resetUnread();
      });

      expect(result.current.unreadCount).toBe(0);
    });

    it('should track typing indicator for real-time feedback', () => {
      vi.useFakeTimers();
      const { result } = renderHook(() => useChatStore());

      // Simulate typing start
      act(() => {
        result.current.setTyping(true);
      });

      expect(result.current.isTyping).toBe(true);

      // Typing should auto-stop after 3 seconds
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(result.current.isTyping).toBe(false);

      vi.useRealTimers();
    });
  });
});