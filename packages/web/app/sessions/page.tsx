'use client';

import {
  Search,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  FileText,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Activity,
} from 'lucide-react';
import React, { useState, useEffect, useMemo, type JSX } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import {
  useSessionsStore,
  type DiagnosticSession,
  type SessionStatus,
  type TranscriptEntry,
} from '@/store/sessions.store';

// Debounce hook for search input
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

function SessionsPage(): JSX.Element {
  const { toast } = useToast();
  const user = useAuthStore(state => state.user);
  const {
    sessions,
    devices,
    users,
    loading,
    error,
    currentPage,
    totalPages,
    searchQuery,
    statusFilter,
    fetchSessions,
    approveSession,
    rejectSession,
    fetchTranscript,
    setSearchQuery,
    setStatusFilter,
    setCurrentPage,
    subscribeToUpdates,
    unsubscribeFromUpdates,
  } = useSessionsStore();

  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);
  const debouncedSearch = useDebounce(localSearchQuery, 300);

  // Approval/Rejection modal state
  const [approvalModal, setApprovalModal] = useState<{
    open: boolean;
    sessionId: string | null;
    session: DiagnosticSession | null;
    action: 'approve' | 'reject';
  }>({
    open: false,
    sessionId: null,
    session: null,
    action: 'approve',
  });
  const [rejectionReason, setRejectionReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Transcript modal state
  const [transcriptModal, setTranscriptModal] = useState<{
    open: boolean;
    sessionId: string | null;
    transcript: TranscriptEntry[] | undefined;
  }>({
    open: false,
    sessionId: null,
    transcript: [],
  });
  const [loadingTranscript, setLoadingTranscript] = useState(false);

  // Check if user has permission to approve/reject
  const canApprove = useMemo(() => {
    return user?.role === 'owner' || user?.role === 'admin';
  }, [user]);

  // Status badge styling
  const getStatusBadge = (status: SessionStatus) => {
    const config = {
      pending: {
        label: 'Pending',
        className: 'bg-yellow-100 text-yellow-800',
        icon: <Clock className='h-3 w-3' />,
      },
      in_progress: {
        label: 'In Progress',
        className: 'bg-blue-100 text-blue-800',
        icon: <Activity className='h-3 w-3' />,
      },
      completed: {
        label: 'Completed',
        className: 'bg-green-100 text-green-800',
        icon: <CheckCircle className='h-3 w-3' />,
      },
      failed: {
        label: 'Failed',
        className: 'bg-red-100 text-red-800',
        icon: <XCircle className='h-3 w-3' />,
      },
      remediation_pending: {
        label: 'Remediation Pending',
        className: 'bg-orange-100 text-orange-800',
        icon: <AlertTriangle className='h-3 w-3' />,
      },
      approved: {
        label: 'Approved',
        className: 'bg-green-100 text-green-800',
        icon: <CheckCircle className='h-3 w-3' />,
      },
      rejected: {
        label: 'Rejected',
        className: 'bg-gray-100 text-gray-800',
        icon: <XCircle className='h-3 w-3' />,
      },
    };

    const statusConfig = config[status] || config.pending;

    return (
      <Badge
        className={cn('flex items-center gap-1', statusConfig.className)}
        data-testid={`status-badge-${status}`}
      >
        {statusConfig.icon}
        {statusConfig.label}
      </Badge>
    );
  };

  // Fetch sessions on component mount and when filters change
  useEffect(() => {
    void fetchSessions(currentPage, statusFilter, debouncedSearch);
  }, [currentPage, statusFilter, debouncedSearch, fetchSessions]);

  // Update global search query when debounced value changes
  useEffect(() => {
    setSearchQuery(debouncedSearch);
  }, [debouncedSearch, setSearchQuery]);

  // Subscribe to real-time updates
  useEffect(() => {
    subscribeToUpdates();
    return () => unsubscribeFromUpdates();
  }, [subscribeToUpdates, unsubscribeFromUpdates]);

  // Handle approval/rejection modal
  const openApprovalModal = (
    session: DiagnosticSession,
    action: 'approve' | 'reject'
  ) => {
    setApprovalModal({
      open: true,
      sessionId: session.id,
      session,
      action,
    });
    setRejectionReason('');
  };

  const closeApprovalModal = () => {
    setApprovalModal({
      open: false,
      sessionId: null,
      session: null,
      action: 'approve',
    });
    setRejectionReason('');
  };

  const handleApprovalAction = async () => {
    if (!approvalModal.sessionId) return;

    setIsProcessing(true);
    try {
      if (approvalModal.action === 'approve') {
        await approveSession(approvalModal.sessionId);
        toast({
          title: 'Session Approved',
          description: 'Session actions have been approved successfully.',
        });
      } else {
        await rejectSession(approvalModal.sessionId, rejectionReason);
        toast({
          title: 'Session Rejected',
          description: 'Session actions have been rejected.',
        });
      }
      closeApprovalModal();
    } catch (error) {
      toast({
        title: `Failed to ${approvalModal.action} session`,
        description:
          error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle transcript modal
  const openTranscriptModal = async (session: DiagnosticSession) => {
    setTranscriptModal({
      open: true,
      sessionId: session.id,
      transcript: [],
    });
    setLoadingTranscript(true);

    try {
      const transcript = await fetchTranscript(session.id);
      setTranscriptModal(prev => ({ ...prev, transcript }));
    } catch (error) {
      toast({
        title: 'Failed to load transcript',
        description:
          error instanceof Error ? error.message : 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setLoadingTranscript(false);
    }
  };

  const closeTranscriptModal = () => {
    setTranscriptModal({
      open: false,
      sessionId: null,
      transcript: [],
    });
  };

  // Filter sessions based on status
  const filteredSessions = useMemo(() => {
    if (statusFilter === 'all') return sessions;

    // Map 'Pending Approval' filter to sessions with pending remediation_actions
    if (statusFilter === 'pending') {
      return sessions.filter(
        s =>
          s.status === 'pending' ||
          s.remediation_actions?.some(a => a.status === 'pending_approval')
      );
    }

    return sessions.filter(s => s.status === statusFilter);
  }, [sessions, statusFilter]);

  // Handle retry on error
  const handleRetry = () => {
    void fetchSessions(currentPage, statusFilter, searchQuery);
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (error && !sessions.length) {
    return (
      <div className='flex flex-col items-center justify-center h-[50vh] gap-4'>
        <AlertTriangle className='h-12 w-12 text-gray-400' />
        <p className='text-lg text-gray-600'>Failed to load sessions</p>
        <p className='text-sm text-gray-500'>{error}</p>
        <Button onClick={handleRetry} variant='outline'>
          <RefreshCw className='h-4 w-4 mr-2' />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-3xl font-bold tracking-tight'>Sessions Queue</h1>
          <p className='text-muted-foreground'>
            Manage diagnostic sessions and approve remediation actions
          </p>
        </div>
        <Button onClick={handleRetry} variant='outline' size='sm'>
          <RefreshCw
            className={cn('h-4 w-4 mr-2', loading && 'animate-spin')}
          />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          {/* Search */}
          <div className='relative'>
            <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400' />
            <Input
              placeholder='Search sessions...'
              value={localSearchQuery}
              onChange={e => setLocalSearchQuery(e.target.value)}
              className='pl-10'
            />
          </div>

          {/* Status Filter Buttons */}
          <div className='flex gap-2 flex-wrap'>
            <Button
              variant={statusFilter === 'all' ? 'default' : 'outline'}
              size='sm'
              onClick={() => setStatusFilter('all')}
            >
              All Sessions
            </Button>
            <Button
              variant={statusFilter === 'pending' ? 'default' : 'outline'}
              size='sm'
              onClick={() => setStatusFilter('pending')}
            >
              Pending Approval
            </Button>
            <Button
              variant={statusFilter === 'in_progress' ? 'default' : 'outline'}
              size='sm'
              onClick={() => setStatusFilter('in_progress')}
            >
              In Progress
            </Button>
            <Button
              variant={statusFilter === 'completed' ? 'default' : 'outline'}
              size='sm'
              onClick={() => setStatusFilter('completed')}
            >
              Completed
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sessions Table */}
      <Card>
        <CardContent className='p-0'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Session ID</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead className='text-right'>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSessions.map(session => {
                const device = devices[session.device_id];
                const sessionUser = session.user_id
                  ? users[session.user_id]
                  : null;
                const hasPendingActions = session.remediation_actions?.some(
                  a => a.status === 'pending_approval'
                );

                return (
                  <TableRow
                    key={session.id}
                    data-testid={`session-row-${session.id}`}
                  >
                    <TableCell className='font-mono text-sm'>
                      {session.id.slice(0, 8)}...
                    </TableCell>
                    <TableCell>
                      {device ? (
                        <div>
                          <div className='font-medium'>{device.name}</div>
                          <Badge
                            variant={
                              device.status === 'online'
                                ? 'default'
                                : 'secondary'
                            }
                            className='mt-1'
                          >
                            {device.status}
                          </Badge>
                        </div>
                      ) : (
                        <span className='text-muted-foreground'>Unknown</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {sessionUser ? (
                        <div>
                          <div className='font-medium'>{sessionUser.name}</div>
                          <div className='text-sm text-muted-foreground'>
                            {sessionUser.email}
                          </div>
                        </div>
                      ) : (
                        <span className='text-muted-foreground'>System</span>
                      )}
                    </TableCell>
                    <TableCell className='max-w-xs truncate'>
                      {session.issue_description ?? 'No description'}
                    </TableCell>
                    <TableCell>{getStatusBadge(session.status)}</TableCell>
                    <TableCell>
                      {session.started_at
                        ? formatDate(session.started_at)
                        : 'N/A'}
                    </TableCell>
                    <TableCell className='text-right'>
                      <div className='flex items-center justify-end gap-2'>
                        {/* View Transcript */}
                        <Button
                          variant='ghost'
                          size='sm'
                          onClick={() => void openTranscriptModal(session)}
                        >
                          <FileText className='h-4 w-4' />
                          View Transcript
                        </Button>

                        {/* Approve/Reject buttons for pending sessions */}
                        {canApprove &&
                          (session.status === 'pending' ||
                            hasPendingActions) && (
                            <>
                              <Button
                                variant='default'
                                size='sm'
                                onClick={() =>
                                  openApprovalModal(session, 'approve')
                                }
                              >
                                <CheckCircle className='h-4 w-4 mr-1' />
                                Approve
                              </Button>
                              <Button
                                variant='destructive'
                                size='sm'
                                onClick={() =>
                                  openApprovalModal(session, 'reject')
                                }
                              >
                                <XCircle className='h-4 w-4 mr-1' />
                                Reject
                              </Button>
                            </>
                          )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredSessions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className='text-center py-8'>
                    <div className='text-muted-foreground'>
                      {loading ? 'Loading sessions...' : 'No sessions found'}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className='flex items-center justify-between'>
          <p className='text-sm text-muted-foreground'>
            Page {currentPage} of {totalPages}
          </p>
          <div className='flex gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className='h-4 w-4' />
              Previous
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={() =>
                setCurrentPage(Math.min(totalPages, currentPage + 1))
              }
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className='h-4 w-4' />
            </Button>
          </div>
        </div>
      )}

      {/* Approval/Rejection Modal */}
      <Dialog open={approvalModal.open} onOpenChange={closeApprovalModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {approvalModal.action === 'approve'
                ? 'Approve Session Actions?'
                : 'Reject Session Actions?'}
            </DialogTitle>
            <DialogDescription>
              {approvalModal.action === 'approve'
                ? 'This will approve all pending remediation actions for this session.'
                : 'This will reject the remediation actions for this session.'}
            </DialogDescription>
          </DialogHeader>

          {/* Show remediation actions if present */}
          {approvalModal.session?.remediation_actions && (
            <div className='space-y-2'>
              <Label>Remediation Actions:</Label>
              <div className='bg-gray-50 dark:bg-gray-800 p-3 rounded-md space-y-2'>
                {approvalModal.session.remediation_actions.map(
                  (action, index) => (
                    <div key={index} className='text-sm'>
                      <div className='font-mono'>{action.action}</div>
                      {action.script && (
                        <div className='text-xs text-muted-foreground mt-1'>
                          Script: {action.script}
                        </div>
                      )}
                      {action.risk_level && (
                        <Badge variant='outline' className='mt-1'>
                          Risk: {action.risk_level}
                        </Badge>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* Rejection reason input */}
          {approvalModal.action === 'reject' && (
            <div className='space-y-2'>
              <Label htmlFor='rejection-reason'>Rejection Reason</Label>
              <Textarea
                id='rejection-reason'
                placeholder='Optional: Provide a reason for rejection...'
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
              />
            </div>
          )}

          <DialogFooter>
            <Button variant='outline' onClick={closeApprovalModal}>
              Cancel
            </Button>
            <Button
              variant={
                approvalModal.action === 'approve' ? 'default' : 'destructive'
              }
              onClick={() => void handleApprovalAction()}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <RefreshCw className='h-4 w-4 mr-2 animate-spin' />
                  Processing...
                </>
              ) : (
                <>
                  {approvalModal.action === 'approve' ? (
                    <>
                      <CheckCircle className='h-4 w-4 mr-2' />
                      Confirm Approval
                    </>
                  ) : (
                    <>
                      <XCircle className='h-4 w-4 mr-2' />
                      Confirm Rejection
                    </>
                  )}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transcript Modal */}
      <Dialog open={transcriptModal.open} onOpenChange={closeTranscriptModal}>
        <DialogContent className='max-w-3xl max-h-[80vh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>Session Transcript</DialogTitle>
            <DialogDescription>
              Detailed log of session activities and diagnostics
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-2'>
            {loadingTranscript ? (
              <div className='flex items-center justify-center py-8'>
                <RefreshCw className='h-6 w-6 animate-spin text-muted-foreground' />
              </div>
            ) : Array.isArray(transcriptModal.transcript) &&
              transcriptModal.transcript.length > 0 ? (
              transcriptModal.transcript.map((entry, index) => (
                <div
                  key={index}
                  className='flex gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800'
                  data-testid={`transcript-${entry.type}`}
                >
                  <div className='text-xs font-mono text-muted-foreground min-w-[60px]'>
                    {entry.timestamp}
                  </div>
                  <div
                    className={cn(
                      'flex-1 text-sm',
                      entry.type === 'system' && 'text-gray-600',
                      entry.type === 'diagnostic' && 'text-blue-600',
                      entry.type === 'result' && 'text-green-600',
                      entry.type === 'error' && 'text-red-600'
                    )}
                  >
                    {entry.message}
                  </div>
                </div>
              ))
            ) : (
              <div className='text-center py-8 text-muted-foreground'>
                No transcript available for this session
              </div>
            )}
          </div>

          <DialogFooter>
            <Button onClick={closeTranscriptModal}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SessionsPage;
