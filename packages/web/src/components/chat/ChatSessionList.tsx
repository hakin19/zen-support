import { formatDistanceToNow } from 'date-fns';
import {
  Plus,
  Search,
  MoreVertical,
  Archive,
  Trash2,
  Edit2,
  MessageSquare,
} from 'lucide-react';
import React, { useState, useMemo } from 'react';

import type { Database } from '@aizen/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

type ChatSession = Database['public']['Tables']['chat_sessions']['Row'];

interface ChatSessionListProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSessionSelect: (id: string) => void;
  onSessionCreate: () => void;
  onSessionArchive?: (id: string) => void;
  onSessionDelete?: (id: string) => void;
  onSessionRename?: (id: string, title: string) => void;
  isLoading?: boolean;
  className?: string;
}

export function ChatSessionList({
  sessions,
  activeSessionId,
  onSessionSelect,
  onSessionCreate,
  onSessionArchive,
  onSessionDelete,
  onSessionRename,
  isLoading = false,
  className,
}: ChatSessionListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<
    'all' | 'active' | 'archived'
  >('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const filteredSessions = useMemo(() => {
    let filtered = sessions;

    // Filter by status
    if (filterStatus !== 'all') {
      filtered = filtered.filter(session => session.status === filterStatus);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        session =>
          session.title?.toLowerCase().includes(query) ||
          session.id.toLowerCase().includes(query)
      );
    }

    // Sort by most recent
    return filtered.sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at || 0);
      const dateB = new Date(b.updated_at || b.created_at || 0);
      return dateB.getTime() - dateA.getTime();
    });
  }, [sessions, filterStatus, searchQuery]);

  const handleRename = (sessionId: string) => {
    if (onSessionRename && editingTitle.trim()) {
      onSessionRename(sessionId, editingTitle.trim());
    }
    setEditingId(null);
    setEditingTitle('');
  };

  const groupSessionsByDate = () => {
    const groups: { label: string; sessions: ChatSession[] }[] = [];
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const todaySessions: ChatSession[] = [];
    const yesterdaySessions: ChatSession[] = [];
    const weekSessions: ChatSession[] = [];
    const olderSessions: ChatSession[] = [];

    filteredSessions.forEach(session => {
      const sessionDate = new Date(session.created_at || 0);

      if (sessionDate.toDateString() === today.toDateString()) {
        todaySessions.push(session);
      } else if (sessionDate.toDateString() === yesterday.toDateString()) {
        yesterdaySessions.push(session);
      } else if (sessionDate > weekAgo) {
        weekSessions.push(session);
      } else {
        olderSessions.push(session);
      }
    });

    if (todaySessions.length > 0) {
      groups.push({ label: 'Today', sessions: todaySessions });
    }
    if (yesterdaySessions.length > 0) {
      groups.push({ label: 'Yesterday', sessions: yesterdaySessions });
    }
    if (weekSessions.length > 0) {
      groups.push({ label: 'This Week', sessions: weekSessions });
    }
    if (olderSessions.length > 0) {
      groups.push({ label: 'Older', sessions: olderSessions });
    }

    return groups;
  };

  const renderSession = (session: ChatSession) => {
    const isActive = session.id === activeSessionId;
    const isEditing = session.id === editingId;

    return (
      <div
        key={session.id}
        className={cn(
          'group relative flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-colors',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'hover:bg-muted/50 text-foreground'
        )}
        onClick={() => !isEditing && onSessionSelect(session.id)}
        role='button'
        tabIndex={0}
        aria-selected={isActive}
        aria-label={`Chat session: ${session.title || 'Untitled'}`}
      >
        <MessageSquare className='h-4 w-4 flex-shrink-0' />
        <div className='flex-1 min-w-0'>
          {isEditing ? (
            <Input
              value={editingTitle}
              onChange={e => setEditingTitle(e.target.value)}
              onBlur={() => handleRename(session.id)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  handleRename(session.id);
                } else if (e.key === 'Escape') {
                  setEditingId(null);
                  setEditingTitle('');
                }
              }}
              onClick={e => e.stopPropagation()}
              className='h-6 px-1 text-sm'
              autoFocus
            />
          ) : (
            <>
              <p className='text-sm font-medium truncate'>
                {session.title || 'Untitled Chat'}
              </p>
              {session.updated_at && (
                <p className='text-xs text-muted-foreground truncate'>
                  {formatDistanceToNow(new Date(session.updated_at), {
                    addSuffix: true,
                  })}
                </p>
              )}
            </>
          )}
        </div>
        {session.status === 'archived' && (
          <Badge variant='secondary' className='text-xs'>
            Archived
          </Badge>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              size='icon'
              className='h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity'
              onClick={e => e.stopPropagation()}
            >
              <MoreVertical className='h-3 w-3' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            {onSessionRename && (
              <DropdownMenuItem
                onClick={e => {
                  e.stopPropagation();
                  setEditingId(session.id);
                  setEditingTitle(session.title || '');
                }}
              >
                <Edit2 className='h-3 w-3 mr-2' />
                Rename
              </DropdownMenuItem>
            )}
            {onSessionArchive && session.status !== 'archived' && (
              <DropdownMenuItem
                onClick={e => {
                  e.stopPropagation();
                  onSessionArchive(session.id);
                }}
              >
                <Archive className='h-3 w-3 mr-2' />
                Archive
              </DropdownMenuItem>
            )}
            {onSessionDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={e => {
                    e.stopPropagation();
                    if (confirm('Are you sure you want to delete this chat?')) {
                      onSessionDelete(session.id);
                    }
                  }}
                  className='text-red-600'
                >
                  <Trash2 className='h-3 w-3 mr-2' />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className='p-4 space-y-3 border-b'>
        <Button onClick={onSessionCreate} className='w-full' size='sm'>
          <Plus className='h-4 w-4 mr-2' />
          New Chat
        </Button>
        <div className='relative'>
          <Search className='absolute left-2 top-2.5 h-4 w-4 text-muted-foreground' />
          <Input
            placeholder='Search chats...'
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className='pl-8 h-9'
          />
        </div>
        <div className='flex gap-1'>
          <Button
            variant={filterStatus === 'all' ? 'default' : 'ghost'}
            size='sm'
            className='flex-1 h-7 text-xs'
            onClick={() => setFilterStatus('all')}
          >
            All
          </Button>
          <Button
            variant={filterStatus === 'active' ? 'default' : 'ghost'}
            size='sm'
            className='flex-1 h-7 text-xs'
            onClick={() => setFilterStatus('active')}
          >
            Active
          </Button>
          <Button
            variant={filterStatus === 'archived' ? 'default' : 'ghost'}
            size='sm'
            className='flex-1 h-7 text-xs'
            onClick={() => setFilterStatus('archived')}
          >
            Archived
          </Button>
        </div>
      </div>

      <ScrollArea className='flex-1'>
        <div className='p-2'>
          {filteredSessions.length === 0 ? (
            <div className='text-center py-8 text-muted-foreground'>
              <p className='text-sm'>No chats found</p>
              {searchQuery && (
                <p className='text-xs mt-2'>Try adjusting your search</p>
              )}
            </div>
          ) : (
            <div className='space-y-4'>
              {groupSessionsByDate().map(group => (
                <div key={group.label}>
                  <p className='text-xs font-medium text-muted-foreground px-3 py-1'>
                    {group.label}
                  </p>
                  <div className='space-y-1'>
                    {group.sessions.map(session => renderSession(session))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
