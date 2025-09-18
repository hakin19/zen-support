'use client';

import {
  Search,
  Filter,
  Plus,
  MoreHorizontal,
  Copy,
  Trash2,
  Eye,
  Power,
  Download,
  RefreshCw,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import React, { useState, useEffect, useMemo, type JSX } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth.store';
import {
  useDeviceStore,
  type Device,
  type DeviceStatus,
} from '@/store/device.store';
import { useWebSocketStore } from '@/store/websocket.store';

function DeviceManagement(): JSX.Element {
  const { toast } = useToast();
  const user = useAuthStore(state => state.user);
  const {
    devices,
    loading,
    error,
    currentPage,
    totalPages,
    fetchDevices,
    registerDevice,
    deleteDevice,
    updateDeviceStatus,
    updateDeviceHeartbeat,
    addDevice,
    removeDevice,
    upsertDevice,
    webSocketClient,
  } = useDeviceStore();
  const connect = useWebSocketStore(state => state.connect);
  const disconnect = useWebSocketStore(state => state.disconnect);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');

  // Registration modal state
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);
  const [registrationData, setRegistrationData] = useState({
    name: '',
    serial_number: '',
    location: '',
    description: '',
  });
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activationCode, setActivationCode] = useState<string | null>(null);

  // Device actions state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [viewDetailsDevice, setViewDetailsDevice] = useState<Device | null>(
    null
  );

  // User permissions
  const canManageDevices = user?.role === 'owner' || user?.role === 'admin';

  // Fetch devices on mount
  useEffect(() => {
    void fetchDevices();
  }, [fetchDevices]);

  // Connect to WebSocket on mount, disconnect on unmount
  useEffect(() => {
    void connect();
    return () => disconnect();
  }, [connect, disconnect]);

  // WebSocket subscriptions
  useEffect(() => {
    if (!webSocketClient) return;

    const handleStatusChange = (data: unknown): void => {
      const eventData = data as {
        deviceId: string;
        status: DeviceStatus;
        lastSeen?: string | null;
      };
      updateDeviceStatus(eventData.deviceId, eventData.status);
      if (eventData.lastSeen) {
        updateDeviceHeartbeat(eventData.deviceId, eventData.lastSeen);
      }
    };

    const handleDeviceRegistered = (data: unknown): void => {
      const eventData = data as { device: Device };
      addDevice(eventData.device);
    };

    const handleDeviceDeleted = (data: unknown): void => {
      const eventData = data as { deviceId: string };
      removeDevice(eventData.deviceId);
    };

    const handleDeviceUpdated = (data: unknown): void => {
      const eventData = data as { device: Device };

      if (!eventData.device?.id) return;

      upsertDevice({
        ...eventData.device,
        last_heartbeat:
          eventData.device.last_heartbeat ??
          eventData.device.last_heartbeat_at ??
          null,
      });
    };

    webSocketClient.subscribe('device_status', handleStatusChange);
    webSocketClient.subscribe('device_registered', handleDeviceRegistered);
    webSocketClient.subscribe('device_removed', handleDeviceDeleted);
    webSocketClient.subscribe('device_updated', handleDeviceUpdated);

    return (): void => {
      webSocketClient.unsubscribe('device_status');
      webSocketClient.unsubscribe('device_registered');
      webSocketClient.unsubscribe('device_removed');
      webSocketClient.unsubscribe('device_updated');
    };
  }, [
    webSocketClient,
    updateDeviceStatus,
    addDevice,
    removeDevice,
    updateDeviceHeartbeat,
    upsertDevice,
  ]);

  // Filter devices based on search and filters
  const filteredDevices = useMemo(() => {
    return devices.filter(device => {
      const matchesSearch =
        !searchQuery ||
        device.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        device.device_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        device.location.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'all' || device.status === statusFilter;

      const matchesLocation =
        locationFilter === 'all' || device.location === locationFilter;

      return matchesSearch && matchesStatus && matchesLocation;
    });
  }, [devices, searchQuery, statusFilter, locationFilter]);

  // Get unique locations for filter
  const uniqueLocations = useMemo(() => {
    return Array.from(new Set(devices.map(d => d.location))).sort();
  }, [devices]);

  const getDeviceLastHeartbeat = (device: Device): string | null => {
    return device.last_heartbeat ?? device.last_heartbeat_at ?? null;
  };

  // Filter count for UI badge
  const filterCount = useMemo(() => {
    let count = 0;
    if (searchQuery) count++;
    if (statusFilter !== 'all') count++;
    if (locationFilter !== 'all') count++;
    return count;
  }, [searchQuery, statusFilter, locationFilter]);

  const getStatusBadgeVariant = (
    status: DeviceStatus
  ): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (status) {
      case 'online':
        return 'default';
      case 'offline':
        return 'secondary';
      case 'error':
        return 'destructive';
      case 'pending':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  const getStatusIcon = (status: DeviceStatus): JSX.Element | null => {
    switch (status) {
      case 'online':
        return <CheckCircle2 className='mr-1 h-3 w-3' />;
      case 'offline':
        return <XCircle className='mr-1 h-3 w-3' />;
      case 'error':
        return <AlertCircle className='mr-1 h-3 w-3' />;
      case 'pending':
        return <Clock className='mr-1 h-3 w-3' />;
      default:
        return null;
    }
  };

  const formatStatus = (status: DeviceStatus): string => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const formatLastSeen = (timestamp: string | null): string => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;

    const days = Math.floor(diffInHours / 24);
    return `${days} days ago`;
  };

  const handleRegisterDevice = async (): Promise<void> => {
    // Validate required fields
    const errors: Record<string, string> = {};
    if (!registrationData.name.trim()) {
      errors.name = 'Device name is required';
    }
    if (!registrationData.serial_number.trim()) {
      errors.serial_number = 'Serial number is required';
    }
    if (!registrationData.location.trim()) {
      errors.location = 'Location is required';
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setIsSubmitting(true);
    setValidationErrors({});

    try {
      const result = await registerDevice(registrationData);
      setActivationCode(result.activationCode);
      toast({
        title: 'Device Registered Successfully',
        description:
          'Use the activation code on your device to complete setup.',
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to register device';
      toast({
        title: 'Registration Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyActivationCode = async (): Promise<void> => {
    if (!activationCode) return;

    try {
      await navigator.clipboard.writeText(activationCode);
      toast({
        title: 'Copied to clipboard',
        description: 'The activation code has been copied to your clipboard.',
      });
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Failed to copy to clipboard',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteDevice = async (deviceId: string): Promise<void> => {
    try {
      await deleteDevice(deviceId);
      toast({
        title: 'Device deleted',
        description: 'The device has been removed successfully.',
      });
      setDeleteConfirmId(null);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to delete device';
      toast({
        title: 'Delete failed',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const handleDisableDevice = async (deviceId: string): Promise<void> => {
    try {
      // Use 'offline' status since backend doesn't have 'disabled' status
      const response = await api.patch<{ device: Device }>(
        `/api/devices/${deviceId}`,
        {
          status: 'offline',
        }
      );
      // Update local state with the actual device data from response
      upsertDevice({
        ...response.data.device,
        last_heartbeat:
          response.data.device.last_heartbeat ??
          response.data.device.last_heartbeat_at ??
          null,
      });
      updateDeviceStatus(deviceId, response.data.device.status);
      toast({
        title: 'Device disabled',
        description: 'The device has been set to offline status.',
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'An error occurred';
      toast({
        title: 'Failed to disable device',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const handleExportCSV = (): void => {
    const csv = [
      [
        'Name',
        'Device ID',
        'Status',
        'Location',
        'IP Address',
        'Last Heartbeat',
        'Registered At',
      ],
      ...filteredDevices.map(d => [
        d.name,
        d.device_id,
        d.status,
        d.location,
        d.ip_address ?? '',
        getDeviceLastHeartbeat(d) ?? '',
        d.registered_at,
      ]),
    ]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `devices-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const clearFilters = (): void => {
    setSearchQuery('');
    setStatusFilter('all');
    setLocationFilter('all');
  };

  const closeRegistrationModal = (): void => {
    setIsRegistrationOpen(false);
    setRegistrationData({
      name: '',
      serial_number: '',
      location: '',
      description: '',
    });
    setActivationCode(null);
    setValidationErrors({});
    if (activationCode) {
      void fetchDevices();
    }
  };

  const handleRetry = (): void => {
    void fetchDevices();
  };

  // Loading state
  if (loading && devices.length === 0) {
    return (
      <div className='flex items-center justify-center min-h-[400px]'>
        <div className='text-muted-foreground'>Loading devices...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className='flex flex-col items-center justify-center min-h-[400px] gap-4'>
        <AlertCircle className='h-8 w-8 text-destructive' />
        <div className='text-muted-foreground'>{error}</div>
        <Button onClick={handleRetry} variant='outline'>
          <RefreshCw className='mr-2 h-4 w-4' />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className='container mx-auto py-8'>
      <div className='mb-8'>
        <h1 className='text-3xl font-bold mb-2'>Device Management</h1>
        <p className='text-muted-foreground'>
          Manage and monitor your network devices
        </p>
      </div>

      {/* Filters and Actions */}
      <div className='flex flex-col gap-4 mb-6'>
        <div className='flex flex-col sm:flex-row gap-4'>
          <div className='relative flex-1'>
            <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground' />
            <Input
              placeholder='Search devices...'
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className='pl-10'
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger
              className='w-full sm:w-[180px]'
              aria-label='Status filter'
            >
              <SelectValue placeholder='Filter by status' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Status</SelectItem>
              <SelectItem value='online'>Online</SelectItem>
              <SelectItem value='offline'>Offline</SelectItem>
              <SelectItem value='error'>Error</SelectItem>
              <SelectItem value='pending'>Pending</SelectItem>
            </SelectContent>
          </Select>

          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger
              className='w-full sm:w-[180px]'
              aria-label='Location filter'
            >
              <SelectValue placeholder='Filter by location' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Locations</SelectItem>
              {uniqueLocations.map(location => (
                <SelectItem key={location} value={location}>
                  {location}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {filterCount > 0 && (
            <Button variant='outline' onClick={clearFilters}>
              <Filter className='mr-2 h-4 w-4' />
              Clear Filters
              <Badge
                variant='secondary'
                className='ml-2'
                data-testid='filter-count'
              >
                {filterCount}
              </Badge>
            </Button>
          )}
        </div>

        <div className='flex justify-between items-center'>
          <div className='text-sm text-muted-foreground'>
            Showing {filteredDevices.length} of {devices.length} devices
          </div>

          <div className='flex gap-2'>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='outline' size='sm'>
                  <Download className='mr-2 h-4 w-4' />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={handleExportCSV}>
                  Export as CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {canManageDevices && (
              <Button onClick={(): void => setIsRegistrationOpen(true)}>
                <Plus className='mr-2 h-4 w-4' />
                Register Device
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Device Table */}
      {filteredDevices.length === 0 ? (
        <div className='flex flex-col items-center justify-center min-h-[300px] gap-4'>
          <div className='text-muted-foreground text-center'>
            <div className='text-lg font-medium mb-2'>No devices found</div>
            <div className='text-sm'>
              {devices.length === 0
                ? 'Get started by registering your first device'
                : 'Try adjusting your search or filter criteria'}
            </div>
          </div>
        </div>
      ) : (
        <div className='border rounded-lg'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Last Seen</TableHead>
                <TableHead className='w-[100px]'>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDevices.map(device => {
                const lastHeartbeat = getDeviceLastHeartbeat(device);

                return (
                  <TableRow
                    key={device.id}
                    data-testid={`device-row-${device.id}`}
                  >
                    <TableCell>
                      <div>
                        <div className='font-medium'>{device.name}</div>
                        <div className='text-sm text-muted-foreground'>
                          {device.device_id}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={getStatusBadgeVariant(device.status)}
                        className={
                          device.status === 'online'
                            ? 'bg-green-100 text-green-800'
                            : device.status === 'offline'
                              ? 'bg-gray-100 text-gray-800'
                              : device.status === 'error'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                        }
                        data-testid={`status-badge-${device.status}`}
                      >
                        {getStatusIcon(device.status)}
                        {formatStatus(device.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{device.location}</TableCell>
                    <TableCell>{device.ip_address ?? '-'}</TableCell>
                    <TableCell>
                      {lastHeartbeat && (
                        <div className='text-sm'>
                          <div>Last seen:</div>
                          <div className='text-muted-foreground'>
                            {formatLastSeen(lastHeartbeat)}
                          </div>
                        </div>
                      )}
                      {device.status === 'error' && device.error_message && (
                        <div className='text-sm text-destructive'>
                          {device.error_message}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant='ghost'
                            size='sm'
                            aria-label='Actions'
                          >
                            <MoreHorizontal className='h-4 w-4' />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='end'>
                          <DropdownMenuItem
                            onClick={(): void => setViewDetailsDevice(device)}
                          >
                            <Eye className='mr-2 h-4 w-4' />
                            View Details
                          </DropdownMenuItem>
                          {canManageDevices && (
                            <>
                              <DropdownMenuItem
                                onClick={(): void => {
                                  void handleDisableDevice(device.id);
                                }}
                              >
                                <Power className='mr-2 h-4 w-4' />
                                Disable Device
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(): void =>
                                  setDeleteConfirmId(device.id)
                                }
                                className='text-destructive'
                              >
                                <Trash2 className='mr-2 h-4 w-4' />
                                Delete Device
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className='flex justify-center items-center gap-2 mt-6'>
          <Button
            variant='outline'
            size='sm'
            onClick={(): void => {
              void fetchDevices({ page: currentPage - 1 });
            }}
            disabled={currentPage === 1}
            aria-label='Previous page'
          >
            Previous
          </Button>
          <span className='text-sm text-muted-foreground'>
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant='outline'
            size='sm'
            onClick={(): void => {
              void fetchDevices({ page: currentPage + 1 });
            }}
            disabled={currentPage === totalPages}
            aria-label='Next page'
          >
            Next
          </Button>
        </div>
      )}

      {/* Registration Modal */}
      <Dialog open={isRegistrationOpen} onOpenChange={closeRegistrationModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {activationCode
                ? 'Device Registered Successfully'
                : 'Register New Device'}
            </DialogTitle>
          </DialogHeader>

          {!activationCode ? (
            <div className='space-y-4'>
              <div>
                <Label htmlFor='device-name'>Device Name *</Label>
                <Input
                  id='device-name'
                  value={registrationData.name}
                  onChange={e =>
                    setRegistrationData(prev => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  placeholder='e.g., Office Router'
                  className={validationErrors.name ? 'border-destructive' : ''}
                />
                {validationErrors.name && (
                  <p className='text-sm text-destructive mt-1'>
                    {validationErrors.name}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor='device-serial'>Serial Number *</Label>
                <Input
                  id='device-serial'
                  value={registrationData.serial_number}
                  onChange={e =>
                    setRegistrationData(prev => ({
                      ...prev,
                      serial_number: e.target.value,
                    }))
                  }
                  placeholder='e.g., ABC123456'
                  className={
                    validationErrors.serial_number ? 'border-destructive' : ''
                  }
                />
                {validationErrors.serial_number && (
                  <p className='text-sm text-destructive mt-1'>
                    {validationErrors.serial_number}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor='device-location'>Location *</Label>
                <Input
                  id='device-location'
                  value={registrationData.location}
                  onChange={e =>
                    setRegistrationData(prev => ({
                      ...prev,
                      location: e.target.value,
                    }))
                  }
                  placeholder='e.g., Main Office'
                  className={
                    validationErrors.location ? 'border-destructive' : ''
                  }
                />
                {validationErrors.location && (
                  <p className='text-sm text-destructive mt-1'>
                    {validationErrors.location}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor='device-description'>Description</Label>
                <Textarea
                  id='device-description'
                  value={registrationData.description}
                  onChange={e =>
                    setRegistrationData(prev => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder='Optional description'
                  className='h-20'
                />
              </div>
            </div>
          ) : (
            <div className='space-y-4'>
              <div className='text-center'>
                <div className='text-lg font-medium text-green-600 mb-2'>
                  ✓ Registration Complete
                </div>
                <p className='text-sm text-muted-foreground mb-4'>
                  Use this activation code on your device to complete setup.
                </p>
                <div className='flex items-center justify-center gap-2 p-4 bg-muted rounded-lg'>
                  <code className='text-lg font-mono font-bold'>
                    {activationCode}
                  </code>
                  <Button
                    size='icon'
                    variant='ghost'
                    onClick={(): void => {
                      void handleCopyActivationCode();
                    }}
                    aria-label='Copy code'
                  >
                    <Copy className='h-4 w-4' />
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            {!activationCode ? (
              <>
                <Button
                  variant='outline'
                  onClick={(): void => setIsRegistrationOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={(): void => {
                    void handleRegisterDevice();
                  }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Registering...' : 'Register'}
                </Button>
              </>
            ) : (
              <Button onClick={closeRegistrationModal}>Done</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteConfirmId}
        onOpenChange={(): void => setDeleteConfirmId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to delete this device?</p>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={(): void => setDeleteConfirmId(null)}
            >
              Cancel
            </Button>
            <Button
              variant='destructive'
              onClick={(): void => {
                if (deleteConfirmId) {
                  void handleDeleteDevice(deleteConfirmId);
                }
              }}
              aria-label='Confirm delete'
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Device Details Modal */}
      <Dialog
        open={!!viewDetailsDevice}
        onOpenChange={(): void => setViewDetailsDevice(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Device Details</DialogTitle>
          </DialogHeader>
          {viewDetailsDevice && (
            <div className='space-y-4'>
              <div className='grid grid-cols-2 gap-4'>
                <div>
                  <Label>Name</Label>
                  <p className='text-sm'>{viewDetailsDevice.name}</p>
                </div>
                <div>
                  <Label>Device ID</Label>
                  <p className='text-sm font-mono'>
                    {viewDetailsDevice.device_id}
                  </p>
                </div>
                <div>
                  <Label>Status</Label>
                  <Badge
                    variant={getStatusBadgeVariant(viewDetailsDevice.status)}
                  >
                    {getStatusIcon(viewDetailsDevice.status)}
                    {formatStatus(viewDetailsDevice.status)}
                  </Badge>
                </div>
                <div>
                  <Label>Location</Label>
                  <p className='text-sm'>{viewDetailsDevice.location}</p>
                </div>
                <div>
                  <Label>IP Address</Label>
                  <p className='text-sm font-mono'>
                    {viewDetailsDevice.ip_address ?? 'Not assigned'}
                  </p>
                </div>
                <div>
                  <Label>Firmware Version</Label>
                  <p className='text-sm'>
                    {viewDetailsDevice.firmware_version ?? 'Unknown'}
                  </p>
                </div>
                <div>
                  <Label>Last Heartbeat</Label>
                  <p className='text-sm'>
                    {formatLastSeen(getDeviceLastHeartbeat(viewDetailsDevice))}
                  </p>
                </div>
                <div>
                  <Label>Registered</Label>
                  <p className='text-sm'>
                    {new Date(
                      viewDetailsDevice.registered_at
                    ).toLocaleDateString()}
                  </p>
                </div>
              </div>
              {viewDetailsDevice.description && (
                <div>
                  <Label>Description</Label>
                  <p className='text-sm'>{viewDetailsDevice.description}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={(): void => setViewDetailsDevice(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default DeviceManagement;
