import { formatDistanceToNow } from 'date-fns';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  User,
  Bot,
  Info,
  AlertTriangle,
} from 'lucide-react';
import React from 'react';
import ReactMarkdown from 'react-markdown';

import type {
  MessageWithStatus,
  DeviceActionWithStatus,
} from '@/store/chat.store';
import type { Database } from '@aizen/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type MessageRole = Database['public']['Enums']['message_role'];

interface ChatMessageProps {
  message: MessageWithStatus;
  deviceActions?: DeviceActionWithStatus[];
  onRetry?: (id: string) => void;
  onApproveAction?: (id: string) => void;
  onRejectAction?: (id: string) => void;
  onViewAction?: (id: string) => void;
}

const roleIcons: Record<MessageRole, React.ReactNode> = {
  user: <User className='h-4 w-4' />,
  assistant: <Bot className='h-4 w-4' />,
  system: <Info className='h-4 w-4' />,
  error: <AlertTriangle className='h-4 w-4' />,
};

const roleColors: Record<MessageRole, string> = {
  user: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800',
  assistant: 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800',
  system:
    'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800',
  error: 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800',
};

export function ChatMessage({
  message,
  deviceActions = [],
  onRetry,
  onApproveAction,
  onRejectAction,
  onViewAction,
}: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const messageActions = deviceActions.filter(
    action => action.session_id === message.session_id
  );

  const renderContent = () => {
    if (isAssistant) {
      return (
        <div className='prose prose-sm dark:prose-invert max-w-none'>
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>
      );
    }
    return <p className='text-sm'>{message.content}</p>;
  };

  const renderStatus = () => {
    if (!message.status || message.status === 'sent') return null;

    if (message.status === 'sending') {
      return (
        <div className='flex items-center gap-1 text-xs text-muted-foreground'>
          <Clock className='h-3 w-3 animate-pulse' />
          <span>Sending...</span>
        </div>
      );
    }

    if (message.status === 'error') {
      return (
        <div className='flex items-center gap-2 text-xs text-red-600 dark:text-red-400'>
          <AlertCircle className='h-3 w-3' />
          <span>{message.error || 'Failed to send'}</span>
          {onRetry && (
            <Button
              variant='ghost'
              size='sm'
              className='h-6 px-2'
              onClick={() => onRetry(message.id)}
            >
              <RefreshCw className='h-3 w-3 mr-1' />
              Retry
            </Button>
          )}
        </div>
      );
    }
  };

  const renderDeviceActions = () => {
    if (messageActions.length === 0) return null;

    return (
      <div className='mt-3 space-y-2'>
        {messageActions.map(action => (
          <Card key={action.id} className='p-3'>
            <div className='flex items-start justify-between'>
              <div className='flex-1'>
                <div className='flex items-center gap-2'>
                  <Badge
                    variant={
                      action.status === 'pending'
                        ? 'default'
                        : action.status === 'approved'
                          ? 'secondary'
                          : action.status === 'rejected'
                            ? 'destructive'
                            : action.status === 'completed'
                              ? 'outline'
                              : 'secondary'
                    }
                  >
                    {action.status}
                  </Badge>
                  <span className='text-xs text-muted-foreground'>
                    {action.action_type}
                  </span>
                </div>
                <pre className='mt-2 text-xs font-mono bg-muted p-2 rounded'>
                  {action.command}
                </pre>
                {action.result && (
                  <div className='mt-2'>
                    <p className='text-xs text-muted-foreground'>Result:</p>
                    <pre className='text-xs font-mono bg-muted p-2 rounded mt-1'>
                      {action.result}
                    </pre>
                  </div>
                )}
                {action.error_message && (
                  <div className='mt-2 text-xs text-red-600 dark:text-red-400'>
                    <AlertCircle className='h-3 w-3 inline mr-1' />
                    {action.error_message}
                  </div>
                )}
              </div>
              {action.status === 'pending' && (
                <div className='flex gap-2 ml-3'>
                  {onApproveAction && (
                    <Button
                      size='sm'
                      variant='default'
                      onClick={() => onApproveAction(action.id)}
                      className='h-7'
                    >
                      <CheckCircle2 className='h-3 w-3 mr-1' />
                      Approve
                    </Button>
                  )}
                  {onRejectAction && (
                    <Button
                      size='sm'
                      variant='destructive'
                      onClick={() => onRejectAction(action.id)}
                      className='h-7'
                    >
                      Reject
                    </Button>
                  )}
                </div>
              )}
              {action.status !== 'pending' && onViewAction && (
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={() => onViewAction(action.id)}
                  className='h-7'
                >
                  View
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div
      className={cn(
        'group relative flex gap-3 p-4 rounded-lg border transition-colors',
        roleColors[message.role],
        isUser && 'ml-8',
        !isUser && 'mr-8'
      )}
      role='article'
      aria-label={`Message from ${message.role}`}
    >
      <div className='flex-shrink-0'>
        <div className='w-8 h-8 rounded-full bg-background flex items-center justify-center border'>
          {roleIcons[message.role]}
        </div>
      </div>
      <div className='flex-1 space-y-1'>
        <div className='flex items-center justify-between'>
          <span className='text-xs font-medium capitalize'>{message.role}</span>
          {message.created_at && (
            <span className='text-xs text-muted-foreground'>
              {formatDistanceToNow(new Date(message.created_at), {
                addSuffix: true,
              })}
            </span>
          )}
        </div>
        <div className='text-sm'>{renderContent()}</div>
        {renderStatus()}
        {renderDeviceActions()}
      </div>
    </div>
  );
}
