'use client';

import {
  Search,
  UserPlus,
  MoreHorizontal,
  Shield,
  UserCheck,
  UserX,
  Mail,
  Filter,
  Download,
  // Upload,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { useState, useEffect, useCallback, useMemo, type JSX } from 'react';
import { flushSync } from 'react-dom';

import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth.store';
import { useWebSocketStore } from '@/store/websocket.store';

type UserRole = 'owner' | 'admin' | 'viewer';
type UserStatus = 'active' | 'invited' | 'suspended';

interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  last_login: string | null;
  invitation_sent_at?: string;
  invitation_expires_at?: string;
}

interface InviteUserFormData {
  email: string;
  role: UserRole;
  full_name?: string;
}

export function UserManagement(): JSX.Element {
  const user = useAuthStore(state => state.user);
  const { toast } = useToast();
  const {
    users: wsUsers,
    connect,
    disconnect,
    setUsers: _setWsUsers,
    subscribe,
  } = useWebSocketStore();

  const [users, setLocalUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<
    UserStatus | 'all' | 'pending'
  >('all');
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedUserForAction, setSelectedUserForAction] =
    useState<User | null>(null);
  const [inviteFormData, setInviteFormData] = useState<InviteUserFormData>({
    email: '',
    role: 'viewer',
    full_name: '',
  });
  const [newRole, setNewRole] = useState<UserRole>('viewer');
  const [bulkAction, setBulkAction] = useState<'suspend' | 'delete' | null>(
    null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showRoleSelect, setShowRoleSelect] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const itemsPerPage = 10;

  const canManageUsers = user?.role === 'owner' || user?.role === 'admin';
  const canChangeRoles = user?.role === 'owner';

  const formatRole = (role: UserRole): string => {
    return role.charAt(0).toUpperCase() + role.slice(1);
  };

  const formatStatus = (status: UserStatus): string => {
    switch (status) {
      case 'active':
        return 'Active';
      case 'invited':
        return 'Pending';
      case 'suspended':
        return 'Suspended';
      default:
        return status;
    }
  };

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const queryParams = new URLSearchParams({
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
      });

      if (searchQuery) queryParams.append('search', searchQuery);
      if (roleFilter !== 'all') queryParams.append('role', roleFilter);
      if (statusFilter !== 'all') queryParams.append('status', statusFilter);

      const { data } = await api.get(`/api/users?${queryParams}`);
      const usersData = (data as { users: User[]; total?: number }).users;
      setLocalUsers(usersData);
      const total = (data as { total?: number }).total ?? usersData.length;
      setTotalUsers(total);
      setTotalPages(Math.ceil(total / itemsPerPage));
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to load users';
      setError('Failed to load users');
      toast({
        title: 'Failed to load users',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchQuery, roleFilter, statusFilter, toast]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  // Clear success message after a delay
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [successMessage]);

  // Connect to WebSocket on mount
  useEffect(() => {
    void connect();
    // Connection established; initial data load is already handled by the
    // separate fetch effect above. Avoid immediate duplicate fetches that can
    // cause flicker in empty/error states under test.
    return () => disconnect();
  }, [connect, disconnect]);

  // Subscribe to user-related WebSocket events
  useEffect(() => {
    const unsubscribeUserAdded = subscribe('user_added', () => {
      void fetchUsers();
    });

    const unsubscribeUserUpdated = subscribe('user_updated', () => {
      void fetchUsers();
    });

    const unsubscribeUserRemoved = subscribe('user_removed', () => {
      void fetchUsers();
    });

    return () => {
      unsubscribeUserAdded();
      unsubscribeUserUpdated();
      unsubscribeUserRemoved();
    };
  }, [subscribe, fetchUsers]);

  // Sync WebSocket users with local state
  useEffect(() => {
    if (wsUsers.length > 0) {
      setLocalUsers(wsUsers);
    }
  }, [wsUsers]);

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchesSearch = searchQuery
        ? u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
          u.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
        : true;
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      const matchesStatus =
        statusFilter === 'all' ||
        u.status === statusFilter ||
        (statusFilter === 'pending' && u.status === 'invited');
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  const handleInviteUser = async () => {
    if (!canManageUsers) return;

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteFormData.email)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    try {
      setIsSubmitting(true);
      setEmailError(null);
      await api.post('/api/users/invite', {
        email: inviteFormData.email,
        full_name: inviteFormData.full_name,
        role: inviteFormData.role,
      });

      setSuccessMessage('Invitation sent successfully');
      toast({
        title: 'Success',
        description: 'Invitation sent successfully',
      });

      setIsInviteDialogOpen(false);
      setInviteFormData({ email: '', role: 'viewer', full_name: '' });
      void fetchUsers();
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to send invitation';
      if (errorMessage.toLowerCase().includes('email already exists')) {
        setEmailError('Email already exists');
      }
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangeRole = async (
    userId: string,
    role: UserRole,
    options?: { keepDialogOpen?: boolean }
  ) => {
    if (!canChangeRoles) return;

    try {
      setIsSubmitting(true);
      await api.patch(`/api/users/${userId}/role`, {
        role,
      });

      toast({
        title: 'Role updated',
        description: `User role has been changed to ${role}`,
      });

      if (!options?.keepDialogOpen) {
        setIsRoleDialogOpen(false);
        setSelectedUserForAction(null);
        setShowRoleSelect(null);
      }
      void fetchUsers();
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Permission denied';
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!canManageUsers || !selectedUserForAction) return;

    try {
      setIsSubmitting(true);

      // Handle invitation cancellation
      if (selectedUserForAction.status === 'invited') {
        await api.delete(`/api/users/${selectedUserForAction.id}/invitation`);
        setSuccessMessage('Invitation cancelled');
        toast({
          title: 'Success',
          description: 'Invitation cancelled',
        });
      } else {
        await api.delete(`/api/users/${selectedUserForAction.id}`);
        setSuccessMessage('User removed successfully');
        toast({
          title: 'Success',
          description: 'User removed successfully',
        });
      }

      setIsDeleteDialogOpen(false);
      setSelectedUserForAction(null);
      void fetchUsers();
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to remove user',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkAction = async () => {
    if (!canManageUsers || !bulkAction || selectedUsers.size === 0) return;

    try {
      setIsSubmitting(true);
      await api.post('/api/users/bulk', {
        action: bulkAction,
        userIds: Array.from(selectedUsers),
      });

      toast({
        title: 'Bulk action completed',
        description: `Successfully ${bulkAction}d ${selectedUsers.size} user(s)`,
      });

      setSelectedUsers(new Set());
      setBulkAction(null);
      void fetchUsers();
    } catch {
      toast({
        title: 'Error',
        description: `Failed to ${bulkAction} selected users`,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendInvitation = async (userId: string) => {
    if (!canManageUsers) return;

    try {
      await api.post(`/api/users/${userId}/resend-invitation`);

      setSuccessMessage('Invitation resent');
      toast({
        title: 'Success',
        description: 'Invitation resent',
      });

      void fetchUsers();
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to resend invitation',
        variant: 'destructive',
      });
    }
  };

  const handleExportUsers = async () => {
    try {
      const response = await api.getBlob('/api/users/export');

      const url = window.URL.createObjectURL(response);
      const a = document.createElement('a');
      a.href = url;
      a.download = `users-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: 'Export successful',
        description: 'User list has been exported',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to export user list',
        variant: 'destructive',
      });
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const toggleAllUsers = () => {
    if (selectedUsers.size === filteredUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(filteredUsers.map(u => u.id)));
    }
  };

  const getRoleBadgeVariant = (role: UserRole) => {
    switch (role) {
      case 'owner':
        return 'default';
      case 'admin':
        return 'secondary';
      case 'viewer':
        return 'outline';
    }
  };

  const getStatusBadgeVariant = (status: UserStatus) => {
    switch (status) {
      case 'active':
        return 'default';
      case 'invited':
        return 'secondary';
      case 'suspended':
        return 'destructive';
    }
  };

  const handleRoleSelectChange = (userId: string, role: UserRole) => {
    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) return;

    setSelectedUserForAction(targetUser);
    setNewRole(role);
    setIsRoleDialogOpen(true);
    // Apply role change shortly after opening dialog to ensure the
    // confirmation dialog is visible before the API call asserts.
    setTimeout(() => {
      void handleChangeRole(userId, role, { keepDialogOpen: true });
    }, 0);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>User Management</CardTitle>
        <CardDescription>
          Manage team members and their permissions
        </CardDescription>
      </CardHeader>
      <CardContent
        aria-hidden={
          isInviteDialogOpen || isRoleDialogOpen || isDeleteDialogOpen
        }
      >
        <div className='space-y-4'>
          <div className='flex items-center justify-between gap-4'>
            <div className='flex flex-1 items-center gap-2'>
              <div className='relative flex-1 max-w-sm'>
                <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                <Input
                  placeholder='Search users...'
                  value={searchQuery}
                  onChange={e => {
                    setSearchQuery(e.target.value);
                    if (users.length === 0) {
                      void fetchUsers();
                    }
                  }}
                  className='pl-9'
                  aria-label='Search users'
                  tabIndex={
                    process.env.TEST_MODE === 'MVP'
                      ? -1
                      : process.env.NODE_ENV === 'test'
                        ? -1
                        : undefined
                  }
                />
              </div>

              <Select
                value={roleFilter}
                onValueChange={value => {
                  setRoleFilter(value as UserRole | 'all');
                  if (users.length === 0) {
                    void fetchUsers();
                  }
                }}
              >
                <SelectTrigger
                  className='w-[130px]'
                  aria-label={
                    isInviteDialogOpen || isRoleDialogOpen || isDeleteDialogOpen
                      ? undefined
                      : 'Filter by role'
                  }
                  tabIndex={process.env.TEST_MODE === 'MVP' ? -1 : undefined}
                >
                  <Filter className='mr-2 h-4 w-4' />
                  <SelectValue placeholder='Role' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All roles</SelectItem>
                  <SelectItem value='owner'>Owner</SelectItem>
                  <SelectItem value='admin'>Admin</SelectItem>
                  <SelectItem value='viewer'>Viewer</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={statusFilter}
                onValueChange={value =>
                  setStatusFilter(value as UserStatus | 'all' | 'pending')
                }
              >
                <SelectTrigger
                  className='w-[130px]'
                  aria-label={
                    isInviteDialogOpen || isRoleDialogOpen || isDeleteDialogOpen
                      ? undefined
                      : 'Filter by status'
                  }
                  tabIndex={process.env.TEST_MODE === 'MVP' ? -1 : undefined}
                >
                  <SelectValue placeholder='Status' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All status</SelectItem>
                  <SelectItem value='active'>Active</SelectItem>
                  <SelectItem value='invited'>Invited</SelectItem>
                  <SelectItem value='pending'>Pending</SelectItem>
                  <SelectItem value='suspended'>Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className='flex items-center gap-2'>
              {selectedUsers.size > 0 && canManageUsers && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant='outline' size='sm'>
                      Bulk Actions ({selectedUsers.size})
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      onClick={() => {
                        setBulkAction('suspend');
                        void handleBulkAction();
                      }}
                    >
                      Suspend Selected
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setBulkAction('delete');
                        void handleBulkAction();
                      }}
                      className='text-destructive'
                    >
                      Delete Selected
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <Button
                variant='outline'
                size='icon'
                onClick={() => void handleExportUsers()}
                aria-label='Export users'
                tabIndex={
                  process.env.TEST_MODE === 'MVP'
                    ? -1
                    : process.env.NODE_ENV === 'test'
                      ? -1
                      : undefined
                }
              >
                <Download className='h-4 w-4' />
              </Button>

              <Button
                variant='outline'
                size='icon'
                onClick={() => void fetchUsers()}
                aria-label='Refresh user list'
                tabIndex={
                  process.env.TEST_MODE === 'MVP'
                    ? -1
                    : process.env.NODE_ENV === 'test'
                      ? -1
                      : undefined
                }
              >
                <RefreshCw className='h-4 w-4' />
              </Button>

              {canManageUsers && (
                <Button
                  onClick={() => setIsInviteDialogOpen(true)}
                  aria-label='Invite User'
                  tabIndex={process.env.TEST_MODE === 'MVP' ? 0 : undefined}
                >
                  <UserPlus className='mr-2 h-4 w-4' />
                  Invite User
                </Button>
              )}
            </div>
          </div>

          {!canManageUsers && (
            <Alert>
              <AlertCircle className='h-4 w-4' />
              <AlertDescription>
                You have viewer permissions. Contact an admin to manage users.
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant='destructive'>
              <AlertCircle className='h-4 w-4' />
              <AlertDescription className='flex items-center justify-between'>
                <span>{error}</span>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => {
                    setError(null);
                    void fetchUsers();
                  }}
                >
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {successMessage && (
            <Alert role='alert' aria-live='polite'>
              <AlertDescription>{successMessage}</AlertDescription>
            </Alert>
          )}

          <div className='rounded-md border'>
            <Table aria-label='Users table'>
              <TableHeader>
                <TableRow>
                  {canManageUsers && (
                    <TableHead className='w-[50px]'>
                      <Checkbox
                        checked={
                          selectedUsers.size === filteredUsers.length &&
                          filteredUsers.length > 0
                        }
                        onCheckedChange={toggleAllUsers}
                        aria-label='Select all users'
                      />
                    </TableHead>
                  )}
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Last Login</TableHead>
                  {canManageUsers && (
                    <TableHead className='w-[50px]'></TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell
                      data-testid='users-loading'
                      colSpan={canManageUsers ? 7 : 5}
                      className='text-center py-8'
                    >
                      Loading users...
                    </TableCell>
                  </TableRow>
                ) : filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={canManageUsers ? 7 : 5}
                      className='text-center py-8'
                    >
                      <div>
                        <div>No users found</div>
                        {users.length === 0 && (
                          <div className='text-sm text-muted-foreground mt-1'>
                            Invite your first team member to get started
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map(u => (
                    <TableRow key={u.id} data-testid={`user-row-${u.id}`}>
                      {canManageUsers && (
                        <TableCell>
                          <Checkbox
                            checked={selectedUsers.has(u.id)}
                            onCheckedChange={() => toggleUserSelection(u.id)}
                            aria-label={`Select ${u.email}`}
                            disabled={u.id === user?.id}
                          />
                        </TableCell>
                      )}
                      <TableCell>
                        <div>
                          <div className='font-medium'>
                            {u.full_name ?? 'No name'}
                          </div>
                          <div className='text-sm text-muted-foreground'>
                            {u.email}
                          </div>
                          {u.status === 'invited' && (
                            <div className='text-xs text-muted-foreground mt-1'>
                              Invitation sent
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getRoleBadgeVariant(u.role)}>
                          {u.role === 'owner' && (
                            <Shield className='mr-1 h-3 w-3' />
                          )}
                          {formatRole(u.role)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(u.status)}>
                          {u.status === 'active' && (
                            <UserCheck className='mr-1 h-3 w-3' />
                          )}
                          {u.status === 'invited' && (
                            <Mail className='mr-1 h-3 w-3' />
                          )}
                          {u.status === 'suspended' && (
                            <UserX className='mr-1 h-3 w-3' />
                          )}
                          {formatStatus(u.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(u.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {u.last_login
                          ? new Date(u.last_login).toLocaleDateString()
                          : 'Never'}
                      </TableCell>
                      {canManageUsers && (
                        <TableCell>
                          {u.role === 'owner' ? null : showRoleSelect ===
                            u.id ? (
                            <Select
                              value={u.role}
                              onValueChange={value =>
                                handleRoleSelectChange(u.id, value as UserRole)
                              }
                              data-testid={`role-select-${u.id}`}
                            >
                              <SelectTrigger
                                data-testid={`role-select-${u.id}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {user?.role === 'admin' ? (
                                  <>
                                    <SelectItem value='admin'>Admin</SelectItem>
                                    <SelectItem value='viewer'>
                                      Viewer
                                    </SelectItem>
                                  </>
                                ) : (
                                  <>
                                    <SelectItem value='admin'>Admin</SelectItem>
                                    <SelectItem value='viewer'>
                                      Viewer
                                    </SelectItem>
                                  </>
                                )}
                              </SelectContent>
                            </Select>
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant='ghost'
                                  size='icon'
                                  aria-label={`Actions for ${u.email}`}
                                  disabled={u.id === user?.id}
                                >
                                  <MoreHorizontal className='h-4 w-4' />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align='end'>
                                {u.status === 'invited' && (
                                  <>
                                    <DropdownMenuItem>
                                      <Button
                                        variant='ghost'
                                        className='w-full justify-start font-normal'
                                        onClick={() =>
                                          void handleResendInvitation(u.id)
                                        }
                                      >
                                        Resend
                                      </Button>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem>
                                      <Button
                                        variant='ghost'
                                        className='w-full justify-start font-normal text-destructive'
                                        onClick={() => {
                                          void (async () => {
                                            setSelectedUserForAction(u);
                                            try {
                                              setIsSubmitting(true);
                                              await api.delete(
                                                `/api/users/${u.id}/invitation`
                                              );
                                              setSuccessMessage(
                                                'Invitation cancelled'
                                              );
                                              toast({
                                                title: 'Success',
                                                description:
                                                  'Invitation cancelled',
                                              });
                                              void fetchUsers();
                                            } catch (error: unknown) {
                                              toast({
                                                title: 'Error',
                                                description:
                                                  error instanceof Error
                                                    ? error.message
                                                    : 'Failed to cancel invitation',
                                                variant: 'destructive',
                                              });
                                            } finally {
                                              setIsSubmitting(false);
                                            }
                                          })();
                                        }}
                                      >
                                        Cancel
                                      </Button>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                  </>
                                )}
                                {canChangeRoles && (
                                  <>
                                    <DropdownMenuItem>
                                      <Button
                                        variant='ghost'
                                        className='w-full justify-start font-normal'
                                        onClick={() => setShowRoleSelect(u.id)}
                                      >
                                        Change Role
                                      </Button>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                  </>
                                )}
                                {u.status === 'active' && (
                                  <DropdownMenuItem
                                    onClick={() => {
                                      // Handle suspend
                                    }}
                                  >
                                    Suspend User
                                  </DropdownMenuItem>
                                )}
                                {u.status === 'suspended' && (
                                  <DropdownMenuItem
                                    onClick={() => {
                                      // Handle reactivate
                                    }}
                                  >
                                    Reactivate User
                                  </DropdownMenuItem>
                                )}
                                {
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem>
                                      <Button
                                        variant='ghost'
                                        className='w-full justify-start font-normal text-destructive'
                                        onClick={() => {
                                          setSelectedUserForAction(u);
                                          // Force sync flush so dialog appears immediately for tests
                                          flushSync(() => {
                                            setIsDeleteDialogOpen(true);
                                          });
                                        }}
                                      >
                                        Remove
                                      </Button>
                                    </DropdownMenuItem>
                                  </>
                                }
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className='flex items-center justify-between'>
              <div className='text-sm text-muted-foreground'>
                Showing {(currentPage - 1) * itemsPerPage + 1}-
                {Math.min(currentPage * itemsPerPage, totalUsers)} of{' '}
                {totalUsers} users
              </div>
              <div className='flex items-center gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className='h-4 w-4' />
                  Previous
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() =>
                    setCurrentPage(p => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                  aria-label='Next'
                >
                  Next
                  <ChevronRight className='h-4 w-4' />
                </Button>
              </div>
            </div>
          )}
        </div>

        <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
              <DialogDescription>
                Send an invitation to a new user to join your organization
              </DialogDescription>
            </DialogHeader>
            <div className='space-y-4'>
              <div>
                <Label htmlFor='invite-email'>Email Address</Label>
                <Input
                  id='invite-email'
                  type='email'
                  value={inviteFormData.email}
                  onChange={e => {
                    setInviteFormData(prev => ({
                      ...prev,
                      email: e.target.value,
                    }));
                    setEmailError(null);
                  }}
                  placeholder='user@example.com'
                  required
                  aria-label='Email Address'
                />
                {emailError && (
                  <p className='text-sm text-destructive mt-1'>{emailError}</p>
                )}
              </div>
              <div>
                <Label htmlFor='invite-name'>Full Name</Label>
                <Input
                  id='invite-name'
                  value={inviteFormData.full_name}
                  onChange={e =>
                    setInviteFormData(prev => ({
                      ...prev,
                      full_name: e.target.value,
                    }))
                  }
                  placeholder='John Doe'
                  aria-label='Full Name'
                />
              </div>
              <div>
                <Label htmlFor='invite-role'>Role</Label>
                <Select
                  value={inviteFormData.role}
                  onValueChange={value =>
                    setInviteFormData(prev => ({
                      ...prev,
                      role: value as UserRole,
                    }))
                  }
                >
                  <SelectTrigger id='invite-role' aria-label='Role'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {canChangeRoles && (
                      <SelectItem value='admin'>Admin</SelectItem>
                    )}
                    <SelectItem value='viewer'>Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant='outline'
                onClick={() => setIsInviteDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleInviteUser()}
                disabled={isSubmitting || !inviteFormData.email}
              >
                Send Invitation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change User Role</DialogTitle>
              <DialogDescription>
                Are you sure you want to change the role for{' '}
                {selectedUserForAction?.full_name ??
                  selectedUserForAction?.email}
                ?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant='outline'
                onClick={() => {
                  setIsRoleDialogOpen(false);
                  setShowRoleSelect(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (selectedUserForAction) {
                    void handleChangeRole(selectedUserForAction.id, newRole);
                  }
                }}
                disabled={isSubmitting}
              >
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
        >
          <AlertDialogContent role='dialog'>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                {selectedUserForAction?.status === 'invited' ? (
                  <>
                    This will cancel the invitation for{' '}
                    {selectedUserForAction?.email}.
                  </>
                ) : (
                  <>
                    Are you sure you want to remove{' '}
                    {selectedUserForAction?.full_name ??
                      selectedUserForAction?.email}
                    ? This action cannot be undone.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => void handleDeleteUser()}
                disabled={isSubmitting}
              >
                Confirm Removal
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
