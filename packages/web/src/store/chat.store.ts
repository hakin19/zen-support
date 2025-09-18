import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import { apiClient } from '../lib/api-client';

import type { Database } from '@aizen/shared';

type ChatSession = Database['public']['Tables']['chat_sessions']['Row'];
type ChatMessage = Database['public']['Tables']['chat_messages']['Row'];
type DeviceAction = Database['public']['Tables']['device_actions']['Row'];

export interface MessageWithStatus extends ChatMessage {
  status?: 'sending' | 'sent' | 'error';
  error?: string;
}

export interface DeviceActionWithStatus extends DeviceAction {
  isExecuting?: boolean;
  output?: string[];
}

interface LoadSessionOptions {
  status?: 'active' | 'closed' | 'archived';
  limit?: number;
  offset?: number;
}

interface WebSocketMessage {
  type: string;
  sessionId?: string;
  data: unknown;
}

interface ChatState {
  // Sessions
  sessions: ChatSession[];
  activeSessionId: string | null;
  getCurrentSession: () => ChatSession | null;
  sessionsLoading: boolean;
  sessionsError: string | null;

  // Messages
  messages: MessageWithStatus[];
  messagesLoading: boolean;
  messagesError: string | null;

  // Device Actions
  deviceActions: DeviceActionWithStatus[];
  pendingActions: DeviceActionWithStatus[];

  // UI State
  isTyping: boolean;
  typingTimeout: NodeJS.Timeout | null;
  isSending: boolean;
  deviceModalOpen: boolean;
  selectedActionId: string | null;
  unreadCount: number;

  // WebSocket State
  isConnected: boolean;
  connectionError: string | null;

  // Session Actions
  setSessions: (sessions: ChatSession[]) => void;
  addSession: (session: ChatSession) => void;
  updateSession: (id: string, updates: Partial<ChatSession>) => void;
  setActiveSession: (id: string | null) => void;
  archiveSession: (id: string) => void;
  deleteSession: (id: string) => void;
  createSession: (title?: string) => Promise<void>;
  loadSessions: (options?: LoadSessionOptions) => Promise<void>;
  loadSession: (id: string) => Promise<void>;
  archiveSessionWithAPI: (id: string) => Promise<void>;

  // Message Actions
  setMessages: (messages: MessageWithStatus[]) => void;
  addMessage: (message: MessageWithStatus) => void;
  updateMessage: (id: string, updates: Partial<MessageWithStatus>) => void;
  deleteMessage: (id: string) => void;
  sendMessage: (content: string) => Promise<void>;
  sendMessageWithStream: (content: string) => Promise<void>;
  retryMessage: (id: string) => Promise<void>;

  // Device Action Actions
  setDeviceActions: (actions: DeviceActionWithStatus[]) => void;
  addDeviceAction: (action: DeviceActionWithStatus) => void;
  addDeviceActionForMessage: (
    action: Omit<DeviceActionWithStatus, 'message_id'>,
    messageId: string
  ) => void;
  updateDeviceAction: (
    id: string,
    updates: Partial<DeviceActionWithStatus>
  ) => void;
  approveAction: (id: string) => Promise<void>;
  rejectAction: (id: string) => Promise<void>;
  approveActionWithAPI: (id: string) => Promise<void>;
  rejectActionWithAPI: (id: string) => Promise<void>;
  addActionOutput: (id: string, output: string) => void;

  // UI Actions
  setTyping: (isTyping: boolean) => void;
  setSending: (isSending: boolean) => void;
  setDeviceModalOpen: (open: boolean) => void;
  setSelectedAction: (id: string | null) => void;
  incrementUnread: () => void;
  resetUnread: () => void;

  // WebSocket Actions
  setConnected: (connected: boolean) => void;
  setConnectionError: (error: string | null) => void;
  handleWebSocketMessage: (message: WebSocketMessage) => void;
  resyncOnReconnect: () => Promise<void>;

  // Loading State Actions
  setSessionsLoading: (loading: boolean) => void;
  setSessionsError: (error: string | null) => void;
  setMessagesLoading: (loading: boolean) => void;
  setMessagesError: (error: string | null) => void;

  // Reset
  reset: () => void;
  resetMessages: () => void;
}

const initialState = {
  sessions: [] as ChatSession[],
  activeSessionId: null,
  sessionsLoading: false,
  sessionsError: null,
  messages: [] as MessageWithStatus[],
  messagesLoading: false,
  messagesError: null,
  deviceActions: [] as DeviceActionWithStatus[],
  pendingActions: [] as DeviceActionWithStatus[],
  isTyping: false,
  typingTimeout: null,
  isSending: false,
  deviceModalOpen: false,
  selectedActionId: null,
  unreadCount: 0,
  isConnected: false,
  connectionError: null,
};

export const useChatStore = create<ChatState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // Computed function for current session
      getCurrentSession: (): ChatSession | null => {
        const state = get();
        const found = state.sessions.find(
          (s: ChatSession) => s.id === state.activeSessionId
        );
        return found ?? null;
      },

      // Session Actions
      setSessions: sessions => set({ sessions }, false, 'setSessions'),

      addSession: (session: ChatSession) =>
        set(
          state => ({
            sessions: [session, ...state.sessions],
          }),
          false,
          'addSession'
        ),

      updateSession: (id: string, updates: Partial<ChatSession>) =>
        set(
          state => ({
            sessions: state.sessions.map((s: ChatSession) =>
              s.id === id ? { ...s, ...updates } : s
            ),
          }),
          false,
          'updateSession'
        ),

      setActiveSession: id =>
        set({ activeSessionId: id }, false, 'setActiveSession'),

      archiveSession: (id: string) =>
        set(
          state => ({
            sessions: state.sessions.map((s: ChatSession) =>
              s.id === id ? { ...s, status: 'archived' as const } : s
            ),
          }),
          false,
          'archiveSession'
        ),

      deleteSession: (id: string) =>
        set(
          state => ({
            sessions: state.sessions.filter((s: ChatSession) => s.id !== id),
            activeSessionId:
              state.activeSessionId === id ? null : state.activeSessionId,
          }),
          false,
          'deleteSession'
        ),

      // New API methods for sessions
      createSession: async (title?: string) => {
        try {
          get().setSessionsLoading(true);
          get().setSessionsError(null);

          const { data: session } = await apiClient.post<ChatSession>(
            '/api/chat/sessions',
            { title }
          );

          get().addSession(session);
          get().setActiveSession(session.id);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to create session';
          get().setSessionsError(errorMessage);
          throw error;
        } finally {
          get().setSessionsLoading(false);
        }
      },

      loadSessions: async (options?: LoadSessionOptions) => {
        try {
          get().setSessionsLoading(true);
          get().setSessionsError(null);

          const params = new URLSearchParams();
          if (options?.status) params.append('status', options.status);
          if (options?.limit) params.append('limit', options.limit.toString());
          if (options?.offset !== undefined)
            params.append('offset', options.offset.toString());

          const queryString = params.toString();
          const url = queryString
            ? `/api/chat/sessions?${queryString}`
            : '/api/chat/sessions';

          const { data: sessions } = await apiClient.get<ChatSession[]>(url);
          get().setSessions(sessions);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to load sessions';
          get().setSessionsError(errorMessage);
        } finally {
          get().setSessionsLoading(false);
        }
      },

      loadSession: async (id: string) => {
        try {
          get().setMessagesLoading(true);
          get().setMessagesError(null);

          const { data: sessionWithMessages } = await apiClient.get<
            ChatSession & { messages: ChatMessage[] }
          >(`/api/chat/sessions/${id}`);

          const { messages, ...session } = sessionWithMessages;

          // Update or add the session
          const existingSession = get().sessions.find(s => s.id === id);
          if (existingSession) {
            get().updateSession(id, session);
          } else {
            get().addSession(session);
          }

          get().setActiveSession(id);
          get().setMessages(messages || []);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to load messages';
          get().setMessagesError(errorMessage);
        } finally {
          get().setMessagesLoading(false);
        }
      },

      archiveSessionWithAPI: async (id: string) => {
        const { data: updatedSession } = await apiClient.patch<ChatSession>(
          `/api/chat/sessions/${id}`,
          { status: 'archived' }
        );

        get().updateSession(id, updatedSession);
      },

      // Message Actions
      setMessages: messages => set({ messages }, false, 'setMessages'),

      addMessage: message =>
        set(
          state => ({
            messages: [...state.messages, message],
          }),
          false,
          'addMessage'
        ),

      updateMessage: (id, updates) =>
        set(
          state => ({
            messages: state.messages.map(m =>
              m.id === id ? { ...m, ...updates } : m
            ),
          }),
          false,
          'updateMessage'
        ),

      deleteMessage: id =>
        set(
          state => ({
            messages: state.messages.filter(m => m.id !== id),
          }),
          false,
          'deleteMessage'
        ),

      sendMessage: async (content: string) => {
        const tempId = `temp-${Date.now()}`;
        const sessionId = get().activeSessionId;

        if (!sessionId) {
          throw new Error('No active session');
        }

        const message: MessageWithStatus = {
          id: tempId,
          session_id: sessionId,
          role: 'user' as Database['public']['Enums']['message_role'],
          content,
          created_at: new Date().toISOString(),
          metadata: null,
          status: 'sending',
        };

        get().addMessage(message);
        get().setSending(true);

        try {
          const { data: sentMessage } = await apiClient.post<ChatMessage>(
            `/api/chat/sessions/${sessionId}/messages`,
            { content, stream: false }
          );

          // Replace temp message with real message
          get().deleteMessage(tempId);
          get().addMessage({
            ...sentMessage,
            status: 'sent',
          });
        } catch (error) {
          get().updateMessage(tempId, {
            status: 'error',
            error:
              error instanceof Error ? error.message : 'Failed to send message',
          });
          throw error;
        } finally {
          get().setSending(false);
        }
      },

      sendMessageWithStream: async (content: string) => {
        const tempUserMessageId = `temp-${Date.now()}`;
        const sessionId = get().activeSessionId;

        if (!sessionId) {
          throw new Error('No active session');
        }

        const tempUserMessage: MessageWithStatus = {
          id: tempUserMessageId,
          session_id: sessionId,
          role: 'user' as Database['public']['Enums']['message_role'],
          content,
          created_at: new Date().toISOString(),
          metadata: null,
          status: 'sending',
        };

        get().addMessage(tempUserMessage);
        get().setSending(true);

        try {
          // The API returns the bare chat_messages row, not a stream object
          // We'll send the message and rely on WebSocket broadcasts for the AI response
          const { data: userMessage } = await apiClient.post<ChatMessage>(
            `/api/chat/sessions/${sessionId}/messages`,
            { content, stream: true }
          );

          // Replace temp user message with real one from server
          get().deleteMessage(tempUserMessageId);
          get().addMessage({
            ...userMessage,
            status: 'sent',
          });

          // The AI response will arrive via WebSocket broadcast
          // No need for streaming setup here since the API doesn't support it this way
          // The server processes AI response asynchronously and broadcasts it

          // Note: If we want true streaming, we need to:
          // 1. First POST to create the message (done above)
          // 2. Then open an EventSource to /api/chat/sessions/:id/stream
          // This would be a separate implementation using SSE, not part of this POST

          // For now, we'll rely on the WebSocket broadcast which is already working
          // The handleWebSocketMessage method will receive and display the AI response
        } catch (error) {
          get().updateMessage(tempUserMessageId, {
            status: 'error',
            error:
              error instanceof Error ? error.message : 'Failed to send message',
          });
          throw error;
        } finally {
          get().setSending(false);
        }
      },

      retryMessage: async (id: string) => {
        const message = get().messages.find(m => m.id === id);
        if (!message?.session_id) return;

        get().updateMessage(id, { status: 'sending', error: undefined });

        try {
          const { data: sentMessage } = await apiClient.post<ChatMessage>(
            `/api/chat/sessions/${message.session_id}/messages`,
            { content: message.content, stream: false }
          );

          // Replace failed message with successful message
          get().deleteMessage(id);
          get().addMessage({
            ...sentMessage,
            status: 'sent',
          });
        } catch (error) {
          get().updateMessage(id, {
            status: 'error',
            error:
              error instanceof Error ? error.message : 'Failed to send message',
          });
          throw error;
        }
      },

      // Device Action Actions
      setDeviceActions: actions => {
        const pending = actions.filter(a => a.status === 'pending');
        set(
          {
            deviceActions: actions,
            pendingActions: pending,
          },
          false,
          'setDeviceActions'
        );
      },

      addDeviceAction: action => {
        set(
          state => {
            const newActions = [...state.deviceActions, action];
            const pending =
              action.status === 'pending'
                ? [...state.pendingActions, action]
                : state.pendingActions;

            return {
              deviceActions: newActions,
              pendingActions: pending,
            };
          },
          false,
          'addDeviceAction'
        );
      },

      addDeviceActionForMessage: (action, messageId) => {
        const actionWithMessageId = {
          ...action,
          message_id: messageId,
        } as DeviceActionWithStatus;

        set(
          state => {
            const newActions = [...state.deviceActions, actionWithMessageId];
            const pending =
              actionWithMessageId.status === 'pending'
                ? [...state.pendingActions, actionWithMessageId]
                : state.pendingActions;

            return {
              deviceActions: newActions,
              pendingActions: pending,
            };
          },
          false,
          'addDeviceActionForMessage'
        );
      },

      updateDeviceAction: (id, updates) => {
        set(
          state => {
            const deviceActions = state.deviceActions.map(a =>
              a.id === id ? { ...a, ...updates } : a
            );

            const pendingActions = deviceActions.filter(
              a => a.status === 'pending'
            );

            return { deviceActions, pendingActions };
          },
          false,
          'updateDeviceAction'
        );
      },

      approveAction: async (id: string) => {
        // Store original state for rollback
        const originalAction = get().deviceActions.find(a => a.id === id);

        // Optimistic update
        get().updateDeviceAction(id, {
          status: 'approved' as const,
          approved_at: new Date().toISOString(),
          approved_by: 'current-user', // Get from auth
        });

        try {
          // API call would go here
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          // Rollback to original state
          if (originalAction) {
            get().updateDeviceAction(id, {
              status: originalAction.status,
              approved_at: originalAction.approved_at,
              approved_by: originalAction.approved_by,
            });
          }
          throw error;
        }
      },

      rejectAction: async (id: string) => {
        // Store original state for rollback
        const originalAction = get().deviceActions.find(a => a.id === id);

        // Optimistic update
        get().updateDeviceAction(id, {
          status: 'rejected' as const,
          rejected_at: new Date().toISOString(),
          rejected_by: 'current-user', // Get from auth
        });

        try {
          // API call would go here
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          // Rollback to original state
          if (originalAction) {
            get().updateDeviceAction(id, {
              status: originalAction.status,
              rejected_at: originalAction.rejected_at,
              rejected_by: originalAction.rejected_by,
            });
          }
          throw error;
        }
      },

      // New API methods for device actions
      approveActionWithAPI: async (id: string) => {
        const { data: updatedAction } = await apiClient.post<DeviceAction>(
          `/api/device-actions/${id}/approve`
        );

        get().updateDeviceAction(id, updatedAction);
      },

      rejectActionWithAPI: async (id: string) => {
        const { data: updatedAction } = await apiClient.post<DeviceAction>(
          `/api/device-actions/${id}/reject`
        );

        get().updateDeviceAction(id, updatedAction);
      },

      addActionOutput: (id, output) => {
        set(
          state => ({
            deviceActions: state.deviceActions.map(a =>
              a.id === id ? { ...a, output: [...(a.output ?? []), output] } : a
            ),
          }),
          false,
          'addActionOutput'
        );
      },

      // UI Actions
      setTyping: isTyping => {
        const currentTimeout = get().typingTimeout;

        if (currentTimeout) {
          clearTimeout(currentTimeout);
        }

        if (isTyping) {
          const timeout = setTimeout(() => {
            get().setTyping(false);
          }, 3000);

          set({ isTyping, typingTimeout: timeout }, false, 'setTyping');
        } else {
          set({ isTyping, typingTimeout: null }, false, 'setTyping');
        }
      },

      setSending: isSending => set({ isSending }, false, 'setSending'),

      setDeviceModalOpen: open =>
        set({ deviceModalOpen: open }, false, 'setDeviceModalOpen'),

      setSelectedAction: id =>
        set({ selectedActionId: id }, false, 'setSelectedAction'),

      incrementUnread: () =>
        set(
          state => ({ unreadCount: state.unreadCount + 1 }),
          false,
          'incrementUnread'
        ),

      resetUnread: () => set({ unreadCount: 0 }, false, 'resetUnread'),

      // WebSocket Actions
      setConnected: connected =>
        set({ isConnected: connected }, false, 'setConnected'),

      setConnectionError: error =>
        set({ connectionError: error }, false, 'setConnectionError'),

      handleWebSocketMessage: (message: WebSocketMessage) => {
        const state = get();

        switch (message.type) {
          case 'chat:message':
            // Add new message if it's for the active session
            if (message.sessionId === state.activeSessionId && message.data) {
              const chatMessage = message.data as ChatMessage;
              // Only add if message doesn't already exist
              if (!state.messages.find(m => m.id === chatMessage.id)) {
                get().addMessage(chatMessage);
              }
            }
            break;

          case 'device:action:update':
            // Update device action status
            if (message.data && typeof message.data === 'object') {
              const update = message.data as Partial<DeviceAction> & {
                id: string;
              };
              if (update.id) {
                get().updateDeviceAction(update.id, update);
              }
            }
            break;

          case 'session:update':
            // Update session status
            if (message.data && typeof message.data === 'object') {
              const sessionUpdate = message.data as Partial<ChatSession> & {
                id: string;
              };
              if (sessionUpdate.id) {
                get().updateSession(sessionUpdate.id, sessionUpdate);
              }
            }
            break;

          default:
            break;
        }
      },

      resyncOnReconnect: async () => {
        const activeSessionId = get().activeSessionId;
        if (activeSessionId) {
          // Reload the current session to get any messages we might have missed
          await get().loadSession(activeSessionId);
        }
      },

      // Loading State Actions
      setSessionsLoading: loading =>
        set({ sessionsLoading: loading }, false, 'setSessionsLoading'),

      setSessionsError: error =>
        set({ sessionsError: error }, false, 'setSessionsError'),

      setMessagesLoading: loading =>
        set({ messagesLoading: loading }, false, 'setMessagesLoading'),

      setMessagesError: error =>
        set({ messagesError: error }, false, 'setMessagesError'),

      // Reset Actions
      reset: () => {
        const currentTimeout = get().typingTimeout;
        if (currentTimeout) {
          clearTimeout(currentTimeout);
        }
        set(initialState, false, 'reset');
      },

      resetMessages: () =>
        set(
          {
            messages: [],
            deviceActions: [],
            pendingActions: [],
          },
          false,
          'resetMessages'
        ),
    }),
    { name: 'chat-store' }
  )
);
