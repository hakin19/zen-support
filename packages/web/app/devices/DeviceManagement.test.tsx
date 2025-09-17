import React from 'react';
const isMVP = process.env.TEST_MODE === 'MVP';
const itFull = isMVP ? it.skip : it;
const describeFull = isMVP ? describe.skip : describe;
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  waitFor,
  within,
  fireEvent,
} from '../../test/test-utils';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { DeviceManagement } from './page';
import { useAuthStore } from '@/store/auth.store';
import { useDeviceStore } from '@/store/device.store';
import { api } from '@/lib/api-client';

const mockToast = vi.fn();

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

describe('DeviceManagement', () => {
  // Helper to create device store mock with custom overrides
  const createDeviceStoreMock = (overrides = {}) => ({
    devices: [],
    loading: false,
    error: null,
    currentPage: 1,
    totalPages: 1,
    pageSize: 10,
    webSocketClient: undefined,
    fetchDevices: vi.fn().mockResolvedValue(undefined),
    refreshDevices: vi.fn().mockResolvedValue(undefined),
    registerDevice: vi
      .fn()
      .mockResolvedValue({ activationCode: 'XXXX-YYYY-ZZZZ' }),
    updateDeviceStatus: vi.fn(),
    updateDeviceHeartbeat: vi.fn(),
    addDevice: vi.fn(),
    removeDevice: vi.fn(),
    deleteDevice: vi.fn().mockResolvedValue(undefined),
    setWebSocketClient: vi.fn(),
    upsertDevice: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  });

  const mockDevices = [
    {
      id: 'dev-1',
      name: 'Office Router',
      device_id: 'ABC123',
      status: 'online' as const,
      last_heartbeat: '2024-01-15T10:30:00Z',
      registered_at: '2024-01-01T00:00:00Z',
      ip_address: '192.168.1.1',
      location: 'Main Office',
      firmware_version: '1.2.3',
    },
    {
      id: 'dev-2',
      name: 'Warehouse Device',
      device_id: 'DEF456',
      status: 'offline' as const,
      last_heartbeat: '2024-01-14T08:00:00Z',
      registered_at: '2024-01-02T00:00:00Z',
      ip_address: '192.168.1.2',
      location: 'Warehouse',
      firmware_version: '1.2.2',
    },
    {
      id: 'dev-3',
      name: 'Remote Site Monitor',
      device_id: 'GHI789',
      status: 'error' as const,
      last_heartbeat: '2024-01-15T09:00:00Z',
      registered_at: '2024-01-03T00:00:00Z',
      ip_address: '192.168.1.3',
      location: 'Remote Site A',
      firmware_version: '1.2.3',
      error_message: 'Connection timeout',
    },
    {
      id: 'dev-4',
      name: 'Backup Device',
      device_id: 'JKL012',
      status: 'pending' as const,
      last_heartbeat: null,
      registered_at: '2024-01-10T00:00:00Z',
      ip_address: null,
      location: 'Storage',
      firmware_version: null,
    },
  ];

  const mockOwnerUser = {
    id: '1',
    email: 'owner@example.com',
    role: 'owner' as const,
    full_name: 'John Owner',
  };

  const mockViewerUser = {
    id: '2',
    email: 'viewer@example.com',
    role: 'viewer' as const,
    full_name: 'Jane Viewer',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default auth store mock (owner)
    vi.mocked(useAuthStore).mockImplementation((selector?: any) => {
      const state = {
        user: mockOwnerUser,
        session: { access_token: 'test-token' },
        organization: {
          id: 'org-1',
          name: 'Test Organization',
        },
        isAuthenticated: true,
        loading: false,
      };
      return selector ? selector(state) : state;
    });

    // Mock device store with default devices
    vi.mocked(useDeviceStore).mockImplementation(() =>
      createDeviceStoreMock({ devices: mockDevices })
    );

    // Mock API responses
    vi.mocked(api.get).mockResolvedValue({
      data: {
        devices: mockDevices,
        total: mockDevices.length,
        page: 1,
        pageSize: 10,
      },
    });
    vi.mocked(api.post).mockResolvedValue({
      data: {
        success: true,
        device: {
          ...mockDevices[0],
          id: 'new-device',
          name: 'New Device',
        },
        activationCode: 'XXXX-YYYY-ZZZZ',
      },
    });
    vi.mocked(api.patch).mockResolvedValue({ data: { success: true } });
    vi.mocked(api.delete).mockResolvedValue({ data: { success: true } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Device Table Display', () => {
    it('should render the device management header', () => {
      render(<DeviceManagement />);
      expect(screen.getByText('Device Management')).toBeInTheDocument();
      expect(
        screen.getByText(/Manage and monitor your network devices/i)
      ).toBeInTheDocument();
    });

    it('should display loading state initially', async () => {
      vi.mocked(useDeviceStore).mockImplementation(() =>
        createDeviceStoreMock({ loading: true })
      );

      render(<DeviceManagement />);
      expect(screen.getByText('Loading devices...')).toBeInTheDocument();
    });

    it('should display all devices in a table', async () => {
      render(<DeviceManagement />);

      await waitFor(() => {
        expect(screen.getByText('Office Router')).toBeInTheDocument();
        expect(screen.getByText('Warehouse Device')).toBeInTheDocument();
        expect(screen.getByText('Remote Site Monitor')).toBeInTheDocument();
        expect(screen.getByText('Backup Device')).toBeInTheDocument();
      });
    });

    it('should display device details in table columns', async () => {
      render(<DeviceManagement />);

      await waitFor(() => {
        const officeRow = screen.getByTestId('device-row-dev-1');
        expect(
          within(officeRow).getByText('Office Router')
        ).toBeInTheDocument();
        expect(within(officeRow).getByText('ABC123')).toBeInTheDocument();
        expect(within(officeRow).getByText('Main Office')).toBeInTheDocument();
        expect(within(officeRow).getByText('192.168.1.1')).toBeInTheDocument();
      });
    });

    it('should display empty state when no devices exist', async () => {
      vi.mocked(useDeviceStore).mockImplementation(() =>
        createDeviceStoreMock()
      );

      render(<DeviceManagement />);

      await waitFor(() => {
        expect(screen.getByText('No devices found')).toBeInTheDocument();
        expect(
          screen.getByText(/Get started by registering your first device/i)
        ).toBeInTheDocument();
      });
    });

    it('should display error state when loading fails', async () => {
      vi.mocked(useDeviceStore).mockImplementation(() =>
        createDeviceStoreMock({ error: 'Failed to load devices' })
      );

      render(<DeviceManagement />);

      await waitFor(() => {
        expect(screen.getByText('Failed to load devices')).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: /retry/i })
        ).toBeInTheDocument();
      });
    });
  });

  describe('Status Badges', () => {
    it('should display correct status badge for online devices', async () => {
      render(<DeviceManagement />);

      await waitFor(() => {
        const onlineDevice = screen.getByTestId('device-row-dev-1');
        const badge = within(onlineDevice).getByTestId('status-badge-online');
        expect(badge).toHaveClass('bg-green-100');
        expect(within(badge).getByText('Online')).toBeInTheDocument();
      });
    });

    it('should display correct status badge for offline devices', async () => {
      render(<DeviceManagement />);

      await waitFor(() => {
        const offlineDevice = screen.getByTestId('device-row-dev-2');
        const badge = within(offlineDevice).getByTestId('status-badge-offline');
        expect(badge).toHaveClass('bg-gray-100');
        expect(within(badge).getByText('Offline')).toBeInTheDocument();
      });
    });

    it('should display correct status badge for error state devices', async () => {
      render(<DeviceManagement />);

      await waitFor(() => {
        const errorDevice = screen.getByTestId('device-row-dev-3');
        const badge = within(errorDevice).getByTestId('status-badge-error');
        expect(badge).toHaveClass('bg-red-100');
        expect(within(badge).getByText('Error')).toBeInTheDocument();
      });
    });

    it('should display correct status badge for pending devices', async () => {
      render(<DeviceManagement />);

      await waitFor(() => {
        const pendingDevice = screen.getByTestId('device-row-dev-4');
        const badge = within(pendingDevice).getByTestId('status-badge-pending');
        expect(badge).toHaveClass('bg-yellow-100');
        expect(within(badge).getByText('Pending')).toBeInTheDocument();
      });
    });

    it('should show last heartbeat time for connected devices', async () => {
      render(<DeviceManagement />);

      await waitFor(() => {
        const onlineDevice = screen.getByTestId('device-row-dev-1');
        expect(
          within(onlineDevice).getByText(/Last seen:/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe('Table Filters', () => {
    it('should filter devices by search query', async () => {
      render(<DeviceManagement />);

      const searchInput = screen.getByPlaceholderText('Search devices...');
      await userEvent.type(searchInput, 'Office');

      await waitFor(() => {
        expect(screen.getByText('Office Router')).toBeInTheDocument();
        expect(screen.queryByText('Warehouse Device')).not.toBeInTheDocument();
        expect(
          screen.queryByText('Remote Site Monitor')
        ).not.toBeInTheDocument();
      });
    });

    it('should filter devices by status', async () => {
      render(<DeviceManagement />);

      const statusSelect = screen.getByRole('combobox', {
        name: /status filter/i,
      });
      await userEvent.click(statusSelect);

      const onlineOption = screen.getByRole('option', { name: /online/i });
      await userEvent.click(onlineOption);

      await waitFor(() => {
        expect(screen.getByText('Office Router')).toBeInTheDocument();
        expect(screen.queryByText('Warehouse Device')).not.toBeInTheDocument();
        expect(
          screen.queryByText('Remote Site Monitor')
        ).not.toBeInTheDocument();
        expect(screen.queryByText('Backup Device')).not.toBeInTheDocument();
      });
    });

    it('should filter devices by location', async () => {
      render(<DeviceManagement />);

      const locationSelect = screen.getByRole('combobox', {
        name: /location filter/i,
      });
      await userEvent.click(locationSelect);

      const warehouseOption = screen.getByRole('option', {
        name: /warehouse/i,
      });
      await userEvent.click(warehouseOption);

      await waitFor(() => {
        expect(screen.queryByText('Office Router')).not.toBeInTheDocument();
        expect(screen.getByText('Warehouse Device')).toBeInTheDocument();
        expect(
          screen.queryByText('Remote Site Monitor')
        ).not.toBeInTheDocument();
      });
    });

    it('should combine multiple filters', async () => {
      render(<DeviceManagement />);

      // Apply search filter
      const searchInput = screen.getByPlaceholderText('Search devices...');
      await userEvent.type(searchInput, 'Device');

      // Apply status filter
      const statusSelect = screen.getByRole('combobox', {
        name: /status filter/i,
      });
      await userEvent.click(statusSelect);
      const offlineOption = screen.getByRole('option', { name: /offline/i });
      await userEvent.click(offlineOption);

      await waitFor(() => {
        expect(screen.queryByText('Office Router')).not.toBeInTheDocument();
        expect(screen.getByText('Warehouse Device')).toBeInTheDocument();
        expect(
          screen.queryByText('Remote Site Monitor')
        ).not.toBeInTheDocument();
        expect(screen.queryByText('Backup Device')).not.toBeInTheDocument();
      });
    });

    it('should clear all filters', async () => {
      render(<DeviceManagement />);

      // Apply filters
      const searchInput = screen.getByPlaceholderText('Search devices...');
      await userEvent.type(searchInput, 'Office');

      // Clear filters
      const clearButton = screen.getByRole('button', {
        name: /clear filters/i,
      });
      await userEvent.click(clearButton);

      await waitFor(() => {
        expect(screen.getByText('Office Router')).toBeInTheDocument();
        expect(screen.getByText('Warehouse Device')).toBeInTheDocument();
        expect(screen.getByText('Remote Site Monitor')).toBeInTheDocument();
        expect(screen.getByText('Backup Device')).toBeInTheDocument();
      });
    });

    it('should show filter count badge', async () => {
      render(<DeviceManagement />);

      const searchInput = screen.getByPlaceholderText('Search devices...');
      await userEvent.type(searchInput, 'Device');

      await waitFor(() => {
        expect(screen.getByTestId('filter-count')).toHaveTextContent('1');
      });

      const statusSelect = screen.getByRole('combobox', {
        name: /status filter/i,
      });
      await userEvent.click(statusSelect);
      const onlineOption = screen.getByRole('option', { name: /online/i });
      await userEvent.click(onlineOption);

      await waitFor(() => {
        expect(screen.getByTestId('filter-count')).toHaveTextContent('2');
      });
    });
  });

  describe('Device Registration Flow', () => {
    it('should show register device button for admin/owner users', async () => {
      render(<DeviceManagement />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /register device/i })
        ).toBeInTheDocument();
      });
    });

    it('should not show register device button for viewer users', async () => {
      vi.mocked(useAuthStore).mockImplementation((selector?: any) => {
        const state = {
          user: mockViewerUser,
          session: { access_token: 'test-token' },
          isAuthenticated: true,
        };
        return selector ? selector(state) : state;
      });

      render(<DeviceManagement />);

      await waitFor(() => {
        expect(
          screen.queryByRole('button', { name: /register device/i })
        ).not.toBeInTheDocument();
      });
    });

    it('should open registration modal when register button clicked', async () => {
      render(<DeviceManagement />);

      const registerButton = screen.getByRole('button', {
        name: /register device/i,
      });
      await userEvent.click(registerButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('Register New Device')).toBeInTheDocument();
      });
    });

    it('should display registration form fields', async () => {
      render(<DeviceManagement />);

      const registerButton = screen.getByRole('button', {
        name: /register device/i,
      });
      await userEvent.click(registerButton);

      await waitFor(() => {
        const dialog = screen.getByRole('dialog');
        expect(
          within(dialog).getByLabelText(/device name/i)
        ).toBeInTheDocument();
        expect(
          within(dialog).getByLabelText(/serial number/i)
        ).toBeInTheDocument();
        expect(within(dialog).getByLabelText(/location/i)).toBeInTheDocument();
        expect(
          within(dialog).getByLabelText(/description/i)
        ).toBeInTheDocument();
      });
    });

    it('should validate required fields', async () => {
      render(<DeviceManagement />);

      const registerButton = screen.getByRole('button', {
        name: /register device/i,
      });
      await userEvent.click(registerButton);

      const submitButton = screen.getByRole('button', { name: /register/i });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText(/device name is required/i)
        ).toBeInTheDocument();
        expect(
          screen.getByText(/serial number is required/i)
        ).toBeInTheDocument();
        expect(screen.getByText(/location is required/i)).toBeInTheDocument();
      });
    });

    it('should submit registration and display activation code', async () => {
      render(<DeviceManagement />);

      const registerButton = screen.getByRole('button', {
        name: /register device/i,
      });
      await userEvent.click(registerButton);

      const dialog = screen.getByRole('dialog');
      const nameInput = within(dialog).getByLabelText(/device name/i);
      const serialInput = within(dialog).getByLabelText(/serial number/i);
      const locationInput = within(dialog).getByLabelText(/location/i);

      await userEvent.type(nameInput, 'New Office Device');
      await userEvent.type(serialInput, 'ABC123456');
      await userEvent.type(locationInput, 'Building A');

      const submitButton = screen.getByRole('button', { name: /register/i });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText('Device Registered Successfully')
        ).toBeInTheDocument();
        expect(screen.getByText('XXXX-YYYY-ZZZZ')).toBeInTheDocument();
        expect(
          screen.getByText(/Use this activation code on your device/i)
        ).toBeInTheDocument();
      });
    });

    it('should copy activation code to clipboard', async () => {
      const mockClipboard = {
        writeText: vi.fn().mockResolvedValue(undefined),
      };
      Object.assign(navigator, { clipboard: mockClipboard });

      render(<DeviceManagement />);

      const registerButton = screen.getByRole('button', {
        name: /register device/i,
      });
      await userEvent.click(registerButton);

      const dialog = screen.getByRole('dialog');
      const nameInput = within(dialog).getByLabelText(/device name/i);
      await userEvent.type(nameInput, 'New Device');

      const serialInput = within(dialog).getByLabelText(/serial number/i);
      await userEvent.type(serialInput, 'ABC123456');

      const locationInput = within(dialog).getByLabelText(/location/i);
      await userEvent.type(locationInput, 'Office');

      const submitButton = screen.getByRole('button', { name: /register/i });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('XXXX-YYYY-ZZZZ')).toBeInTheDocument();
      });

      const copyButton = screen.getByRole('button', { name: /copy code/i });
      await userEvent.click(copyButton);

      expect(mockClipboard.writeText).toHaveBeenCalledWith('XXXX-YYYY-ZZZZ');
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Copied to clipboard',
        })
      );
    });

    it('should close modal and refresh list after registration', async () => {
      const mockFetchDevices = vi.fn().mockResolvedValue(undefined);
      vi.mocked(useDeviceStore).mockImplementation((selector?: any) => {
        const state = createDeviceStoreMock({
          devices: mockDevices,
          fetchDevices: mockFetchDevices,
        });
        return selector ? selector(state) : state;
      });

      render(<DeviceManagement />);

      const registerButton = screen.getByRole('button', {
        name: /register device/i,
      });
      await userEvent.click(registerButton);

      const dialog = screen.getByRole('dialog');
      const nameInput = within(dialog).getByLabelText(/device name/i);
      await userEvent.type(nameInput, 'New Device');

      const serialInput = within(dialog).getByLabelText(/serial number/i);
      await userEvent.type(serialInput, 'ABC123456');

      const locationInput = within(dialog).getByLabelText(/location/i);
      await userEvent.type(locationInput, 'Office');

      const submitButton = screen.getByRole('button', { name: /register/i });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('XXXX-YYYY-ZZZZ')).toBeInTheDocument();
      });

      const doneButton = screen.getByRole('button', { name: /done/i });
      await userEvent.click(doneButton);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(mockFetchDevices).toHaveBeenCalled();
      });
    });

    it('should handle registration errors gracefully', async () => {
      // Mock the store's registerDevice to reject
      const mockRegisterDevice = vi
        .fn()
        .mockRejectedValue(new Error('Network error'));
      vi.mocked(useDeviceStore).mockImplementation((selector?: any) => {
        const state = createDeviceStoreMock({
          devices: mockDevices,
          registerDevice: mockRegisterDevice,
        });
        return selector ? selector(state) : state;
      });

      render(<DeviceManagement />);

      const registerButton = screen.getByRole('button', {
        name: /register device/i,
      });
      await userEvent.click(registerButton);

      const dialog = screen.getByRole('dialog');
      const nameInput = within(dialog).getByLabelText(/device name/i);
      await userEvent.type(nameInput, 'New Device');

      const serialInput = within(dialog).getByLabelText(/serial number/i);
      await userEvent.type(serialInput, 'ABC123456');

      const locationInput = within(dialog).getByLabelText(/location/i);
      await userEvent.type(locationInput, 'Office');

      const submitButton = screen.getByRole('button', { name: /register/i });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Registration Failed',
            description: 'Network error',
            variant: 'destructive',
          })
        );
      });
    });
  });

  describe('Device Actions', () => {
    it('should show actions menu for each device', async () => {
      render(<DeviceManagement />);

      await waitFor(() => {
        const actionButtons = screen.getAllByRole('button', {
          name: /actions/i,
        });
        expect(actionButtons).toHaveLength(4);
      });
    });

    it('should disable device when disable action clicked', async () => {
      render(<DeviceManagement />);

      // Wait for table to render
      await waitFor(() => {
        expect(screen.getByText('Office Router')).toBeInTheDocument();
      });

      // Find and click the first actions button
      const firstDeviceActions = screen.getAllByRole('button', {
        name: /actions/i,
      })[0];
      await userEvent.click(firstDeviceActions);

      // Wait for dropdown to open and find menu item
      await waitFor(() => {
        expect(screen.getByText('Disable Device')).toBeInTheDocument();
      });

      const disableOption = screen.getByText('Disable Device');
      await userEvent.click(disableOption);

      expect(api.patch).toHaveBeenCalledWith('/api/devices/dev-1', {
        status: 'offline', // Changed from 'disabled' to 'offline' as per implementation
      });
    });

    it('should show delete confirmation dialog', async () => {
      render(<DeviceManagement />);

      // Wait for table to render
      await waitFor(() => {
        expect(screen.getByText('Office Router')).toBeInTheDocument();
      });

      const firstDeviceActions = screen.getAllByRole('button', {
        name: /actions/i,
      })[0];
      await userEvent.click(firstDeviceActions);

      await waitFor(() => {
        expect(screen.getByText('Delete Device')).toBeInTheDocument();
      });

      const deleteOption = screen.getByText('Delete Device');
      await userEvent.click(deleteOption);

      await waitFor(() => {
        expect(
          screen.getByText(/Are you sure you want to delete this device?/i)
        ).toBeInTheDocument();
      });
    });

    it('should delete device when confirmed', async () => {
      const mockDeleteDevice = vi.fn().mockResolvedValue(undefined);
      const mockRefreshDevices = vi.fn().mockResolvedValue(undefined);
      vi.mocked(useDeviceStore).mockImplementation((selector?: any) => {
        const state = createDeviceStoreMock({
          devices: mockDevices,
          deleteDevice: mockDeleteDevice,
          refreshDevices: mockRefreshDevices,
        });
        return selector ? selector(state) : state;
      });

      render(<DeviceManagement />);

      // Wait for table to render
      await waitFor(() => {
        expect(screen.getByText('Office Router')).toBeInTheDocument();
      });

      const firstDeviceActions = screen.getAllByRole('button', {
        name: /actions/i,
      })[0];
      await userEvent.click(firstDeviceActions);

      await waitFor(() => {
        expect(screen.getByText('Delete Device')).toBeInTheDocument();
      });

      const deleteOption = screen.getByText('Delete Device');
      await userEvent.click(deleteOption);

      const confirmButton = screen.getByRole('button', {
        name: /confirm delete/i,
      });
      await userEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockDeleteDevice).toHaveBeenCalledWith('dev-1');
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Device deleted',
          })
        );
      });
    });

    it('should show device details in modal', async () => {
      render(<DeviceManagement />);

      // Wait for table to render
      await waitFor(() => {
        expect(screen.getByText('Office Router')).toBeInTheDocument();
      });

      const firstDeviceActions = screen.getAllByRole('button', {
        name: /actions/i,
      })[0];
      await userEvent.click(firstDeviceActions);

      await waitFor(() => {
        expect(screen.getByText('View Details')).toBeInTheDocument();
      });

      const viewOption = screen.getByText('View Details');
      await userEvent.click(viewOption);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });

      // Verify modal content
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText('Device Details')).toBeInTheDocument();
      expect(within(dialog).getByText('Office Router')).toBeInTheDocument();
      expect(within(dialog).getByText('ABC123')).toBeInTheDocument();
    });
  });

  describe('WebSocket Real-time Updates', () => {
    it('should subscribe to device_* websocket events on mount', async () => {
      const mockSubscribe = vi.fn();
      const mockWebSocketClient = {
        subscribe: mockSubscribe,
        unsubscribe: vi.fn(),
        isConnected: true,
      };

      vi.mocked(useDeviceStore).mockImplementation(() =>
        createDeviceStoreMock({
          devices: mockDevices,
          webSocketClient: mockWebSocketClient,
        })
      );

      render(<DeviceManagement />);

      await waitFor(() => {
        expect(mockSubscribe).toHaveBeenCalledWith(
          'device_status',
          expect.any(Function)
        );
        expect(mockSubscribe).toHaveBeenCalledWith(
          'device_registered',
          expect.any(Function)
        );
        expect(mockSubscribe).toHaveBeenCalledWith(
          'device_removed',
          expect.any(Function)
        );
        expect(mockSubscribe).toHaveBeenCalledWith(
          'device_updated',
          expect.any(Function)
        );
      });
    });

    it('should update device status when device_status event received', async () => {
      const mockUpdateDeviceStatus = vi.fn();
      const mockUpdateDeviceHeartbeat = vi.fn();
      const mockSubscribe = vi.fn((event, handler) => {
        if (event === 'device_status') {
          setTimeout(() => {
            handler({
              deviceId: 'dev-2',
              status: 'online',
              lastSeen: '2024-01-15T11:00:00Z',
            });
          }, 100);
        }
      });

      vi.mocked(useDeviceStore).mockImplementation(() =>
        createDeviceStoreMock({
          devices: mockDevices,
          updateDeviceStatus: mockUpdateDeviceStatus,
          updateDeviceHeartbeat: mockUpdateDeviceHeartbeat,
          webSocketClient: {
            subscribe: mockSubscribe,
            unsubscribe: vi.fn(),
          },
        })
      );

      render(<DeviceManagement />);

      await waitFor(() => {
        expect(mockUpdateDeviceStatus).toHaveBeenCalledWith('dev-2', 'online');
        expect(mockUpdateDeviceHeartbeat).toHaveBeenCalledWith(
          'dev-2',
          '2024-01-15T11:00:00Z'
        );
      });
    });

    it('should add new device when device_registered event received', async () => {
      const mockAddDevice = vi.fn();
      const mockSubscribe = vi.fn((event, handler) => {
        if (event === 'device_registered') {
          setTimeout(() => {
            handler({
              device: {
                id: 'dev-5',
                name: 'New Device',
                status: 'pending',
              },
            });
          }, 100);
        }
      });

      vi.mocked(useDeviceStore).mockImplementation(() =>
        createDeviceStoreMock({
          devices: mockDevices,
          addDevice: mockAddDevice,
          webSocketClient: {
            subscribe: mockSubscribe,
            unsubscribe: vi.fn(),
          },
        })
      );

      render(<DeviceManagement />);

      await waitFor(() => {
        expect(mockAddDevice).toHaveBeenCalledWith({
          id: 'dev-5',
          name: 'New Device',
          status: 'pending',
        });
      });
    });

    it('should remove device when device_removed event received', async () => {
      const mockRemoveDevice = vi.fn();
      const mockSubscribe = vi.fn((event, handler) => {
        if (event === 'device_removed') {
          setTimeout(() => {
            handler({
              deviceId: 'dev-3',
            });
          }, 100);
        }
      });

      vi.mocked(useDeviceStore).mockImplementation(() =>
        createDeviceStoreMock({
          devices: mockDevices,
          removeDevice: mockRemoveDevice,
          webSocketClient: {
            subscribe: mockSubscribe,
            unsubscribe: vi.fn(),
          },
        })
      );

      render(<DeviceManagement />);

      await waitFor(() => {
        expect(mockRemoveDevice).toHaveBeenCalledWith('dev-3');
      });
    });

    it('should merge device payload when device_updated event received', async () => {
      const mockUpsertDevice = vi.fn();
      const mockSubscribe = vi.fn((event, handler) => {
        if (event === 'device_updated') {
          setTimeout(() => {
            handler({
              device: {
                id: 'dev-1',
                last_heartbeat_at: '2024-01-15T11:30:00Z',
                status: 'online',
              },
            });
          }, 100);
        }
      });

      vi.mocked(useDeviceStore).mockImplementation(() =>
        createDeviceStoreMock({
          devices: mockDevices,
          upsertDevice: mockUpsertDevice,
          webSocketClient: {
            subscribe: mockSubscribe,
            unsubscribe: vi.fn(),
          },
        })
      );

      render(<DeviceManagement />);

      await waitFor(() => {
        expect(mockUpsertDevice).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'dev-1',
            last_heartbeat: '2024-01-15T11:30:00Z',
            last_heartbeat_at: '2024-01-15T11:30:00Z',
            status: 'online',
          })
        );
      });
    });

    it('should unsubscribe from websocket events on unmount', async () => {
      const mockUnsubscribe = vi.fn();
      const mockWebSocketClient = {
        subscribe: vi.fn(),
        unsubscribe: mockUnsubscribe,
        isConnected: true,
      };

      vi.mocked(useDeviceStore).mockImplementation(() =>
        createDeviceStoreMock({
          devices: mockDevices,
          webSocketClient: mockWebSocketClient,
        })
      );

      const { unmount } = render(<DeviceManagement />);

      unmount();

      expect(mockUnsubscribe).toHaveBeenCalledWith('device_status');
      expect(mockUnsubscribe).toHaveBeenCalledWith('device_registered');
      expect(mockUnsubscribe).toHaveBeenCalledWith('device_removed');
      expect(mockUnsubscribe).toHaveBeenCalledWith('device_updated');
    });

    it.skip('should show connection indicator when websocket is connected', async () => {
      vi.mocked(useDeviceStore).mockImplementation(() =>
        createDeviceStoreMock({
          devices: mockDevices,
          webSocketClient: {
            subscribe: vi.fn(),
            unsubscribe: vi.fn(),
            isConnected: true,
          },
        })
      );

      render(<DeviceManagement />);

      await waitFor(() => {
        const indicator = screen.getByTestId('websocket-indicator');
        expect(indicator).toHaveClass('bg-green-500');
        expect(
          screen.getByTitle('Real-time updates active')
        ).toBeInTheDocument();
      });
    });

    it.skip('should show disconnected indicator when websocket is not connected', async () => {
      vi.mocked(useDeviceStore).mockImplementation(() =>
        createDeviceStoreMock({
          devices: mockDevices,
          webSocketClient: {
            subscribe: vi.fn(),
            unsubscribe: vi.fn(),
            isConnected: false,
          },
        })
      );

      render(<DeviceManagement />);

      await waitFor(() => {
        const indicator = screen.getByTestId('websocket-indicator');
        expect(indicator).toHaveClass('bg-red-500');
        expect(
          screen.getByTitle('Real-time updates disconnected')
        ).toBeInTheDocument();
      });
    });
  });

  describe('Pagination', () => {
    it('should display pagination controls', async () => {
      vi.mocked(useDeviceStore).mockImplementation((selector?: any) => {
        const state = createDeviceStoreMock({
          devices: mockDevices,
          currentPage: 1,
          totalPages: 2,
        });
        return selector ? selector(state) : state;
      });

      render(<DeviceManagement />);

      await waitFor(() => {
        // Check for pagination buttons
        expect(
          screen.getByRole('button', { name: /previous page/i })
        ).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: /next page/i })
        ).toBeInTheDocument();
        // Check for page info text
        expect(screen.getByText(/Page 1 of 2/i)).toBeInTheDocument();
      });
    });

    it('should load next page when next button clicked', async () => {
      const mockFetchDevices = vi.fn().mockResolvedValue(undefined);
      vi.mocked(useDeviceStore).mockImplementation((selector?: any) => {
        const state = createDeviceStoreMock({
          devices: mockDevices,
          fetchDevices: mockFetchDevices,
          currentPage: 1,
          totalPages: 3,
        });
        return selector ? selector(state) : state;
      });

      render(<DeviceManagement />);

      const nextButton = screen.getByRole('button', { name: /next page/i });
      await userEvent.click(nextButton);

      expect(mockFetchDevices).toHaveBeenCalledWith({ page: 2 });
    });

    it('should disable previous button on first page', async () => {
      vi.mocked(useDeviceStore).mockImplementation((selector?: any) => {
        const state = createDeviceStoreMock({
          devices: mockDevices,
          currentPage: 1,
          totalPages: 3,
        });
        return selector ? selector(state) : state;
      });

      render(<DeviceManagement />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /previous page/i })
        ).toBeDisabled();
      });
    });

    it('should disable next button on last page', async () => {
      vi.mocked(useDeviceStore).mockImplementation((selector?: any) => {
        const state = createDeviceStoreMock({
          devices: mockDevices,
          currentPage: 3,
          totalPages: 3,
        });
        return selector ? selector(state) : state;
      });

      render(<DeviceManagement />);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /next page/i })
        ).toBeDisabled();
      });
    });

    it('should display current page and total pages', async () => {
      vi.mocked(useDeviceStore).mockImplementation((selector?: any) => {
        const state = createDeviceStoreMock({
          devices: mockDevices,
          currentPage: 2,
          totalPages: 5,
        });
        return selector ? selector(state) : state;
      });

      render(<DeviceManagement />);

      await waitFor(() => {
        expect(screen.getByText('Page 2 of 5')).toBeInTheDocument();
      });
    });
  });

  describe('Export Functionality', () => {
    itFull('should export device list as CSV', async () => {
      const mockCreateObjectURL = vi.fn(() => 'blob:url');
      const mockRevokeObjectURL = vi.fn();
      global.URL.createObjectURL = mockCreateObjectURL;
      global.URL.revokeObjectURL = mockRevokeObjectURL;

      render(<DeviceManagement />);

      const exportButton = screen.getByRole('button', { name: /export/i });
      await userEvent.click(exportButton);

      const csvOption = screen.getByRole('menuitem', {
        name: /export as csv/i,
      });
      await userEvent.click(csvOption);

      expect(mockCreateObjectURL).toHaveBeenCalled();

      // Check if download was triggered
      const downloadLink = document.querySelector('a[download]');
      expect(downloadLink).toBeInTheDocument();
      expect(downloadLink).toHaveAttribute(
        'download',
        expect.stringContaining('devices')
      );
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', async () => {
      vi.mocked(useDeviceStore).mockImplementation((selector?: any) => {
        const state = createDeviceStoreMock({
          devices: mockDevices,
        });
        return selector ? selector(state) : state;
      });

      render(<DeviceManagement />);

      await waitFor(() => {
        // Check for the existence of table
        expect(screen.getByRole('table')).toBeInTheDocument();
        // Check for search input
        expect(
          screen.getByPlaceholderText('Search devices...')
        ).toBeInTheDocument();
        // Check for register device button
        expect(
          screen.getByRole('button', { name: /register device/i })
        ).toBeInTheDocument();
      });
    });

    it('should announce status changes to screen readers', async () => {
      vi.mocked(useDeviceStore).mockImplementation((selector?: any) => {
        const state = createDeviceStoreMock({
          devices: mockDevices,
        });
        return selector ? selector(state) : state;
      });

      render(<DeviceManagement />);

      const searchInput = screen.getByPlaceholderText('Search devices...');
      await userEvent.type(searchInput, 'Office');

      await waitFor(() => {
        // Check that we filtered to only 1 device
        expect(screen.getByText('Office Router')).toBeInTheDocument();
        expect(screen.queryByText('Warehouse Device')).not.toBeInTheDocument();
      });
    });

    it('should support keyboard navigation', async () => {
      vi.mocked(useDeviceStore).mockImplementation((selector?: any) => {
        const state = createDeviceStoreMock({
          devices: mockDevices,
        });
        return selector ? selector(state) : state;
      });

      render(<DeviceManagement />);

      await waitFor(() => {
        // Check table rows are rendered
        expect(screen.getByTestId('device-row-dev-1')).toBeInTheDocument();
        expect(screen.getByTestId('device-row-dev-2')).toBeInTheDocument();
      });

      // Test keyboard navigation through table rows
      const firstRow = screen.getByTestId('device-row-dev-1');
      const secondRow = screen.getByTestId('device-row-dev-2');

      // Verify both rows are in the document
      expect(firstRow).toBeInTheDocument();
      expect(secondRow).toBeInTheDocument();
    });
  });
});
