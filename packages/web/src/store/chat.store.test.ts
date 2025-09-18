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

describe('useChatStore', () => {
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

  describe('Chat Session Management', () => {
    it('should initialize with no active session', () => {
      const { result } = renderHook(() => useChatStore());

      expect(result.current.activeSessionId).toBeNull();
      expect(result.current.sessions).toEqual([]);
      expect(result.current.getCurrentSession()).toBeNull();
    });

    it('should create a new chat session via API', async () => {
      const mockSession: ChatSession = {
        id: 'session-1',
        user_id: 'user-1',
        customer_id: 'customer-1',
        title: 'Test Session',
        status: 'active',
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: null,
        closed_at: null,
      };

      vi.mocked(apiClient.post).mockResolvedValue({ data: mockSession });

      const { result } = renderHook(() => useChatStore());

      await act(async () => {
        await result.current.createSession('Test Session');
      });

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith('/api/chat/sessions', {
          title: 'Test Session',
        });
        expect(result.current.sessions).toHaveLength(1);
        expect(result.current.sessions[0]).toEqual(mockSession);
        expect(result.current.activeSessionId).toBe('session-1');
      });
    });

    it('should load existing chat sessions from API', async () => {
      const mockSessions: ChatSession[] = [
        {
          id: 'session-1',
          user_id: 'user-1',
          customer_id: 'customer-1',
          title: 'Session 1',
          status: 'active',
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: null,
          closed_at: null,
        },
        {
          id: 'session-2',
          user_id: 'user-1',
          customer_id: 'customer-1',
          title: 'Session 2',
          status: 'archived',
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: null,
          closed_at: null,
        },
      ];

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockSessions });

      const { result } = renderHook(() => useChatStore());

      await act(async () => {
        await result.current.loadSessions();
      });

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith('/api/chat/sessions');
        expect(result.current.sessions).toEqual(mockSessions);
        expect(result.current.sessionsLoading).toBe(false);
        expect(result.current.sessionsError).toBeNull();
      });
    });

    it('should load sessions with filtering by status', async () => {
      const mockSessions: ChatSession[] = [
        {
          id: 'session-1',
          user_id: 'user-1',
          customer_id: 'customer-1',
          title: 'Active Session',
          status: 'active',
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: null,
          closed_at: null,
        },
      ];

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockSessions });

      const { result } = renderHook(() => useChatStore());

      await act(async () => {
        await result.current.loadSessions({ status: 'active' });
      });

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith(
          '/api/chat/sessions?status=active'
        );
        expect(result.current.sessions).toEqual(mockSessions);
      });
    });

    it('should switch between chat sessions and load messages', async () => {
      const mockSession: ChatSession = {
        id: 'session-1',
        user_id: 'user-1',
        customer_id: 'customer-1',
        title: 'Test Session',
        status: 'active',
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: null,
        closed_at: null,
      };

      const mockMessages: ChatMessage[] = [
        {
          id: 'msg-1',
          session_id: 'session-1',
          role: 'user',
          content: 'Hello',
          metadata: null,
          created_at: new Date().toISOString(),
        },
        {
          id: 'msg-2',
          session_id: 'session-1',
          role: 'assistant',
          content: 'Hi there!',
          metadata: null,
          created_at: new Date().toISOString(),
        },
      ];

      vi.mocked(apiClient.get).mockResolvedValue({
        data: { ...mockSession, messages: mockMessages },
      });

      const { result } = renderHook(() => useChatStore());

      // Add session first
      act(() => {
        result.current.addSession(mockSession);
      });

      // Switch to session (should load messages)
      await act(async () => {
        await result.current.loadSession('session-1');
      });

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith(
          '/api/chat/sessions/session-1'
        );
        expect(result.current.activeSessionId).toBe('session-1');
        expect(result.current.messages).toEqual(mockMessages);
        expect(result.current.messagesLoading).toBe(false);
      });
    });

    it('should archive a chat session via API', async () => {
      const mockSession: ChatSession = {
        id: 'session-1',
        user_id: 'user-1',
        customer_id: 'customer-1',
        title: 'Test Session',
        status: 'active',
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: null,
        closed_at: null,
      };

      vi.mocked(apiClient.patch).mockResolvedValue({
        data: { ...mockSession, status: 'archived' as const },
      });

      const { result } = renderHook(() => useChatStore());

      // Add session first
      act(() => {
        result.current.addSession(mockSession);
      });

      await act(async () => {
        await result.current.archiveSessionWithAPI('session-1');
      });

      await waitFor(() => {
        expect(apiClient.patch).toHaveBeenCalledWith(
          '/api/chat/sessions/session-1',
          { status: 'archived' }
        );
        expect(result.current.sessions[0].status).toBe('archived');
      });
    });

    it('should handle session loading errors gracefully', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(
        new Error('Failed to load sessions')
      );

      const { result } = renderHook(() => useChatStore());

      await act(async () => {
        await result.current.loadSessions();
      });

      await waitFor(() => {
        expect(result.current.sessionsError).toBe('Failed to load sessions');
        expect(result.current.sessionsLoading).toBe(false);
        expect(result.current.sessions).toEqual([]);
      });
    });
  });

  describe('Message Management', () => {
    it('should send messages via API and update store', async () => {
      const mockSession: ChatSession = {
        id: 'session-1',
        user_id: 'user-1',
        customer_id: 'customer-1',
        title: 'Test Session',
        status: 'active',
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: null,
        closed_at: null,
      };

      const mockMessage: ChatMessage = {
        id: 'msg-1',
        session_id: 'session-1',
        role: 'user',
        content: 'Hello API',
        metadata: null,
        created_at: new Date().toISOString(),
      };

      vi.mocked(apiClient.post).mockResolvedValue({ data: mockMessage });

      const { result } = renderHook(() => useChatStore());

      // Set up session
      act(() => {
        result.current.addSession(mockSession);
        result.current.setActiveSession('session-1');
      });

      await act(async () => {
        await result.current.sendMessage('Hello API');
      });

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          '/api/chat/sessions/session-1/messages',
          { content: 'Hello API', stream: false }
        );

        // Check that message is in the store with correct status
        const message = result.current.messages.find(
          m => m.content === 'Hello API'
        );
        expect(message).toBeDefined();
        expect(message?.status).toBe('sent');
        expect(result.current.isSending).toBe(false);
      });
    });

    it('should handle message sending errors and allow retry', async () => {
      const mockSession: ChatSession = {
        id: 'session-1',
        user_id: 'user-1',
        customer_id: 'customer-1',
        title: 'Test Session',
        status: 'active',
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: null,
        closed_at: null,
      };

      vi.mocked(apiClient.post).mockRejectedValueOnce(
        new Error('Network error')
      );

      const { result } = renderHook(() => useChatStore());

      // Set up session
      act(() => {
        result.current.addSession(mockSession);
        result.current.setActiveSession('session-1');
      });

      await act(async () => {
        try {
          await result.current.sendMessage('Failed message');
        } catch (error) {
          // Expected to throw
        }
      });

      await waitFor(() => {
        const message = result.current.messages.find(
          m => m.content === 'Failed message'
        );
        expect(message?.status).toBe('error');
        expect(message?.error).toBe('Network error');
      });

      // Now test retry
      const mockMessage: ChatMessage = {
        id: 'msg-1',
        session_id: 'session-1',
        role: 'user',
        content: 'Failed message',
        metadata: null,
        created_at: new Date().toISOString(),
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce({ data: mockMessage });

      const failedMessage = result.current.messages.find(
        m => m.content === 'Failed message'
      );

      await act(async () => {
        await result.current.retryMessage(failedMessage!.id);
      });

      await waitFor(() => {
        const retriedMessage = result.current.messages.find(
          m => m.content === 'Failed message'
        );
        expect(retriedMessage?.status).toBe('sent');
        expect(retriedMessage?.error).toBeUndefined();
      });
    });

    it('should load message history for a session from API', async () => {
      const mockMessages: ChatMessage[] = [
        {
          id: 'msg-1',
          session_id: 'session-1',
          role: 'user',
          content: 'Historical message 1',
          metadata: null,
          created_at: new Date().toISOString(),
        },
        {
          id: 'msg-2',
          session_id: 'session-1',
          role: 'assistant',
          content: 'Historical response 1',
          metadata: null,
          created_at: new Date().toISOString(),
        },
      ];

      const mockSession = {
        id: 'session-1',
        user_id: 'user-1',
        customer_id: 'customer-1',
        title: 'Test Session',
        status: 'active' as const,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: null,
        closed_at: null,
        messages: mockMessages,
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockSession });

      const { result } = renderHook(() => useChatStore());

      await act(async () => {
        await result.current.loadSession('session-1');
      });

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith(
          '/api/chat/sessions/session-1'
        );
        expect(result.current.messages).toEqual(mockMessages);
        expect(result.current.messagesLoading).toBe(false);
        expect(result.current.messagesError).toBeNull();
      });
    });

    it('should clear messages when switching sessions', async () => {
      const { result } = renderHook(() => useChatStore());

      // Add some messages to current state
      act(() => {
        result.current.addMessage({
          id: 'msg-1',
          session_id: 'session-1',
          role: 'user',
          content: 'Old message',
          metadata: null,
          created_at: new Date().toISOString(),
        });
      });

      expect(result.current.messages).toHaveLength(1);

      // Switch to a new session
      const newSession = {
        id: 'session-2',
        user_id: 'user-1',
        customer_id: 'customer-1',
        title: 'New Session',
        status: 'active' as const,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: null,
        closed_at: null,
        messages: [],
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: newSession });

      await act(async () => {
        await result.current.loadSession('session-2');
      });

      await waitFor(() => {
        expect(result.current.messages).toEqual([]);
        expect(result.current.activeSessionId).toBe('session-2');
      });
    });

    it('should handle streaming messages from API', async () => {
      const mockSession: ChatSession = {
        id: 'session-1',
        user_id: 'user-1',
        customer_id: 'customer-1',
        title: 'Test Session',
        status: 'active',
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: null,
        closed_at: null,
      };

      // Mock streaming response
      const encoder = new TextEncoder();
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"content":"Hello"}\n\n'));
          controller.enqueue(
            encoder.encode('data: {"content":"Hello world"}\n\n')
          );
          controller.enqueue(encoder.encode('data: {"done":true}\n\n'));
          controller.close();
        },
      });

      vi.mocked(apiClient.post).mockResolvedValue({
        data: { stream: mockStream },
      });

      const { result } = renderHook(() => useChatStore());

      // Set up session
      act(() => {
        result.current.addSession(mockSession);
        result.current.setActiveSession('session-1');
      });

      await act(async () => {
        await result.current.sendMessageWithStream('Stream test');
      });

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          '/api/chat/sessions/session-1/messages',
          { content: 'Stream test', stream: true }
        );
      });
    });

    it('should replace temporary messages with server records during streaming', async () => {
      const mockSession: ChatSession = {
        id: 'session-1',
        user_id: 'user-1',
        customer_id: 'customer-1',
        title: 'Test Session',
        status: 'active',
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: null,
        closed_at: null,
      };

      // Mock streaming response with message IDs
      const encoder = new TextEncoder();
      const mockStream = new ReadableStream({
        start(controller) {
          // First, send the real message IDs
          controller.enqueue(
            encoder.encode(
              'data: {"userMessageId":"real-user-msg-id","assistantMessageId":"real-assistant-msg-id"}\n\n'
            )
          );
          // Then send content updates
          controller.enqueue(encoder.encode('data: {"content":"Hello"}\n\n'));
          controller.enqueue(
            encoder.encode('data: {"content":"Hello world"}\n\n')
          );
          controller.enqueue(encoder.encode('data: {"done":true}\n\n'));
          controller.close();
        },
      });

      vi.mocked(apiClient.post).mockResolvedValue({
        data: { stream: mockStream },
      });

      const { result } = renderHook(() => useChatStore());

      // Set up session
      act(() => {
        result.current.addSession(mockSession);
        result.current.setActiveSession('session-1');
      });

      // Send message with streaming
      await act(async () => {
        await result.current.sendMessageWithStream('Test message');
      });

      // Wait for streaming to complete
      await waitFor(() => {
        const messages = result.current.messages;
        // Should have exactly 2 messages (user and assistant)
        expect(messages).toHaveLength(2);

        // Check that temporary IDs have been replaced with real IDs
        const userMessage = messages.find(m => m.role === 'user');
        const assistantMessage = messages.find(m => m.role === 'assistant');

        expect(userMessage?.id).toBe('real-user-msg-id');
        expect(userMessage?.content).toBe('Test message');
        expect(userMessage?.status).toBe('sent');

        expect(assistantMessage?.id).toBe('real-assistant-msg-id');
        expect(assistantMessage?.content).toBe('Hello world');
        expect(assistantMessage?.status).toBe('sent');

        // Verify no temporary IDs remain
        const hasTemporaryIds = messages.some(
          m => m.id.startsWith('temp-') || m.id.startsWith('assistant-')
        );
        expect(hasTemporaryIds).toBe(false);
      });
    });

    it('should handle streaming without real message IDs (fallback)', async () => {
      const mockSession: ChatSession = {
        id: 'session-1',
        user_id: 'user-1',
        customer_id: 'customer-1',
        title: 'Test Session',
        status: 'active',
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: null,
        closed_at: null,
      };

      // Mock streaming response WITHOUT message IDs (fallback scenario)
      const encoder = new TextEncoder();
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"content":"Hello"}\n\n'));
          controller.enqueue(
            encoder.encode('data: {"content":"Hello world"}\n\n')
          );
          controller.enqueue(encoder.encode('data: {"done":true}\n\n'));
          controller.close();
        },
      });

      vi.mocked(apiClient.post).mockResolvedValue({
        data: { stream: mockStream },
      });

      const { result } = renderHook(() => useChatStore());

      // Set up session
      act(() => {
        result.current.addSession(mockSession);
        result.current.setActiveSession('session-1');
      });

      // Send message with streaming
      await act(async () => {
        await result.current.sendMessageWithStream('Test message');
      });

      // Wait for streaming to complete
      await waitFor(() => {
        const messages = result.current.messages;
        // Should have exactly 2 messages (user and assistant)
        expect(messages).toHaveLength(2);

        const userMessage = messages.find(m => m.role === 'user');
        const assistantMessage = messages.find(m => m.role === 'assistant');

        // In fallback mode, temporary IDs are kept but marked as sent
        expect(userMessage?.id).toMatch(/^temp-\d+$/);
        expect(userMessage?.content).toBe('Test message');
        expect(userMessage?.status).toBe('sent');

        expect(assistantMessage?.id).toMatch(/^assistant-\d+$/);
        expect(assistantMessage?.content).toBe('Hello world');
        expect(assistantMessage?.status).toBe('sent');
      });
    });
  });

  describe('Device Actions Management', () => {
    it('should approve device actions via API', async () => {
      const mockAction = {
        id: 'action-1',
        session_id: 'session-1',
        message_id: 'msg-1',
        device_id: 'device-1',
        action_type: 'command' as const,
        command: 'ping 8.8.8.8',
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

      vi.mocked(apiClient.post).mockResolvedValue({
        data: {
          ...mockAction,
          status: 'approved',
          approved_at: new Date().toISOString(),
        },
      });

      const { result } = renderHook(() => useChatStore());

      // Add action
      act(() => {
        result.current.addDeviceAction(mockAction);
      });

      await act(async () => {
        await result.current.approveActionWithAPI('action-1');
      });

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          '/api/device-actions/action-1/approve'
        );

        const action = result.current.deviceActions.find(
          a => a.id === 'action-1'
        );
        expect(action?.status).toBe('approved');
      });
    });

    it('should reject device actions via API', async () => {
      const mockAction = {
        id: 'action-1',
        session_id: 'session-1',
        message_id: 'msg-1',
        device_id: 'device-1',
        action_type: 'command' as const,
        command: 'rm -rf /',
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

      vi.mocked(apiClient.post).mockResolvedValue({
        data: {
          ...mockAction,
          status: 'rejected',
          rejected_at: new Date().toISOString(),
        },
      });

      const { result } = renderHook(() => useChatStore());

      // Add action
      act(() => {
        result.current.addDeviceAction(mockAction);
      });

      await act(async () => {
        await result.current.rejectActionWithAPI('action-1');
      });

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          '/api/device-actions/action-1/reject'
        );

        const action = result.current.deviceActions.find(
          a => a.id === 'action-1'
        );
        expect(action?.status).toBe('rejected');
      });
    });
  });

  describe('WebSocket Integration', () => {
    it('should handle incoming messages via WebSocket', () => {
      const { result } = renderHook(() => useChatStore());

      const mockMessage: ChatMessage = {
        id: 'msg-ws-1',
        session_id: 'session-1',
        role: 'assistant',
        content: 'WebSocket message',
        metadata: null,
        created_at: new Date().toISOString(),
      };

      act(() => {
        result.current.setActiveSession('session-1');
        result.current.handleWebSocketMessage({
          type: 'chat:message',
          sessionId: 'session-1',
          data: mockMessage,
        });
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0]).toEqual(mockMessage);
    });

    it('should handle WebSocket connection state', () => {
      const { result } = renderHook(() => useChatStore());

      expect(result.current.isConnected).toBe(false);

      act(() => {
        result.current.setConnected(true);
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.connectionError).toBeNull();

      act(() => {
        result.current.setConnectionError('Connection lost');
      });

      expect(result.current.connectionError).toBe('Connection lost');
    });

    it('should handle WebSocket reconnection and resync', async () => {
      const mockMessages: ChatMessage[] = [
        {
          id: 'msg-1',
          session_id: 'session-1',
          role: 'user',
          content: 'Message during disconnect',
          metadata: null,
          created_at: new Date().toISOString(),
        },
      ];

      const mockSession = {
        id: 'session-1',
        user_id: 'user-1',
        customer_id: 'customer-1',
        title: 'Test Session',
        status: 'active' as const,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: null,
        closed_at: null,
        messages: mockMessages,
      };

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockSession });

      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setActiveSession('session-1');
        result.current.setConnected(false);
      });

      // Simulate reconnection
      await act(async () => {
        result.current.setConnected(true);
        await result.current.resyncOnReconnect();
      });

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith(
          '/api/chat/sessions/session-1'
        );
        expect(result.current.messages).toEqual(mockMessages);
      });
    });

    it('should update device action status via WebSocket', () => {
      const { result } = renderHook(() => useChatStore());

      const mockAction = {
        id: 'action-1',
        session_id: 'session-1',
        message_id: 'msg-1',
        device_id: 'device-1',
        action_type: 'command' as const,
        command: 'ping 8.8.8.8',
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

      act(() => {
        result.current.addDeviceAction(mockAction);
      });

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

      const action = result.current.deviceActions.find(
        a => a.id === 'action-1'
      );
      expect(action?.status).toBe('executing');
      expect(action?.executed_at).toBeDefined();
    });
  });

  describe('UI State Management', () => {
    it('should track typing indicator state with timeout', () => {
      vi.useFakeTimers();
      const { result } = renderHook(() => useChatStore());

      expect(result.current.isTyping).toBe(false);

      act(() => {
        result.current.setTyping(true);
      });

      expect(result.current.isTyping).toBe(true);

      // Should auto-reset after 3 seconds
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(result.current.isTyping).toBe(false);

      vi.useRealTimers();
    });

    it('should manage device action modal visibility', () => {
      const { result } = renderHook(() => useChatStore());

      expect(result.current.deviceModalOpen).toBe(false);

      act(() => {
        result.current.setDeviceModalOpen(true);
        result.current.setSelectedAction('action-1');
      });

      expect(result.current.deviceModalOpen).toBe(true);
      expect(result.current.selectedActionId).toBe('action-1');

      act(() => {
        result.current.setDeviceModalOpen(false);
        result.current.setSelectedAction(null);
      });

      expect(result.current.deviceModalOpen).toBe(false);
      expect(result.current.selectedActionId).toBeNull();
    });

    it('should track message sending state', async () => {
      const mockSession: ChatSession = {
        id: 'session-1',
        user_id: 'user-1',
        customer_id: 'customer-1',
        title: 'Test Session',
        status: 'active',
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: null,
        closed_at: null,
      };

      vi.mocked(apiClient.post).mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(
              () =>
                resolve({
                  data: {
                    id: 'msg-1',
                    session_id: 'session-1',
                    role: 'user' as const,
                    content: 'Test',
                    metadata: null,
                    created_at: new Date().toISOString(),
                  },
                }),
              100
            )
          )
      );

      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.addSession(mockSession);
        result.current.setActiveSession('session-1');
      });

      expect(result.current.isSending).toBe(false);

      // Start sending but don't await yet
      let sendPromise: Promise<void> | undefined;
      act(() => {
        sendPromise = result.current.sendMessage('Test');
      });

      // Check sending state immediately after starting
      await waitFor(() => {
        expect(result.current.isSending).toBe(true);
      });

      await act(async () => {
        await sendPromise;
      });

      await waitFor(() => {
        expect(result.current.isSending).toBe(false);
      });
    });

    it('should track unread message count', () => {
      const { result } = renderHook(() => useChatStore());

      expect(result.current.unreadCount).toBe(0);

      act(() => {
        result.current.incrementUnread();
        result.current.incrementUnread();
      });

      expect(result.current.unreadCount).toBe(2);

      act(() => {
        result.current.resetUnread();
      });

      expect(result.current.unreadCount).toBe(0);
    });
  });

  describe('Store Reset', () => {
    it('should reset all chat state to initial values', () => {
      const { result } = renderHook(() => useChatStore());

      // Populate store with data
      act(() => {
        result.current.addSession({
          id: 'session-1',
          user_id: 'user-1',
          customer_id: 'customer-1',
          title: 'Test Session',
          status: 'active',
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: null,
          closed_at: null,
        });
        result.current.setActiveSession('session-1');
        result.current.addMessage({
          id: 'msg-1',
          session_id: 'session-1',
          role: 'user',
          content: 'Test',
          metadata: null,
          created_at: new Date().toISOString(),
        });
        result.current.setConnected(true);
        result.current.incrementUnread();
      });

      // Verify data is present
      expect(result.current.sessions).toHaveLength(1);
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.activeSessionId).toBe('session-1');
      expect(result.current.isConnected).toBe(true);
      expect(result.current.unreadCount).toBe(1);

      // Reset store
      act(() => {
        result.current.reset();
      });

      // Verify everything is reset
      expect(result.current.sessions).toEqual([]);
      expect(result.current.messages).toEqual([]);
      expect(result.current.activeSessionId).toBeNull();
      expect(result.current.isConnected).toBe(false);
      expect(result.current.unreadCount).toBe(0);
      expect(result.current.deviceActions).toEqual([]);
      expect(result.current.pendingActions).toEqual([]);
    });

    it('should clear all messages and actions on resetMessages', () => {
      const { result } = renderHook(() => useChatStore());

      // Populate messages and actions
      act(() => {
        result.current.addMessage({
          id: 'msg-1',
          session_id: 'session-1',
          role: 'user',
          content: 'Test',
          metadata: null,
          created_at: new Date().toISOString(),
        });
        result.current.addDeviceAction({
          id: 'action-1',
          session_id: 'session-1',
          message_id: 'msg-1',
          device_id: 'device-1',
          action_type: 'command',
          command: 'test',
          metadata: {},
          status: 'pending',
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
        });
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.deviceActions).toHaveLength(1);
      expect(result.current.pendingActions).toHaveLength(1);

      // Reset messages only
      act(() => {
        result.current.resetMessages();
      });

      expect(result.current.messages).toEqual([]);
      expect(result.current.deviceActions).toEqual([]);
      expect(result.current.pendingActions).toEqual([]);
    });
  });

  describe('API Error Handling', () => {
    it('should handle session creation errors', async () => {
      vi.mocked(apiClient.post).mockRejectedValue(
        new Error('Failed to create session')
      );

      const { result } = renderHook(() => useChatStore());

      await act(async () => {
        try {
          await result.current.createSession('New Session');
        } catch (error) {
          // Expected to throw
        }
      });

      await waitFor(() => {
        expect(result.current.sessionsError).toBe('Failed to create session');
        expect(result.current.sessions).toEqual([]);
      });
    });

    it('should handle message loading errors', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(
        new Error('Failed to load messages')
      );

      const { result } = renderHook(() => useChatStore());

      await act(async () => {
        await result.current.loadSession('session-1');
      });

      await waitFor(() => {
        expect(result.current.messagesError).toBe('Failed to load messages');
        expect(result.current.messagesLoading).toBe(false);
      });
    });

    it('should handle pagination for sessions', async () => {
      const mockSessions: ChatSession[] = Array.from({ length: 5 }, (_, i) => ({
        id: `session-${i}`,
        user_id: 'user-1',
        customer_id: 'customer-1',
        title: `Session ${i}`,
        status: 'active',
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: null,
        closed_at: null,
      }));

      vi.mocked(apiClient.get).mockResolvedValue({ data: mockSessions });

      const { result } = renderHook(() => useChatStore());

      await act(async () => {
        await result.current.loadSessions({ limit: 5, offset: 0 });
      });

      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith(
          '/api/chat/sessions?limit=5&offset=0'
        );
        expect(result.current.sessions).toHaveLength(5);
      });
    });
  });
});
