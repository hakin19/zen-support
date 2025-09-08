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
  Upload,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { useState, useEffect, useCallback, useMemo } from 'react';

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
import { useAuthStore } from '@/store/auth.store';

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

export function UserManagement() {
  const user = useAuthStore(state => state.user);
  const { toast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<UserStatus | 'all'>('all');
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
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

  const itemsPerPage = 10;

  const canManageUsers = user?.role === 'owner' || user?.role === 'admin';
  const canChangeRoles = user?.role === 'owner';

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams({
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
      });

      if (searchQuery) queryParams.append('search', searchQuery);
      if (roleFilter !== 'all') queryParams.append('role', roleFilter);
      if (statusFilter !== 'all') queryParams.append('status', statusFilter);

      const response = await fetch(`/api/users?${queryParams}`);
      if (!response.ok) throw new Error('Failed to fetch users');

      const data = await response.json();
      setUsers(data.users);
      setTotalPages(Math.ceil(data.total / itemsPerPage));
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load users. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchQuery, roleFilter, statusFilter, toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    const ws = new WebSocket(
      process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'
    );

    ws.onmessage = event => {
      const data = JSON.parse(event.data);
      if (data.type === 'user_update') {
        setUsers(prevUsers =>
          prevUsers.map(u => (u.id === data.user.id ? data.user : u))
        );
      } else if (data.type === 'user_added') {
        fetchUsers();
      } else if (data.type === 'user_removed') {
        setUsers(prevUsers => prevUsers.filter(u => u.id !== data.userId));
      }
    };

    return () => ws.close();
  }, [fetchUsers]);

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchesSearch = searchQuery
        ? u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
          u.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
        : true;
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  const handleInviteUser = async () => {
    if (!canManageUsers) return;

    try {
      setIsSubmitting(true);
      const response = await fetch('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteFormData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send invitation');
      }

      toast({
        title: 'Invitation sent',
        description: `An invitation has been sent to ${inviteFormData.email}`,
      });

      setIsInviteDialogOpen(false);
      setInviteFormData({ email: '', role: 'viewer', full_name: '' });
      fetchUsers();
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to send invitation',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangeRole = async () => {
    if (!canChangeRoles || !selectedUserForAction) return;

    try {
      setIsSubmitting(true);
      const response = await fetch(
        `/api/users/${selectedUserForAction.id}/role`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: newRole }),
        }
      );

      if (!response.ok) throw new Error('Failed to update role');

      toast({
        title: 'Role updated',
        description: `User role has been changed to ${newRole}`,
      });

      setIsRoleDialogOpen(false);
      setSelectedUserForAction(null);
      fetchUsers();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update user role',
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
      const response = await fetch(`/api/users/${selectedUserForAction.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete user');

      toast({
        title: 'User deleted',
        description: 'The user has been removed from your organization',
      });

      setIsDeleteDialogOpen(false);
      setSelectedUserForAction(null);
      fetchUsers();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete user',
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
      const response = await fetch('/api/users/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: bulkAction,
          userIds: Array.from(selectedUsers),
        }),
      });

      if (!response.ok) throw new Error(`Failed to ${bulkAction} users`);

      toast({
        title: 'Bulk action completed',
        description: `Successfully ${bulkAction}d ${selectedUsers.size} user(s)`,
      });

      setSelectedUsers(new Set());
      setBulkAction(null);
      fetchUsers();
    } catch (error) {
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
      const response = await fetch(`/api/users/${userId}/resend-invitation`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to resend invitation');

      toast({
        title: 'Invitation resent',
        description: 'A new invitation has been sent to the user',
      });

      fetchUsers();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to resend invitation',
        variant: 'destructive',
      });
    }
  };

  const handleExportUsers = async () => {
    try {
      const response = await fetch('/api/users/export');
      if (!response.ok) throw new Error('Failed to export users');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
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
    } catch (error) {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>User Management</CardTitle>
        <CardDescription>
          Manage users, roles, and permissions for your organization
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className='space-y-4'>
          <div className='flex items-center justify-between gap-4'>
            <div className='flex flex-1 items-center gap-2'>
              <div className='relative flex-1 max-w-sm'>
                <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                <Input
                  placeholder='Search users...'
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className='pl-9'
                  aria-label='Search users'
                />
              </div>

              <Select
                value={roleFilter}
                onValueChange={value =>
                  setRoleFilter(value as UserRole | 'all')
                }
              >
                <SelectTrigger
                  className='w-[130px]'
                  aria-label='Filter by role'
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
                  setStatusFilter(value as UserStatus | 'all')
                }
              >
                <SelectTrigger
                  className='w-[130px]'
                  aria-label='Filter by status'
                >
                  <SelectValue placeholder='Status' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All status</SelectItem>
                  <SelectItem value='active'>Active</SelectItem>
                  <SelectItem value='invited'>Invited</SelectItem>
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
                        handleBulkAction();
                      }}
                    >
                      Suspend Selected
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setBulkAction('delete');
                        handleBulkAction();
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
                onClick={handleExportUsers}
                aria-label='Export users'
              >
                <Download className='h-4 w-4' />
              </Button>

              <Button
                variant='outline'
                size='icon'
                onClick={fetchUsers}
                aria-label='Refresh user list'
              >
                <RefreshCw className='h-4 w-4' />
              </Button>

              {canManageUsers && (
                <Button onClick={() => setIsInviteDialogOpen(true)}>
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

          <div className='rounded-md border'>
            <Table>
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
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map(u => (
                    <TableRow key={u.id}>
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
                            {u.full_name || 'No name'}
                          </div>
                          <div className='text-sm text-muted-foreground'>
                            {u.email}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getRoleBadgeVariant(u.role)}>
                          {u.role === 'owner' && (
                            <Shield className='mr-1 h-3 w-3' />
                          )}
                          {u.role}
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
                          {u.status}
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
                                  <DropdownMenuItem
                                    onClick={() => handleResendInvitation(u.id)}
                                  >
                                    Resend Invitation
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                </>
                              )}
                              {canChangeRoles && u.role !== 'owner' && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedUserForAction(u);
                                    setNewRole(u.role);
                                    setIsRoleDialogOpen(true);
                                  }}
                                >
                                  Change Role
                                </DropdownMenuItem>
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
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedUserForAction(u);
                                  setIsDeleteDialogOpen(true);
                                }}
                                className='text-destructive'
                              >
                                Delete User
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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
                Page {currentPage} of {totalPages}
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
              <DialogTitle>Invite User</DialogTitle>
              <DialogDescription>
                Send an invitation to a new user to join your organization
              </DialogDescription>
            </DialogHeader>
            <div className='space-y-4'>
              <div>
                <Label htmlFor='invite-email'>Email address</Label>
                <Input
                  id='invite-email'
                  type='email'
                  value={inviteFormData.email}
                  onChange={e =>
                    setInviteFormData(prev => ({
                      ...prev,
                      email: e.target.value,
                    }))
                  }
                  placeholder='user@example.com'
                  required
                />
              </div>
              <div>
                <Label htmlFor='invite-name'>Full name (optional)</Label>
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
                  <SelectTrigger id='invite-role'>
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
                onClick={handleInviteUser}
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
                Update the role for {selectedUserForAction?.email}
              </DialogDescription>
            </DialogHeader>
            <div>
              <Label htmlFor='new-role'>New role</Label>
              <Select
                value={newRole}
                onValueChange={value => setNewRole(value as UserRole)}
              >
                <SelectTrigger id='new-role'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='admin'>Admin</SelectItem>
                  <SelectItem value='viewer'>Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                variant='outline'
                onClick={() => setIsRoleDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleChangeRole} disabled={isSubmitting}>
                Update Role
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete {selectedUserForAction?.email} from
                your organization. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteUser}
                disabled={isSubmitting}
              >
                Delete User
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
