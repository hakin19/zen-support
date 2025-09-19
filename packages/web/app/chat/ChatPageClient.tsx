'use client';

import React, { useEffect } from 'react';

import { ChatInput } from '@/components/chat/ChatInput';
import { ChatSessionList } from '@/components/chat/ChatSessionList';
import { DeviceActionModal } from '@/components/chat/DeviceActionModal';
import { MessageList } from '@/components/chat/MessageList';
import { useChatStore, type WebSocketMessage } from '@/store/chat.store';
import { useWebSocketStore } from '@/store/websocket.store';

export default function ChatPage(): React.ReactElement {
  const {
    sessions,
    activeSessionId,
    setActiveSession,
    createSession,
    loadSessions,
    loadSession,
    archiveSession,
    deleteSession,
    updateSession,
    messages,
    deviceActions,
    selectedActionId,
    deviceModalOpen,
    setDeviceModalOpen,
    setSelectedAction,
    approveAction,
    rejectAction,
    sendMessage,
    retryMessage,
    isTyping,
    isSending,
    setTyping,
    handleWebSocketMessage,
    resyncOnReconnect,
    setConnected,
  } = useChatStore();

  const connectWebSocket = useWebSocketStore(state => state.connect);
  const disconnectWebSocket = useWebSocketStore(state => state.disconnect);
  const subscribeToEvent = useWebSocketStore(state => state.subscribe);
  const isWebSocketConnected = useWebSocketStore(state => state.isConnected);

  // Derive currentSession from sessions and activeSessionId
  const currentSession: { id: string; title?: string } | null = ((): {
    id: string;
    title?: string;
  } | null => {
    const found = sessions.find(s => s.id === activeSessionId);
    return found
      ? {
          id: found.id,
          title: found.title ?? undefined,
        }
      : null;
  })();

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    void connectWebSocket();
    return () => {
      disconnectWebSocket();
    };
  }, [connectWebSocket, disconnectWebSocket]);

  useEffect(() => {
    const listeners = [
      'chat:message',
      'chat:ai_chunk',
      'chat:error',
      'chat:device_action',
      'device:action:update',
      'session:update',
    ] as const;

    const unsubscribers = listeners.map(event =>
      subscribeToEvent(event, data => {
        if (!data || typeof data !== 'object') return;
        handleWebSocketMessage(data as WebSocketMessage);
      })
    );

    return () => {
      unsubscribers.forEach(unsubscribe => {
        unsubscribe();
      });
    };
  }, [subscribeToEvent, handleWebSocketMessage]);

  useEffect(() => {
    setConnected(isWebSocketConnected);
    if (isWebSocketConnected) {
      void resyncOnReconnect();
    }
  }, [isWebSocketConnected, setConnected, resyncOnReconnect]);

  const handleSessionCreate = (): void => {
    void createSession('New Session').catch(() => {
      // Store already sets sessionsError; UI components can surface it.
    });
  };

  const handleSessionSelect = (id: string): void => {
    setActiveSession(id);
    void loadSession(id);
  };

  const handleSessionRename = (id: string, title: string): void => {
    updateSession(id, { title });
  };

  const handleViewAction = (id: string): void => {
    setSelectedAction(id);
    setDeviceModalOpen(true);
  };

  return (
    <div className='flex flex-1 bg-background min-h-screen'>
      {/* Sidebar with chat sessions */}
      <div className='w-80 border-r'>
        <ChatSessionList
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSessionSelect={handleSessionSelect}
          onSessionCreate={handleSessionCreate}
          onSessionArchive={archiveSession}
          onSessionDelete={deleteSession}
          onSessionRename={handleSessionRename}
        />
      </div>

      {/* Main chat area */}
      <div className='flex-1 flex flex-col'>
        {currentSession ? (
          <>
            {/* Chat header */}
            <div className='border-b p-4'>
              <h2 className='text-lg font-semibold'>
                {currentSession?.title ?? 'Support Session'}
              </h2>
              <p className='text-sm text-muted-foreground'>
                Session ID: {currentSession?.id}
              </p>
            </div>

            {/* Messages */}
            <div className='flex-1 overflow-hidden'>
              <MessageList
                messages={messages}
                deviceActions={deviceActions}
                isTyping={isTyping}
                onRetry={(messageId: string) => void retryMessage(messageId)}
                onApproveAction={(actionId: string) =>
                  void approveAction(actionId)
                }
                onRejectAction={(actionId: string) =>
                  void rejectAction(actionId)
                }
                onViewAction={handleViewAction}
                className='h-full'
              />
            </div>

            {/* Input */}
            <div className='border-t'>
              <ChatInput
                onSend={(message: string) => void sendMessage(message)}
                onTyping={() => setTyping(true)}
                isSending={isSending}
                isDisabled={!currentSession}
              />
            </div>
          </>
        ) : (
          <div className='flex-1 flex items-center justify-center'>
            <div className='text-center'>
              <h2 className='text-2xl font-semibold mb-2'>
                Welcome to Support Chat
              </h2>
              <p className='text-muted-foreground'>
                Select a session from the sidebar or create a new one to get
                started
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Device Action Modal */}
      <DeviceActionModal
        actions={deviceActions}
        selectedActionId={selectedActionId}
        isOpen={deviceModalOpen}
        onClose={() => setDeviceModalOpen(false)}
        onApprove={(actionId: string) => void approveAction(actionId)}
        onReject={(actionId: string) => void rejectAction(actionId)}
        onSelectAction={setSelectedAction}
      />
    </div>
  );
}
