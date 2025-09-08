import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

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

interface ChatState {
  // Sessions
  sessions: ChatSession[];
  activeSessionId: string | null;
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
  typingTimeout: ReturnType<typeof setTimeout> | null;
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

  // Message Actions
  setMessages: (messages: MessageWithStatus[]) => void;
  addMessage: (message: MessageWithStatus) => void;
  updateMessage: (id: string, updates: Partial<MessageWithStatus>) => void;
  deleteMessage: (id: string) => void;
  sendMessage: (content: string) => Promise<void>;
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

      // Session Actions
      setSessions: sessions => set({ sessions }, false, 'setSessions'),

      addSession: session =>
        set(
          state => ({
            sessions: [session, ...state.sessions],
          }),
          false,
          'addSession'
        ),

      updateSession: (id, updates) =>
        set(
          state => ({
            sessions: state.sessions.map(s =>
              (s.id as string) === id ? { ...s, ...updates } : s
            ),
          }),
          false,
          'updateSession'
        ),

      setActiveSession: id =>
        set({ activeSessionId: id }, false, 'setActiveSession'),

      archiveSession: id =>
        set(
          state => ({
            sessions: state.sessions.map(s =>
              (s.id as string) === id
                ? { ...s, status: 'archived' as const }
                : s
            ),
          }),
          false,
          'archiveSession'
        ),

      deleteSession: id =>
        set(
          state => ({
            sessions: state.sessions.filter(s => (s.id as string) !== id),
            activeSessionId:
              state.activeSessionId === id ? null : state.activeSessionId,
          }),
          false,
          'deleteSession'
        ),

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
          role: 'user',
          content,
          created_at: new Date().toISOString(),
          metadata: null,
          status: 'sending',
        };

        get().addMessage(message);
        get().setSending(true);

        try {
          // API call would go here
          // const response = await api.sendMessage(content);

          // Simulate API call
          await new Promise(resolve => setTimeout(resolve, 500));

          get().updateMessage(tempId, {
            status: 'sent',
            // id: response.id, // Update with real ID from server
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

      retryMessage: async (id: string) => {
        const message = get().messages.find(m => m.id === id);
        if (!message) return;

        get().updateMessage(id, { status: 'sending', error: undefined });

        try {
          // API call would go here
          await new Promise(resolve => setTimeout(resolve, 500));

          get().updateMessage(id, { status: 'sent' });
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
              status: originalAction.status as string,
              approved_at: originalAction.approved_at as string,
              approved_by: originalAction.approved_by as string,
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
              status: originalAction.status as string,
              rejected_at: originalAction.rejected_at as string,
              rejected_by: originalAction.rejected_by as string,
            });
          }
          throw error;
        }
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
