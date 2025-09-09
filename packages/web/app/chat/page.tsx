'use client';

import React from 'react';

import type { Database } from '@aizen/shared';

import { ChatInput } from '@/components/chat/ChatInput';
import { ChatSessionList } from '@/components/chat/ChatSessionList';
import { DeviceActionModal } from '@/components/chat/DeviceActionModal';
import { MessageList } from '@/components/chat/MessageList';
import { useChatStore } from '@/store/chat.store';

export default function ChatPage(): React.ReactElement {
  const {
    sessions,
    activeSessionId,
    setActiveSession,
    addSession,
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
  } = useChatStore();

  // Derive currentSession from sessions and activeSessionId
  const currentSession = sessions.find(s => s.id === activeSessionId) || null;

  const handleSessionCreate = () => {
    // Create a new session with all required fields
    const sessionId = crypto.randomUUID();
    const newSession = {
      id: sessionId,
      title: 'New Session',
      status: 'active' as Database['public']['Enums']['chat_session_status'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      closed_at: null,
      customer_id: 'temp-customer-id', // This would normally come from auth context
      user_id: 'temp-user-id', // This would normally come from auth context
      metadata: null,
    };
    addSession(newSession);
    setActiveSession(sessionId);
  };

  const handleSessionRename = (id: string, title: string) => {
    updateSession(id, { title });
  };

  const handleViewAction = (id: string) => {
    setSelectedAction(id);
    setDeviceModalOpen(true);
  };

  return (
    <div className='flex h-screen bg-background'>
      {/* Sidebar with chat sessions */}
      <div className='w-80 border-r'>
        <ChatSessionList
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSessionSelect={setActiveSession}
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
                {currentSession.title || 'Support Session'}
              </h2>
              <p className='text-sm text-muted-foreground'>
                Session ID: {currentSession.id}
              </p>
            </div>

            {/* Messages */}
            <div className='flex-1 overflow-hidden'>
              <MessageList
                messages={messages}
                deviceActions={deviceActions}
                isTyping={isTyping}
                onRetry={retryMessage}
                onApproveAction={approveAction}
                onRejectAction={rejectAction}
                onViewAction={handleViewAction}
                className='h-full'
              />
            </div>

            {/* Input */}
            <div className='border-t'>
              <ChatInput
                onSend={sendMessage}
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
        onApprove={approveAction}
        onReject={rejectAction}
        onSelectAction={setSelectedAction}
      />
    </div>
  );
}
