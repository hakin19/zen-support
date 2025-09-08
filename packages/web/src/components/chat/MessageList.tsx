import { ChevronDown, Loader2 } from 'lucide-react';
import React, { useRef, useEffect, useState, useCallback } from 'react';

import { ChatMessage } from './ChatMessage';

import type {
  MessageWithStatus,
  DeviceActionWithStatus,
} from '@/store/chat.store';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MessageListProps {
  messages: MessageWithStatus[];
  deviceActions?: DeviceActionWithStatus[];
  isLoading?: boolean;
  isTyping?: boolean;
  onRetry?: (id: string) => void;
  onApproveAction?: (id: string) => void;
  onRejectAction?: (id: string) => void;
  onViewAction?: (id: string) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  className?: string;
}

export function MessageList({
  messages,
  deviceActions = [],
  isLoading = false,
  isTyping = false,
  onRetry,
  onApproveAction,
  onRejectAction,
  onViewAction,
  onLoadMore,
  hasMore = false,
  className,
}: MessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const scrollToBottom = useCallback((smooth = true) => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({
        behavior: smooth ? 'smooth' : 'auto',
      });
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } =
      scrollContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;

    setShowScrollButton(!isNearBottom);

    // Detect user scrolling
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    setIsUserScrolling(true);

    scrollTimeoutRef.current = setTimeout(() => {
      setIsUserScrolling(false);
    }, 1000);

    // Load more when scrolled to top
    if (scrollTop === 0 && hasMore && onLoadMore) {
      onLoadMore();
    }
  }, [hasMore, onLoadMore]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (!isUserScrolling && messages.length > 0) {
      scrollToBottom();
    }
  }, [messages.length, isUserScrolling, scrollToBottom]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  if (messages.length === 0 && !isLoading) {
    return (
      <div
        className={cn(
          'flex flex-1 items-center justify-center p-8 text-center',
          className
        )}
      >
        <div className='text-muted-foreground'>
          <p className='text-lg font-medium'>No messages yet</p>
          <p className='text-sm mt-2'>Start a conversation to get help</p>
        </div>
      </div>
    );
  }

  const renderDateSeparator = (date: string) => {
    const messageDate = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let dateLabel = messageDate.toLocaleDateString();

    if (messageDate.toDateString() === today.toDateString()) {
      dateLabel = 'Today';
    } else if (messageDate.toDateString() === yesterday.toDateString()) {
      dateLabel = 'Yesterday';
    }

    return (
      <div className='flex items-center justify-center py-2'>
        <div className='bg-muted px-3 py-1 rounded-full text-xs text-muted-foreground'>
          {dateLabel}
        </div>
      </div>
    );
  };

  const groupMessagesByDate = () => {
    const groups: { date: string; messages: MessageWithStatus[] }[] = [];
    let currentDate = '';

    messages.forEach(message => {
      if (!message.created_at) return;

      const messageDate = new Date(message.created_at).toDateString();

      if (messageDate !== currentDate) {
        currentDate = messageDate;
        groups.push({
          date: message.created_at,
          messages: [message],
        });
      } else {
        groups[groups.length - 1].messages.push(message);
      }
    });

    return groups;
  };

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className={cn('flex flex-col overflow-y-auto', className)}
      role='log'
      aria-label='Chat messages'
      aria-live='polite'
    >
      {hasMore && onLoadMore && (
        <div className='flex justify-center py-4'>
          <Button
            variant='ghost'
            size='sm'
            onClick={onLoadMore}
            className='text-xs'
          >
            Load older messages
          </Button>
        </div>
      )}

      {isLoading && messages.length === 0 && (
        <div className='flex items-center justify-center py-8'>
          <Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
        </div>
      )}

      <div className='space-y-4 p-4'>
        {groupMessagesByDate().map((group, groupIndex) => (
          <div key={groupIndex}>
            {renderDateSeparator(group.date)}
            {group.messages.map(message => (
              <ChatMessage
                key={message.id}
                message={message}
                deviceActions={deviceActions}
                onRetry={onRetry}
                onApproveAction={onApproveAction}
                onRejectAction={onRejectAction}
                onViewAction={onViewAction}
              />
            ))}
          </div>
        ))}

        {isTyping && (
          <div className='flex items-center gap-2 p-4 text-sm text-muted-foreground'>
            <div className='flex gap-1'>
              <span
                className='animate-bounce'
                style={{ animationDelay: '0ms' }}
              >
                •
              </span>
              <span
                className='animate-bounce'
                style={{ animationDelay: '150ms' }}
              >
                •
              </span>
              <span
                className='animate-bounce'
                style={{ animationDelay: '300ms' }}
              >
                •
              </span>
            </div>
            <span>AI is typing...</span>
          </div>
        )}
      </div>

      <div ref={bottomRef} />

      {showScrollButton && (
        <Button
          size='icon'
          variant='secondary'
          className='fixed bottom-20 right-6 rounded-full shadow-lg'
          onClick={() => scrollToBottom()}
          aria-label='Scroll to bottom'
        >
          <ChevronDown className='h-4 w-4' />
        </Button>
      )}
    </div>
  );
}
