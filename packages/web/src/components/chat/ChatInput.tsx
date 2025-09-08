import { Send, Paperclip, Loader2 } from 'lucide-react';
import React, { useState, useRef, useEffect } from 'react';

import type { KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend: (message: string) => void;
  onTyping?: () => void;
  isDisabled?: boolean;
  isSending?: boolean;
  placeholder?: string;
  maxLength?: number;
  className?: string;
}

export function ChatInput({
  onSend,
  onTyping,
  isDisabled = false,
  isSending = false,
  placeholder = 'Type your message...',
  maxLength = 4000,
  className,
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [rows, setRows] = useState(1);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const isNearLimit = message.length > maxLength * 0.9;
  const remainingChars = maxLength - message.length;

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const lineHeight = 24;
      const maxRows = 5;
      const newRows = Math.min(Math.ceil(scrollHeight / lineHeight), maxRows);
      setRows(newRows);
      textareaRef.current.style.height = `${newRows * lineHeight}px`;
    }
  }, [message]);

  const handleSend = () => {
    const trimmedMessage = message.trim();
    if (trimmedMessage && !isSending && !isDisabled) {
      onSend(trimmedMessage);
      setMessage('');
      setRows(1);
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    if (newValue.length <= maxLength) {
      setMessage(newValue);

      if (onTyping) {
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }

        onTyping();

        typingTimeoutRef.current = setTimeout(() => {
          // Typing stopped
        }, 1000);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className={cn('relative flex flex-col gap-2 p-4 border-t', className)}>
      <div className='flex items-end gap-2'>
        <div className='flex-1 relative'>
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleChange}
            onKeyDown={handleKeyPress}
            placeholder={placeholder}
            disabled={isDisabled || isSending}
            rows={rows}
            className={cn(
              'w-full resize-none rounded-lg border bg-background px-4 py-3 pr-12',
              'text-sm placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'transition-all duration-200'
            )}
            aria-label='Message input'
            aria-describedby='char-count'
          />
          <Button
            type='button'
            size='icon'
            variant='ghost'
            className='absolute bottom-2 right-2 h-8 w-8'
            disabled
            aria-label='Attach file'
          >
            <Paperclip className='h-4 w-4' />
          </Button>
        </div>
        <Button
          onClick={handleSend}
          disabled={!message.trim() || isDisabled || isSending}
          size='icon'
          className='h-10 w-10'
          aria-label='Send message'
        >
          {isSending ? (
            <Loader2 className='h-4 w-4 animate-spin' />
          ) : (
            <Send className='h-4 w-4' />
          )}
        </Button>
      </div>
      {isNearLimit && (
        <div
          id='char-count'
          className={cn(
            'text-xs text-right',
            remainingChars < 100 ? 'text-red-600' : 'text-yellow-600'
          )}
          role='status'
          aria-live='polite'
        >
          {remainingChars} characters remaining
        </div>
      )}
      {isSending && (
        <div
          className='text-xs text-muted-foreground animate-pulse'
          role='status'
          aria-live='polite'
        >
          Sending message...
        </div>
      )}
    </div>
  );
}
