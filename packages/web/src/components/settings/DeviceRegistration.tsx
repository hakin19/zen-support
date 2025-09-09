/* global window, document, navigator, setTimeout */
'use client';

import {
  Search,
  Plus,
  MoreHorizontal,
  Settings,
  RefreshCw,
  Zap,
  Play,
  Trash2,
  Filter,
  Download,
  Upload,
  Copy,
  Activity,
  Wifi,
  WifiOff,
  Clock,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { useState, useEffect, useCallback, useMemo, type JSX } from 'react';

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
import { useToast } from '@/hooks/use-toast';
import { useSession } from '@/hooks/useSession';
import { api } from '@/lib/api-client';
import { useWebSocketStore } from '@/store/websocket.store';

type DeviceStatus = 'online' | 'offline' | 'pending';

interface Device {
  id: string;
  name: string;
  serial_number: string;
  model: string;
  status: DeviceStatus;
  last_seen: string | null;
  ip_address: string | null;
  location: string | null;
  registered_at: string;
  firmware_version: string | null;
  capabilities: string[];
}

interface DeviceFormData {
  name: string;
  serial_number: string;
  location: string;
  capabilities: string[];
}

interface RegistrationResponse {
  success: boolean;
  device_id: string;
  registration_code: string;
}

interface FirmwareUpdate {
  version: string;
  critical: boolean;
}

export function DeviceRegistration(): JSX.Element {
  const { user } = useSession();
  const { toast } = useToast();
  const { devices: wsDevices, isConnected: _wsConnected } = useWebSocketStore();

  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<DeviceStatus | 'all'>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(
    new Set()
  );

  // Dialog states
  const [isRegisterDialogOpen, setIsRegisterDialogOpen] = useState(false);
  const [isConfigureDialogOpen, setIsConfigureDialogOpen] = useState(false);
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false);
  const [isRegistrationSuccessOpen, setIsRegistrationSuccessOpen] =
    useState(false);
  const [isBulkConfirmOpen, setIsBulkConfirmOpen] = useState(false);

  // Form states
  const [deviceFormData, setDeviceFormData] = useState<DeviceFormData>({
    name: '',
    serial_number: '',
    location: '',
    capabilities: ['diagnostics', 'monitoring'],
  });
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [registrationCode, setRegistrationCode] = useState('');
  const [bulkAction, setBulkAction] = useState<
    'restart' | 'enable' | 'disable' | 'remove' | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [firmwareUpdates, setFirmwareUpdates] = useState<
    Record<string, FirmwareUpdate>
  >({});
  const [copySuccess, setCopySuccess] = useState(false);

  const canManageDevices = user?.role === 'owner' || user?.role === 'admin';

  // Get unique locations for filter
  const uniqueLocations = useMemo(() => {
    const locations = devices
      .map(d => d.location)
      .filter((location): location is string => Boolean(location));
    return Array.from(new Set(locations));
  }, [devices]);

  // Filter devices based on search and filters
  const filteredDevices = useMemo(() => {
    return devices.filter(device => {
      const matchesSearch = searchQuery
        ? device.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          device.serial_number
            .toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          device.location?.toLowerCase().includes(searchQuery.toLowerCase())
        : true;
      const matchesStatus =
        statusFilter === 'all' || device.status === statusFilter;
      const matchesLocation =
        locationFilter === 'all' || device.location === locationFilter;
      return matchesSearch && matchesStatus && matchesLocation;
    });
  }, [devices, searchQuery, statusFilter, locationFilter]);

  const fetchDevices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/api/devices');
      setDevices(response.data.devices as Device[]);
      setFirmwareUpdates(
        (response.data.firmware_updates as Record<string, FirmwareUpdate>) ?? {}
      );
    } catch (_err: unknown) {
      setError('Failed to load devices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDevices();
  }, [fetchDevices]);

  // Update devices from WebSocket
  useEffect(() => {
    if (wsDevices.length > 0) {
      setDevices(wsDevices);
    }
  }, [wsDevices]);

  const validateSerialNumber = (serial: string): boolean => {
    // Validate format: RPI-XXX-XXXX
    const serialPattern = /^RPI-\d{3}-[A-Z]{1,10}$/;
    return serialPattern.test(serial);
  };

  const handleRegisterDevice = async () => {
    if (!canManageDevices) return;

    if (!validateSerialNumber(deviceFormData.serial_number)) {
      toast({
        title: 'Invalid serial number format',
        description:
          'Serial number must be in format RPI-XXX-XXXX (e.g., RPI-001-MAIN)',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await api.post<RegistrationResponse>(
        '/api/devices/register',
        {
          name: deviceFormData.name,
          serial_number: deviceFormData.serial_number,
          location: deviceFormData.location,
        }
      );

      setRegistrationCode(response.data.registration_code);
      setIsRegisterDialogOpen(false);
      setIsRegistrationSuccessOpen(true);
      setDeviceFormData({
        name: '',
        serial_number: '',
        location: '',
        capabilities: ['diagnostics', 'monitoring'],
      });
      void fetchDevices();
    } catch (_error: unknown) {
      toast({
        title: 'Registration failed',
        description:
          error instanceof Error ? error.message : 'Failed to register device',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfigureDevice = async () => {
    if (!canManageDevices || !selectedDevice) return;

    try {
      setIsSubmitting(true);
      await api.patch(`/api/devices/${selectedDevice.id}`, {
        name: deviceFormData.name,
        location: deviceFormData.location,
        capabilities: deviceFormData.capabilities,
      });

      toast({
        title: 'Device updated',
        description: 'Device configuration has been updated successfully',
      });

      setIsConfigureDialogOpen(false);
      setSelectedDevice(null);
      void fetchDevices();
    } catch (_error: unknown) {
      toast({
        title: 'Update failed',
        description: 'Failed to update device configuration',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeviceAction = async (deviceId: string, action: string) => {
    if (!canManageDevices) return;

    try {
      await api.post(`/api/devices/${deviceId}/${action}`);

      let message = '';
      switch (action) {
        case 'restart':
          message = 'Restart command sent successfully';
          break;
        case 'wake':
          message = 'Wake command sent successfully';
          break;
        case 'activate':
          message = 'Device activation initiated';
          break;
      }

      toast({
        title: 'Action completed',
        description: message,
      });

      void fetchDevices();
    } catch (_error: unknown) {
      toast({
        title: 'Action failed',
        description: `Failed to ${action} device`,
        variant: 'destructive',
      });
    }
  };

  const handleRemoveDevice = async () => {
    if (!canManageDevices || !selectedDevice) return;

    try {
      setIsSubmitting(true);
      await api.delete(`/api/devices/${selectedDevice.id}`);

      toast({
        title: 'Device removed',
        description: 'Device removed successfully',
      });

      setIsRemoveDialogOpen(false);
      setSelectedDevice(null);
      void fetchDevices();
    } catch (_error: unknown) {
      toast({
        title: 'Removal failed',
        description: 'Failed to remove device',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkAction = async () => {
    if (!canManageDevices || !bulkAction || selectedDevices.size === 0) return;

    try {
      setIsSubmitting(true);
      await api.post(`/api/devices/bulk-${bulkAction}`, {
        device_ids: Array.from(selectedDevices),
      });

      toast({
        title: 'Bulk action completed',
        description: `Successfully ${bulkAction}ed ${selectedDevices.size} device(s)`,
      });

      setSelectedDevices(new Set());
      setBulkAction(null);
      setIsBulkConfirmOpen(false);
      void fetchDevices();
    } catch (_error: unknown) {
      toast({
        title: 'Bulk action failed',
        description: `Failed to ${bulkAction} selected devices`,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateFirmware = async (deviceId: string) => {
    if (!canManageDevices) return;

    try {
      await api.post(`/api/devices/${deviceId}/firmware`);
      toast({
        title: 'Firmware update started',
        description: 'The device will restart automatically when complete',
      });
      void fetchDevices();
    } catch (_error: unknown) {
      toast({
        title: 'Update failed',
        description: 'Failed to start firmware update',
        variant: 'destructive',
      });
    }
  };

  const handleExportDevices = async () => {
    try {
      const blob = await api.getBlob('/api/devices/export');

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `devices-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: 'Export successful',
        description: 'Device list has been exported',
      });
    } catch (_error: unknown) {
      toast({
        title: 'Export failed',
        description: 'Failed to export device list',
        variant: 'destructive',
      });
    }
  };

  const copyRegistrationCode = async () => {
    try {
      await navigator.clipboard.writeText(registrationCode);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
      toast({
        title: 'Code copied',
        description: 'Code copied to clipboard',
      });
    } catch (_error: unknown) {
      toast({
        title: 'Copy failed',
        description: 'Failed to copy registration code',
        variant: 'destructive',
      });
    }
  };

  const openConfigureDialog = (device: Device) => {
    setSelectedDevice(device);
    setDeviceFormData({
      name: device.name,
      serial_number: device.serial_number,
      location: device.location ?? '',
      capabilities: device.capabilities,
    });
    setIsConfigureDialogOpen(true);
  };

  const openRemoveDialog = (device: Device) => {
    setSelectedDevice(device);
    setIsRemoveDialogOpen(true);
  };

  const toggleDeviceSelection = (deviceId: string) => {
    setSelectedDevices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(deviceId)) {
        newSet.delete(deviceId);
      } else {
        newSet.add(deviceId);
      }
      return newSet;
    });
  };

  const toggleAllDevices = () => {
    if (selectedDevices.size === filteredDevices.length) {
      setSelectedDevices(new Set());
    } else {
      setSelectedDevices(new Set(filteredDevices.map(d => d.id)));
    }
  };

  const getStatusIcon = (status: DeviceStatus) => {
    switch (status) {
      case 'online':
        return <Wifi className='h-4 w-4' />;
      case 'offline':
        return <WifiOff className='h-4 w-4' />;
      case 'pending':
        return <Clock className='h-4 w-4' />;
    }
  };

  const getStatusColor = (status: DeviceStatus) => {
    switch (status) {
      case 'online':
        return 'text-green-600';
      case 'offline':
        return 'text-red-600';
      case 'pending':
        return 'text-yellow-600';
    }
  };

  const formatLastSeen = (lastSeen: string | null) => {
    if (!lastSeen) return 'Never';
    return new Date(lastSeen).toLocaleString();
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Device Management</CardTitle>
          <CardDescription>
            Register and manage network devices for your organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className='flex items-center justify-center py-12'
            data-testid='devices-loading'
          >
            <RefreshCw className='h-8 w-8 animate-spin text-muted-foreground' />
            <span className='ml-2'>Loading devices...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Device Management</CardTitle>
          <CardDescription>
            Register and manage network devices for your organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex flex-col items-center justify-center py-12 space-y-4'>
            <AlertCircle className='h-12 w-12 text-destructive' />
            <div className='text-center'>
              <h3 className='text-lg font-semibold'>Failed to load devices</h3>
              <p className='text-muted-foreground'>{error}</p>
            </div>
            <Button onClick={() => void fetchDevices()}>
              <RefreshCw className='mr-2 h-4 w-4' />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <main role='main' aria-label='Device Management'>
      <Card>
        <CardHeader>
          <CardTitle>Device Management</CardTitle>
          <CardDescription>
            Register and manage network devices for your organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='space-y-6'>
            {/* Search and Filter Controls */}
            <div className='flex items-center justify-between gap-4'>
              <div className='flex flex-1 items-center gap-2'>
                <div className='relative flex-1 max-w-sm'>
                  <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                  <Input
                    placeholder='Search devices...'
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className='pl-9'
                    aria-label='Search devices'
                  />
                </div>

                <Select
                  value={statusFilter}
                  onValueChange={value =>
                    setStatusFilter(value as DeviceStatus | 'all')
                  }
                >
                  <SelectTrigger
                    className='w-[150px]'
                    aria-label='Filter by status'
                  >
                    <Filter className='mr-2 h-4 w-4' />
                    <SelectValue placeholder='Status' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>All status</SelectItem>
                    <SelectItem value='online'>Online</SelectItem>
                    <SelectItem value='offline'>Offline</SelectItem>
                    <SelectItem value='pending'>Pending</SelectItem>
                  </SelectContent>
                </Select>

                {uniqueLocations.length > 0 && (
                  <Select
                    value={locationFilter}
                    onValueChange={setLocationFilter}
                  >
                    <SelectTrigger
                      className='w-[150px]'
                      aria-label='Filter by location'
                    >
                      <SelectValue placeholder='Location' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All locations</SelectItem>
                      {uniqueLocations.map(location => (
                        <SelectItem key={location} value={location}>
                          {location}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className='flex items-center gap-2'>
                {selectedDevices.size > 0 && canManageDevices && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant='outline' size='sm'>
                        Bulk Actions ({selectedDevices.size})
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        onClick={() => {
                          setBulkAction('restart');
                          setIsBulkConfirmOpen(true);
                        }}
                      >
                        Restart Selected
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setBulkAction('enable');
                          setIsBulkConfirmOpen(true);
                        }}
                      >
                        Enable Selected
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setBulkAction('disable');
                          setIsBulkConfirmOpen(true);
                        }}
                      >
                        Disable Selected
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          setBulkAction('remove');
                          setIsBulkConfirmOpen(true);
                        }}
                        className='text-destructive'
                      >
                        Remove Selected
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                <Button
                  variant='outline'
                  size='icon'
                  onClick={() => void handleExportDevices()}
                  aria-label='Export devices'
                >
                  <Download className='h-4 w-4' />
                </Button>

                <Button
                  variant='outline'
                  size='icon'
                  onClick={() => void fetchDevices()}
                  aria-label='Refresh device list'
                >
                  <RefreshCw className='h-4 w-4' />
                </Button>

                {canManageDevices && (
                  <Button
                    onClick={() => setIsRegisterDialogOpen(true)}
                    aria-label='Register Device'
                  >
                    <Plus className='mr-2 h-4 w-4' />
                    Register Device
                  </Button>
                )}
              </div>
            </div>

            {/* Access Control Alert */}
            {!canManageDevices && (
              <Alert>
                <AlertCircle className='h-4 w-4' />
                <AlertDescription>
                  You have viewer permissions. Contact an admin to manage
                  devices.
                </AlertDescription>
              </Alert>
            )}

            {/* Device Grid */}
            {filteredDevices.length === 0 ? (
              <div className='text-center py-12'>
                <Activity className='mx-auto h-12 w-12 text-muted-foreground' />
                <h3 className='mt-4 text-lg font-semibold'>
                  No devices registered
                </h3>
                <p className='text-muted-foreground'>
                  Register your first device to get started
                </p>
                {canManageDevices && (
                  <Button
                    onClick={() => setIsRegisterDialogOpen(true)}
                    className='mt-4'
                  >
                    <Plus className='mr-2 h-4 w-4' />
                    Register Device
                  </Button>
                )}
              </div>
            ) : (
              <>
                {canManageDevices && filteredDevices.length > 1 && (
                  <div className='flex items-center gap-2'>
                    <Checkbox
                      checked={
                        selectedDevices.size === filteredDevices.length &&
                        filteredDevices.length > 0
                      }
                      onCheckedChange={toggleAllDevices}
                      aria-label='Select all devices'
                    />
                    <span className='text-sm text-muted-foreground'>
                      {selectedDevices.size > 0 &&
                        `${selectedDevices.size} devices selected`}
                    </span>
                  </div>
                )}

                <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
                  {filteredDevices.map(device => (
                    <Card
                      key={device.id}
                      data-testid={`device-card-${device.id}`}
                      className='relative'
                    >
                      <CardHeader className='pb-3'>
                        <div className='flex items-start justify-between'>
                          <div className='flex-1'>
                            <div className='flex items-center gap-2'>
                              {canManageDevices && (
                                <Checkbox
                                  checked={selectedDevices.has(device.id)}
                                  onCheckedChange={() =>
                                    toggleDeviceSelection(device.id)
                                  }
                                  aria-label={`Select ${device.name}`}
                                />
                              )}
                              <CardTitle className='text-lg'>
                                {device.name}
                              </CardTitle>
                            </div>
                            <CardDescription className='mt-1'>
                              {device.serial_number}
                            </CardDescription>
                          </div>

                          {canManageDevices && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant='ghost'
                                  size='icon'
                                  className='h-8 w-8'
                                >
                                  <MoreHorizontal className='h-4 w-4' />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align='end'>
                                <DropdownMenuItem
                                  onClick={() => openConfigureDialog(device)}
                                >
                                  <Settings className='mr-2 h-4 w-4' />
                                  Configure
                                </DropdownMenuItem>
                                {device.status === 'online' && (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handleDeviceAction(device.id, 'restart')
                                    }
                                  >
                                    <RefreshCw className='mr-2 h-4 w-4' />
                                    Restart
                                  </DropdownMenuItem>
                                )}
                                {device.status === 'offline' && (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handleDeviceAction(device.id, 'wake')
                                    }
                                  >
                                    <Zap className='mr-2 h-4 w-4' />
                                    Wake
                                  </DropdownMenuItem>
                                )}
                                {device.status === 'pending' && (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handleDeviceAction(device.id, 'activate')
                                    }
                                  >
                                    <Play className='mr-2 h-4 w-4' />
                                    Activate
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => openRemoveDialog(device)}
                                  className='text-destructive'
                                >
                                  <Trash2 className='mr-2 h-4 w-4' />
                                  Remove
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </CardHeader>

                      <CardContent className='space-y-3'>
                        <div className='flex items-center justify-between'>
                          <div className='flex items-center gap-2'>
                            {getStatusIcon(device.status)}
                            <Badge
                              variant={
                                device.status === 'online'
                                  ? 'default'
                                  : 'secondary'
                              }
                              className={getStatusColor(device.status)}
                            >
                              {device.status.charAt(0).toUpperCase() +
                                device.status.slice(1)}
                            </Badge>
                          </div>
                          {device.firmware_version && (
                            <Badge variant='outline'>
                              v{device.firmware_version}
                            </Badge>
                          )}
                        </div>

                        {device.location && (
                          <p className='text-sm text-muted-foreground'>
                            {device.location}
                          </p>
                        )}

                        {device.ip_address && (
                          <p className='text-sm font-mono'>
                            {device.ip_address}
                          </p>
                        )}

                        <div className='text-xs text-muted-foreground'>
                          <p>Last seen: {formatLastSeen(device.last_seen)}</p>
                          <p>Model: {device.model}</p>
                        </div>

                        {firmwareUpdates[device.id] && (
                          <div className='flex items-center justify-between p-2 bg-orange-50 rounded-md border border-orange-200'>
                            <div className='flex items-center gap-2'>
                              <Upload className='h-4 w-4 text-orange-600' />
                              <span className='text-sm text-orange-800'>
                                Firmware update available
                              </span>
                              {firmwareUpdates[device.id].critical && (
                                <Badge
                                  variant='destructive'
                                  className='text-xs'
                                >
                                  Critical
                                </Badge>
                              )}
                            </div>
                            {canManageDevices && (
                              <Button
                                size='sm'
                                variant='outline'
                                onClick={() =>
                                  void handleUpdateFirmware(device.id)
                                }
                              >
                                Update Firmware
                              </Button>
                            )}
                          </div>
                        )}

                        {/* Device Action Buttons */}
                        {canManageDevices && (
                          <div className='flex gap-2 pt-2'>
                            {device.status === 'online' && (
                              <Button
                                size='sm'
                                variant='outline'
                                onClick={() =>
                                  handleDeviceAction(device.id, 'restart')
                                }
                              >
                                <RefreshCw className='mr-1 h-3 w-3' />
                                Restart
                              </Button>
                            )}
                            {device.status === 'offline' && (
                              <Button
                                size='sm'
                                variant='outline'
                                onClick={() =>
                                  handleDeviceAction(device.id, 'wake')
                                }
                              >
                                <Zap className='mr-1 h-3 w-3' />
                                Wake
                              </Button>
                            )}
                            {device.status === 'pending' && (
                              <Button
                                size='sm'
                                variant='outline'
                                onClick={() =>
                                  handleDeviceAction(device.id, 'activate')
                                }
                              >
                                <Play className='mr-1 h-3 w-3' />
                                Activate
                              </Button>
                            )}
                            <Button
                              size='sm'
                              variant='outline'
                              onClick={() => openConfigureDialog(device)}
                            >
                              <Settings className='mr-1 h-3 w-3' />
                              Configure
                            </Button>
                            <Button
                              size='sm'
                              variant='outline'
                              onClick={() => openRemoveDialog(device)}
                              className='text-destructive hover:text-destructive'
                            >
                              <Trash2 className='mr-1 h-3 w-3' />
                              Remove
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Register Device Dialog */}
      <Dialog
        open={isRegisterDialogOpen}
        onOpenChange={setIsRegisterDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register New Device</DialogTitle>
            <DialogDescription>
              Add a new device to your network monitoring system
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4'>
            <div>
              <Label htmlFor='device-name'>Device Name</Label>
              <Input
                id='device-name'
                value={deviceFormData.name}
                onChange={e =>
                  setDeviceFormData(prev => ({ ...prev, name: e.target.value }))
                }
                placeholder='Main Office Router'
                required
              />
            </div>
            <div>
              <Label htmlFor='serial-number'>Serial Number</Label>
              <Input
                id='serial-number'
                value={deviceFormData.serial_number}
                onChange={e =>
                  setDeviceFormData(prev => ({
                    ...prev,
                    serial_number: e.target.value,
                  }))
                }
                placeholder='RPI-001-MAIN'
                required
              />
              <p className='text-xs text-muted-foreground mt-1'>
                Format: RPI-XXX-XXXX (e.g., RPI-001-MAIN)
              </p>
            </div>
            <div>
              <Label htmlFor='location'>Location</Label>
              <Input
                id='location'
                value={deviceFormData.location}
                onChange={e =>
                  setDeviceFormData(prev => ({
                    ...prev,
                    location: e.target.value,
                  }))
                }
                placeholder='Server Room A'
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setIsRegisterDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRegisterDevice}
              disabled={
                isSubmitting ||
                !deviceFormData.name ||
                !deviceFormData.serial_number
              }
            >
              {isSubmitting ? 'Registering...' : 'Register'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Registration Success Dialog */}
      <Dialog
        open={isRegistrationSuccessOpen}
        onOpenChange={setIsRegistrationSuccessOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <CheckCircle className='h-5 w-5 text-green-600' />
              Device Registered Successfully
            </DialogTitle>
            <DialogDescription>
              Your device has been registered. Use the code below to complete
              setup.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4'>
            <div>
              <Label>Registration Code:</Label>
              <div className='flex items-center gap-2 mt-2'>
                <Input
                  value={registrationCode}
                  readOnly
                  className='font-mono text-lg text-center'
                />
                <Button
                  size='icon'
                  variant='outline'
                  onClick={copyRegistrationCode}
                  aria-label='Copy Code'
                >
                  {copySuccess ? (
                    <CheckCircle className='h-4 w-4 text-green-600' />
                  ) : (
                    <Copy className='h-4 w-4' />
                  )}
                </Button>
              </div>
              {copySuccess && (
                <p className='text-sm text-green-600 mt-1'>
                  Code copied to clipboard
                </p>
              )}
            </div>
            <Alert>
              <AlertCircle className='h-4 w-4' />
              <AlertDescription>
                Enter this code on the device to complete the registration
                process. The device will automatically connect once configured.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsRegistrationSuccessOpen(false)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Configure Device Dialog */}
      <Dialog
        open={isConfigureDialogOpen}
        onOpenChange={setIsConfigureDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure Device</DialogTitle>
            <DialogDescription>
              Update device settings and capabilities
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4'>
            <div>
              <Label htmlFor='config-name'>Device Name</Label>
              <Input
                id='config-name'
                value={deviceFormData.name}
                onChange={e =>
                  setDeviceFormData(prev => ({ ...prev, name: e.target.value }))
                }
                required
              />
            </div>
            <div>
              <Label htmlFor='config-location'>Location</Label>
              <Input
                id='config-location'
                value={deviceFormData.location}
                onChange={e =>
                  setDeviceFormData(prev => ({
                    ...prev,
                    location: e.target.value,
                  }))
                }
              />
            </div>
            <div>
              <Label>Capabilities</Label>
              <div className='space-y-2 mt-2'>
                {['diagnostics', 'remediation', 'monitoring'].map(
                  capability => (
                    <div
                      key={capability}
                      className='flex items-center space-x-2'
                    >
                      <Checkbox
                        id={capability}
                        checked={deviceFormData.capabilities.includes(
                          capability
                        )}
                        onCheckedChange={checked => {
                          if (checked) {
                            setDeviceFormData(prev => ({
                              ...prev,
                              capabilities: [...prev.capabilities, capability],
                            }));
                          } else {
                            setDeviceFormData(prev => ({
                              ...prev,
                              capabilities: prev.capabilities.filter(
                                c => c !== capability
                              ),
                            }));
                          }
                        }}
                      />
                      <Label htmlFor={capability} className='capitalize'>
                        {capability}
                      </Label>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setIsConfigureDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfigureDevice}
              disabled={isSubmitting || !deviceFormData.name}
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Device Dialog */}
      <AlertDialog
        open={isRemoveDialogOpen}
        onOpenChange={setIsRemoveDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Device</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {selectedDevice?.name}? This
              action cannot be undone. The device will no longer be able to
              connect to your network.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveDevice}
              disabled={isSubmitting}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isSubmitting ? 'Removing...' : 'Confirm Removal'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Action Confirmation Dialog */}
      <AlertDialog open={isBulkConfirmOpen} onOpenChange={setIsBulkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bulk Action Confirmation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {bulkAction} {selectedDevices.size}{' '}
              device(s)?
              {bulkAction === 'remove' && ' This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBulkAction(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkAction}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Processing...' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
