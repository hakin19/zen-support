'use client';

import React from 'react';

import { ChatInput } from '@/components/chat/ChatInput';
import { ChatSessionList } from '@/components/chat/ChatSessionList';
import { DeviceActionModal } from '@/components/chat/DeviceActionModal';
import { MessageList } from '@/components/chat/MessageList';
import { useChatStore } from '@/store/chat.store';

export default function ChatPage(): React.ReactElement {
  const { currentSession } = useChatStore();

  return (
    <div className='flex h-screen bg-background'>
      {/* Sidebar with chat sessions */}
      <div className='w-80 border-r'>
        <ChatSessionList />
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
              <MessageList />
            </div>

            {/* Input */}
            <div className='border-t'>
              <ChatInput />
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
      <DeviceActionModal />
    </div>
  );
}
