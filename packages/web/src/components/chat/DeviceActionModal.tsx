/* global window, MouseEvent */
import {
  X,
  Minimize2,
  Copy,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Terminal,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import React, { useState, useRef, useEffect, type JSX } from 'react';

import type { DeviceActionWithStatus } from '@/store/chat.store';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface DeviceActionModalProps {
  actions: DeviceActionWithStatus[];
  selectedActionId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onSelectAction: (id: string) => void;
  className?: string;
}

const statusIcons = {
  pending: <Clock className='h-4 w-4' />,
  approved: <CheckCircle2 className='h-4 w-4' />,
  rejected: <XCircle className='h-4 w-4' />,
  executing: <Terminal className='h-4 w-4 animate-pulse' />,
  completed: <CheckCircle2 className='h-4 w-4' />,
  failed: <AlertCircle className='h-4 w-4' />,
};

const statusColors = {
  pending:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  executing:
    'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  completed:
    'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export function DeviceActionModal({
  actions,
  selectedActionId,
  isOpen,
  onClose,
  onApprove,
  onReject,
  onSelectAction,
  className,
}: DeviceActionModalProps): JSX.Element | null {
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const modalRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const safeActions = actions || [];
  const selectedAction = safeActions.find(a => a.id === selectedActionId);
  const pendingActions = safeActions.filter(a => a.status === 'pending');
  const currentIndex = selectedAction
    ? safeActions.findIndex(a => a.id === selectedActionId)
    : -1;

  useEffect(() => {
    if (outputRef.current && selectedAction?.output) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [selectedAction?.output]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (
      e.target === modalRef.current ||
      (e.target as HTMLElement).closest('.modal-header')
    ) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    }
  };

  const handleMouseMove = React.useCallback(
    (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        });
      }
    },
    [isDragging, dragStart.x, dragStart.y]
  );

  const handleMouseUp = React.useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.document.addEventListener('mousemove', handleMouseMove);
      window.document.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.document.removeEventListener('mousemove', handleMouseMove);
        window.document.removeEventListener('mouseup', handleMouseUp);
      };
    }
    return undefined;
  }, [isDragging, dragStart, handleMouseMove, handleMouseUp]);

  const handleCopyOutput = async () => {
    if (selectedAction?.output) {
      try {
        await window.navigator.clipboard.writeText(
          selectedAction.output.join('\n')
        );
      } catch (error: unknown) {
        // eslint-disable-next-line no-console
        console.error('Failed to copy to clipboard:', error);
        window.alert(
          'Failed to copy to clipboard. Please try selecting and copying manually.'
        );
      }
    }
  };

  const navigateAction = (direction: 'prev' | 'next') => {
    if (!selectedAction) return;

    const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex >= 0 && newIndex < actions.length) {
      onSelectAction(actions[newIndex].id as string);
    }
  };

  if (!isOpen) return null;

  if (isMinimized) {
    return (
      <div
        className='fixed bottom-4 right-4 z-50'
        style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      >
        <Card
          className='p-3 cursor-pointer shadow-lg'
          onClick={() => setIsMinimized(false)}
        >
          <div className='flex items-center gap-2'>
            <Terminal className='h-4 w-4' />
            <span className='text-sm font-medium'>Device Actions</span>
            {pendingActions.length > 0 && (
              <Badge variant='destructive' className='ml-2'>
                {pendingActions.length}
              </Badge>
            )}
            <Button
              size='icon'
              variant='ghost'
              className='h-6 w-6 ml-2'
              onClick={e => {
                (e as React.MouseEvent).stopPropagation();
                onClose();
              }}
            >
              <X className='h-3 w-3' />
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div
      ref={modalRef}
      className={cn(
        'fixed z-50 bg-background border rounded-lg shadow-xl',
        isDragging ? 'cursor-grabbing' : 'cursor-grab',
        className
      )}
      style={{
        top: position.y,
        left: position.x,
        width: '600px',
        maxWidth: 'calc(100vw - 40px)',
        height: '500px',
        maxHeight: 'calc(100vh - 40px)',
      }}
      onMouseDown={handleMouseDown}
    >
      <div className='modal-header flex items-center justify-between p-4 border-b'>
        <div className='flex items-center gap-3'>
          <Terminal className='h-5 w-5' />
          <h2 className='text-lg font-semibold'>Device Actions</h2>
          {pendingActions.length > 0 && (
            <Badge variant='destructive'>{pendingActions.length} pending</Badge>
          )}
        </div>
        <div className='flex items-center gap-1'>
          <Button
            size='icon'
            variant='ghost'
            className='h-8 w-8'
            onClick={() => setIsMinimized(true)}
          >
            <Minimize2 className='h-4 w-4' />
          </Button>
          <Button
            size='icon'
            variant='ghost'
            className='h-8 w-8'
            onClick={onClose}
          >
            <X className='h-4 w-4' />
          </Button>
        </div>
      </div>

      <div className='flex h-[calc(100%-4rem)]'>
        {/* Action List */}
        <div className='w-1/3 border-r overflow-y-auto'>
          <ScrollArea className='h-full'>
            <div className='p-2 space-y-1'>
              {actions.map(action => (
                <Card
                  key={action.id as string}
                  className={cn(
                    'p-3 cursor-pointer transition-colors',
                    action.id === selectedActionId
                      ? 'bg-primary/10 border-primary'
                      : 'hover:bg-muted/50'
                  )}
                  onClick={() => onSelectAction(action.id as string)}
                >
                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-2'>
                      {statusIcons[action.status as keyof typeof statusIcons] ??
                        statusIcons.pending}
                      <span className='text-sm font-medium truncate'>
                        {action.action_type}
                      </span>
                    </div>
                    <Badge
                      variant='secondary'
                      className={cn(
                        'text-xs',
                        statusColors[action.status as keyof typeof statusColors]
                      )}
                    >
                      {action.status}
                    </Badge>
                  </div>
                  <p className='text-xs text-muted-foreground mt-1 truncate'>
                    {action.command}
                  </p>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Action Details */}
        <div className='flex-1 flex flex-col'>
          {selectedAction ? (
            <>
              <div className='p-4 border-b space-y-3'>
                <div className='flex items-center justify-between'>
                  <h3 className='font-medium'>{selectedAction.action_type}</h3>
                  <div className='flex items-center gap-2'>
                    <Button
                      size='icon'
                      variant='ghost'
                      className='h-8 w-8'
                      disabled={currentIndex === 0}
                      onClick={() => navigateAction('prev')}
                    >
                      <ChevronLeft className='h-4 w-4' />
                    </Button>
                    <span className='text-sm text-muted-foreground'>
                      {currentIndex + 1} / {actions.length}
                    </span>
                    <Button
                      size='icon'
                      variant='ghost'
                      className='h-8 w-8'
                      disabled={currentIndex === actions.length - 1}
                      onClick={() => navigateAction('next')}
                    >
                      <ChevronRight className='h-4 w-4' />
                    </Button>
                  </div>
                </div>

                <div className='space-y-2'>
                  <div>
                    <p className='text-xs text-muted-foreground'>Command:</p>
                    <pre className='text-sm font-mono bg-muted p-2 rounded mt-1'>
                      {selectedAction.command}
                    </pre>
                  </div>

                  {selectedAction.parameters && (
                    <div>
                      <p className='text-xs text-muted-foreground'>
                        Parameters:
                      </p>
                      <pre className='text-xs font-mono bg-muted p-2 rounded mt-1'>
                        {JSON.stringify(selectedAction.parameters, null, 2)}
                      </pre>
                    </div>
                  )}

                  {selectedAction.status === 'pending' && (
                    <div className='flex gap-2 pt-2'>
                      <Button
                        size='sm'
                        variant='default'
                        onClick={() => onApprove(selectedAction.id as string)}
                      >
                        <CheckCircle2 className='h-4 w-4 mr-2' />
                        Approve
                      </Button>
                      <Button
                        size='sm'
                        variant='destructive'
                        onClick={() => onReject(selectedAction.id as string)}
                      >
                        <XCircle className='h-4 w-4 mr-2' />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Console Output */}
              <div className='flex-1 flex flex-col p-4'>
                <div className='flex items-center justify-between mb-2'>
                  <h4 className='text-sm font-medium'>Console Output</h4>
                  <Button
                    size='icon'
                    variant='ghost'
                    className='h-6 w-6'
                    onClick={() => void handleCopyOutput()}
                    disabled={!selectedAction.output?.length}
                  >
                    <Copy className='h-3 w-3' />
                  </Button>
                </div>
                <div
                  ref={outputRef}
                  className='flex-1 bg-black text-green-400 font-mono text-xs p-3 rounded overflow-auto'
                >
                  {selectedAction.output?.length ? (
                    selectedAction.output.map((line, i) => (
                      <div key={i} className='whitespace-pre-wrap'>
                        {line}
                      </div>
                    ))
                  ) : selectedAction.isExecuting ? (
                    <div className='text-yellow-400'>Executing command...</div>
                  ) : selectedAction.result ? (
                    <div className='whitespace-pre-wrap'>
                      {selectedAction.result}
                    </div>
                  ) : selectedAction.error_message ? (
                    <div className='text-red-400'>
                      {selectedAction.error_message}
                    </div>
                  ) : (
                    <div className='text-gray-500'>No output yet</div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className='flex items-center justify-center h-full text-muted-foreground'>
              <p>Select an action to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
