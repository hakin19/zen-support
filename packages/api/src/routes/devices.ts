import { z } from 'zod';

import { webPortalAuthMiddleware } from '../middleware/web-portal-auth.middleware';
import { supabase } from '../services/supabase';

import { getConnectionManager } from './websocket';

import type { Database } from '@aizen/shared/types/database.generated';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';

// Type aliases for cleaner code
type DeviceRow = Database['public']['Tables']['devices']['Row'];
type DeviceInsert = Database['public']['Tables']['devices']['Insert'];
type _DeviceUpdate = Database['public']['Tables']['devices']['Update'];
type _AuditLogInsert = Database['public']['Tables']['audit_logs']['Insert'];

const deviceStatusSchema = z.enum(['online', 'offline', 'maintenance']);

const registerDeviceSchema = z.object({
  serial_number: z.string(),
  name: z.string(),
  location: z.string().optional(),
  network_info: z
    .object({
      ip_address: z.string().optional(),
      mac_address: z.string().optional(),
      gateway: z.string().optional(),
    })
    .optional(),
});

const updateDeviceSchema = z.object({
  name: z.string().optional(),
  location: z.string().optional(),
  status: deviceStatusSchema.optional(),
  firmware_version: z.string().optional(),
});

const queryParamsSchema = z.object({
  page: z.string().regex(/^\d+$/).optional().default('1'),
  limit: z.string().regex(/^\d+$/).optional().default('10'),
  status: deviceStatusSchema.optional(),
  search: z.string().optional(),
});

export const devicesRoutes: FastifyPluginAsync = async (
  fastify
): Promise<void> => {
  // Helper function to create typed preHandler
  const _createPreHandler = () => {
    return (request: FastifyRequest, reply: FastifyReply): Promise<void> =>
      webPortalAuthMiddleware(request, reply);
  };
  // Get devices list - simplified endpoint for UI compatibility
  fastify.get(
    '/api/devices',
    {
      preHandler: webPortalAuthMiddleware,
    },
    async (request, reply) => {
      const { user } = request;
      if (!user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      try {
        const { data: devices, error } = await supabase
          .from('devices')
          .select('*')
          .eq('customer_id', user.organization_id)
          .order('created_at', { ascending: false });

        if (error) {
          fastify.log.error('Failed to fetch devices:', error);
          return reply.code(500).send({ error: 'Failed to fetch devices' });
        }

        // Get firmware update status
        const deviceIds = (devices as DeviceRow[])?.map(d => d.id) ?? [];
        const firmwareUpdates: Record<string, unknown> = {};

        if (deviceIds.length > 0) {
          // Note: firmware_updates table doesn't exist in current schema
          // Skipping this functionality for now
        }

        return reply.send({
          devices: devices ?? [],
          firmware_updates: firmwareUpdates,
        });
      } catch (error: unknown) {
        fastify.log.error('Error fetching devices:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Register device - simplified endpoint for UI compatibility
  fastify.post(
    '/api/devices/register',
    {
      preHandler: webPortalAuthMiddleware,
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const body = request.body as {
          name: string;
          serial_number: string;
          location?: string;
        };

        // Validate required fields
        if (!body.name || !body.serial_number) {
          return reply
            .code(400)
            .send({ error: 'Name and serial number are required' });
        }

        // Check if device already exists
        const { data: existingDevice } = await supabase
          .from('devices')
          .select('id')
          .eq('device_id', body.serial_number) // Using device_id instead of serial_number
          .single();

        if (existingDevice) {
          return reply.code(400).send({ error: 'Device already registered' });
        }

        // Generate registration code
        const registrationCode = Math.random()
          .toString(36)
          .substring(2, 8)
          .toUpperCase();

        // Register device
        const deviceData: DeviceInsert = {
          name: body.name,
          device_id: body.serial_number,
          customer_id: user.organization_id,
          location: body.location ?? null,
          status: 'offline',
        };

        const { data: newDevice, error } = await supabase
          .from('devices')
          .insert(deviceData)
          .select()
          .single();

        if (error) {
          fastify.log.error('Failed to register device:', error);
          return reply.code(500).send({ error: 'Failed to register device' });
        }

        // Broadcast to WebSocket clients
        const connectionManager = getConnectionManager();
        await connectionManager.broadcast({
          type: 'device_registered',
          device: newDevice,
        });

        return reply.send({
          success: true,
          device_id: newDevice?.id ?? '',
          registration_code: registrationCode,
        });
      } catch (error: unknown) {
        fastify.log.error('Error registering device:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Get devices list
  fastify.get(
    '/devices',
    {
      preHandler: webPortalAuthMiddleware,
    },
    async (request, reply) => {
      const { user } = request;
      if (!user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      try {
        const params = queryParamsSchema.parse(request.query);
        const page = parseInt(params.page);
        const limit = parseInt(params.limit);
        const offset = (page - 1) * limit;

        // Build query
        let query = supabase
          .from('devices')
          .select('*', { count: 'exact' })
          .eq('customer_id', user.organization_id)
          .range(offset, offset + limit - 1)
          .order('created_at', { ascending: false });

        // Apply filters
        if (params.status) {
          query = query.eq('status', params.status);
        }

        if (params.search) {
          query = query.or(
            `name.ilike.%${params.search}%,serial_number.ilike.%${params.search}%,location.ilike.%${params.search}%`
          );
        }

        const { data: devices, error, count } = await query;

        if (error) {
          fastify.log.error('Failed to fetch devices:', error);
          return reply.code(500).send({ error: 'Failed to fetch devices' });
        }

        // Get firmware update status
        const deviceIds = devices?.map((d: { id: string }) => d.id) || [];
        const firmwareUpdates: Record<string, unknown> = {};

        if (deviceIds.length > 0) {
          const { data: updates } = await supabase
            .from('firmware_updates')
            .select('*')
            .in('device_id', deviceIds)
            .eq('status', 'available');

          updates?.forEach((update: { device_id: string }) => {
            firmwareUpdates[update.device_id] = update;
          });
        }

        return reply.send({
          devices: devices || [],
          firmware_updates: firmwareUpdates,
          total: count || 0,
          page,
          limit,
        });
      } catch (error: unknown) {
        fastify.log.error('Error fetching devices:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Register new device
  fastify.post(
    '/devices',
    {
      preHandler: webPortalAuthMiddleware,
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const body = registerDeviceSchema.parse(request.body);

        // Check if device already exists
        const { data: existingDevice } = await supabase
          .from('devices')
          .select('id')
          .eq('serial_number', body.serial_number)
          .single();

        if (existingDevice) {
          return reply.code(400).send({ error: 'Device already registered' });
        }

        // Register device
        const { data: newDevice, error } = await supabase
          .from('devices')
          .insert({
            ...body,
            customer_id: user.organization_id,
            status: 'offline',
            registered_by: user.id,
          })
          .select()
          .single();

        if (error) {
          fastify.log.error('Failed to register device:', error);
          return reply.code(500).send({ error: 'Failed to register device' });
        }

        // Broadcast to WebSocket clients
        const connectionManager = getConnectionManager();
        await connectionManager.broadcast({
          type: 'device_registered',
          device: newDevice,
        });

        return reply.send({ device: newDevice });
      } catch (error: unknown) {
        fastify.log.error('Error registering device:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Update device
  fastify.patch(
    '/devices/:deviceId',
    {
      preHandler: webPortalAuthMiddleware,
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const { deviceId } = request.params as { deviceId: string };
        const body = updateDeviceSchema.parse(request.body);

        // Check device exists and belongs to organization
        const { data: device } = await supabase
          .from('devices')
          .select('id')
          .eq('id', deviceId)
          .eq('customer_id', user.organization_id)
          .single();

        if (!device) {
          return reply.code(404).send({ error: 'Device not found' });
        }

        // Update device
        const { data: updatedDevice, error } = await supabase
          .from('devices')
          .update(body)
          .eq('id', deviceId)
          .select()
          .single();

        if (error) {
          fastify.log.error('Failed to update device:', error);
          return reply.code(500).send({ error: 'Failed to update device' });
        }

        // Broadcast to WebSocket clients
        const connectionManager = getConnectionManager();
        await connectionManager.broadcast({
          type: 'device_updated',
          device: updatedDevice,
        });

        return reply.send({ device: updatedDevice });
      } catch (error: unknown) {
        fastify.log.error('Error updating device:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Delete device
  fastify.delete(
    '/devices/:deviceId',
    {
      preHandler: webPortalAuthMiddleware,
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || user.role !== 'owner') {
        return reply
          .code(403)
          .send({ error: 'Only owners can delete devices' });
      }

      try {
        const { deviceId } = request.params as { deviceId: string };

        // Check device exists and belongs to organization
        const { data: device } = await supabase
          .from('devices')
          .select('id')
          .eq('id', deviceId)
          .eq('customer_id', user.organization_id)
          .single();

        if (!device) {
          return reply.code(404).send({ error: 'Device not found' });
        }

        // Delete device
        const { error } = await supabase
          .from('devices')
          .delete()
          .eq('id', deviceId);

        if (error) {
          fastify.log.error('Failed to delete device:', error);
          return reply.code(500).send({ error: 'Failed to delete device' });
        }

        // Broadcast to WebSocket clients
        const connectionManager = getConnectionManager();
        await connectionManager.broadcast({
          type: 'device_removed',
          deviceId,
        });

        return reply.send({ success: true });
      } catch (error: unknown) {
        fastify.log.error('Error deleting device:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Restart device
  fastify.post(
    '/devices/:deviceId/restart',
    {
      preHandler: webPortalAuthMiddleware,
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const { deviceId } = request.params as { deviceId: string };

        // Check device exists and is online
        const { data: device } = await supabase
          .from('devices')
          .select('id, status')
          .eq('id', deviceId)
          .eq('customer_id', user.organization_id)
          .single();

        if (!device) {
          return reply.code(404).send({ error: 'Device not found' });
        }

        if (device.status !== 'online') {
          return reply.code(400).send({ error: 'Device is not online' });
        }

        // Send restart command via WebSocket
        const connectionManager = getConnectionManager();
        await connectionManager.sendToDevice(deviceId, {
          type: 'command',
          command: 'restart',
          timestamp: new Date().toISOString(),
        });

        // Log the action
        await supabase.from('audit_log').insert({
          user_id: user.id,
          action: 'device_restart',
          resource_type: 'device',
          resource_id: deviceId,
          details: { device_id: deviceId },
        });

        return reply.send({
          success: true,
          message: 'Restart command sent to device',
        });
      } catch (error: unknown) {
        fastify.log.error('Error restarting device:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Update firmware
  fastify.post(
    '/devices/:deviceId/firmware',
    {
      preHandler: webPortalAuthMiddleware,
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const { deviceId } = request.params as { deviceId: string };
        const { version } = request.body as { version: string };

        // Check device exists and is online
        const { data: device } = await supabase
          .from('devices')
          .select('id, status, firmware_version')
          .eq('id', deviceId)
          .eq('customer_id', user.organization_id)
          .single();

        if (!device) {
          return reply.code(404).send({ error: 'Device not found' });
        }

        if (device.status !== 'online') {
          return reply
            .code(400)
            .send({ error: 'Device must be online to update firmware' });
        }

        // Create firmware update record
        const { data: updateRecord, error } = await supabase
          .from('firmware_updates')
          .insert({
            device_id: deviceId,
            current_version: device.firmware_version,
            target_version: version,
            status: 'pending',
            initiated_by: user.id,
          })
          .select()
          .single();

        if (error) {
          fastify.log.error('Failed to create firmware update record:', error);
          return reply
            .code(500)
            .send({ error: 'Failed to initiate firmware update' });
        }

        // Send firmware update command via WebSocket
        const connectionManager = getConnectionManager();
        await connectionManager.sendToDevice(deviceId, {
          type: 'command',
          command: 'firmware_update',
          version,
          update_id: (updateRecord as { id: string }).id,
          timestamp: new Date().toISOString(),
        });

        return reply.send({
          success: true,
          update: updateRecord,
          message: 'Firmware update initiated',
        });
      } catch (error: unknown) {
        fastify.log.error('Error updating firmware:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Get device diagnostics
  fastify.get(
    '/devices/:deviceId/diagnostics',
    {
      preHandler: webPortalAuthMiddleware,
    },
    async (request, reply) => {
      const { user } = request;
      if (!user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      try {
        const { deviceId } = request.params as { deviceId: string };

        // Check device exists and belongs to organization
        const { data: device } = await supabase
          .from('devices')
          .select('*')
          .eq('id', deviceId)
          .eq('customer_id', user.organization_id)
          .single();

        if (!device) {
          return reply.code(404).send({ error: 'Device not found' });
        }

        // Get recent diagnostics
        const { data: diagnostics } = await supabase
          .from('device_diagnostics')
          .select('*')
          .eq('device_id', deviceId)
          .order('created_at', { ascending: false })
          .limit(10);

        // Get recent events
        const { data: events } = await supabase
          .from('device_events')
          .select('*')
          .eq('device_id', deviceId)
          .order('created_at', { ascending: false })
          .limit(20);

        return reply.send({
          device,
          diagnostics: diagnostics || [],
          events: events || [],
        });
      } catch (error: unknown) {
        fastify.log.error('Error fetching device diagnostics:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Export devices to CSV
  fastify.get(
    '/api/devices/export',
    {
      preHandler: webPortalAuthMiddleware,
    },
    async (request, reply) => {
      const { user } = request;
      if (!user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      try {
        // Fetch all devices for the organization
        const { data: devices, error } = await supabase
          .from('devices')
          .select('*')
          .eq('customer_id', user.organization_id)
          .order('created_at', { ascending: false });

        if (error) {
          fastify.log.error('Failed to fetch devices for export:', error);
          return reply.code(500).send({ error: 'Failed to export devices' });
        }

        // Create CSV content
        const headers = [
          'Name',
          'Serial Number',
          'Model',
          'Status',
          'Location',
          'IP Address',
          'Firmware Version',
          'Last Seen',
          'Registered At',
          'Capabilities',
        ];

        const rows = (devices || []).map(device => [
          device.name || '',
          device.serial_number || '',
          device.model || '',
          device.status || '',
          device.location || '',
          device.ip_address || '',
          device.firmware_version || '',
          device.last_seen || '',
          device.registered_at || device.created_at || '',
          (device.capabilities || []).join('; '),
        ]);

        // Build CSV string
        const csvContent = [
          headers.join(','),
          ...rows.map(row =>
            row
              .map(cell => {
                // Escape cells containing commas, quotes, or newlines
                const cellStr = String(cell);
                if (
                  cellStr.includes(',') ||
                  cellStr.includes('"') ||
                  cellStr.includes('\n')
                ) {
                  return `"${cellStr.replace(/"/g, '""')}"`;
                }
                return cellStr;
              })
              .join(',')
          ),
        ].join('\n');

        // Send CSV response
        return reply
          .code(200)
          .header('Content-Type', 'text/csv')
          .header(
            'Content-Disposition',
            `attachment; filename="devices-${new Date().toISOString().split('T')[0]}.csv"`
          )
          .send(csvContent);
      } catch (error: unknown) {
        fastify.log.error('Error exporting devices:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Bulk restart devices
  fastify.post(
    '/api/devices/bulk-restart',
    {
      preHandler: webPortalAuthMiddleware,
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const { device_ids } = request.body as { device_ids: string[] };

        if (!device_ids || device_ids.length === 0) {
          return reply.code(400).send({ error: 'No devices specified' });
        }

        // Verify all devices belong to organization and are online
        const { data: devices, error } = await supabase
          .from('devices')
          .select('id, status')
          .in('id', device_ids)
          .eq('customer_id', user.organization_id);

        if (error || !devices) {
          fastify.log.error('Failed to fetch devices:', error);
          return reply.code(500).send({ error: 'Failed to fetch devices' });
        }

        const onlineDevices = devices.filter(d => d.status === 'online');
        if (onlineDevices.length === 0) {
          return reply
            .code(400)
            .send({ error: 'No online devices to restart' });
        }

        // Send restart commands to all online devices
        const connectionManager = getConnectionManager();
        const restartPromises = onlineDevices.map(async device => {
          await connectionManager.sendToDevice(device.id, {
            type: 'command',
            command: 'restart',
            timestamp: new Date().toISOString(),
          });

          return supabase.from('audit_log').insert({
            user_id: user.id,
            action: 'device_restart',
            resource_type: 'device',
            resource_id: device.id,
            details: { device_id: device.id, bulk_action: true },
          });
        });

        await Promise.all(restartPromises);

        return reply.send({
          success: true,
          message: `Restart command sent to ${onlineDevices.length} device(s)`,
          devices_affected: onlineDevices.length,
        });
      } catch (error: unknown) {
        fastify.log.error('Error in bulk restart:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Bulk enable devices
  fastify.post(
    '/api/devices/bulk-enable',
    {
      preHandler: webPortalAuthMiddleware,
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const { device_ids } = request.body as { device_ids: string[] };

        if (!device_ids || device_ids.length === 0) {
          return reply.code(400).send({ error: 'No devices specified' });
        }

        // Update devices to enable them
        const { data: updatedDevices, error } = await supabase
          .from('devices')
          .update({ enabled: true })
          .in('id', device_ids)
          .eq('customer_id', user.organization_id)
          .select();

        if (error) {
          fastify.log.error('Failed to enable devices:', error);
          return reply.code(500).send({ error: 'Failed to enable devices' });
        }

        // Log the action
        const auditPromises = device_ids.map(deviceId =>
          supabase.from('audit_log').insert({
            user_id: user.id,
            action: 'device_enable',
            resource_type: 'device',
            resource_id: deviceId,
            details: { device_id: deviceId, bulk_action: true },
          })
        );

        await Promise.all(auditPromises);

        // Broadcast updates
        const connectionManager = getConnectionManager();
        await connectionManager.broadcast({
          type: 'devices_updated',
          devices: updatedDevices,
        });

        return reply.send({
          success: true,
          message: `Enabled ${updatedDevices?.length || 0} device(s)`,
          devices_affected: updatedDevices?.length || 0,
        });
      } catch (error: unknown) {
        fastify.log.error('Error in bulk enable:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Bulk disable devices
  fastify.post(
    '/api/devices/bulk-disable',
    {
      preHandler: webPortalAuthMiddleware,
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const { device_ids } = request.body as { device_ids: string[] };

        if (!device_ids || device_ids.length === 0) {
          return reply.code(400).send({ error: 'No devices specified' });
        }

        // Update devices to disable them
        const { data: updatedDevices, error } = await supabase
          .from('devices')
          .update({ enabled: false })
          .in('id', device_ids)
          .eq('customer_id', user.organization_id)
          .select();

        if (error) {
          fastify.log.error('Failed to disable devices:', error);
          return reply.code(500).send({ error: 'Failed to disable devices' });
        }

        // Log the action
        const auditPromises = device_ids.map(deviceId =>
          supabase.from('audit_log').insert({
            user_id: user.id,
            action: 'device_disable',
            resource_type: 'device',
            resource_id: deviceId,
            details: { device_id: deviceId, bulk_action: true },
          })
        );

        await Promise.all(auditPromises);

        // Broadcast updates
        const connectionManager = getConnectionManager();
        await connectionManager.broadcast({
          type: 'devices_updated',
          devices: updatedDevices,
        });

        return reply.send({
          success: true,
          message: `Disabled ${updatedDevices?.length || 0} device(s)`,
          devices_affected: updatedDevices?.length || 0,
        });
      } catch (error: unknown) {
        fastify.log.error('Error in bulk disable:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Bulk remove devices
  fastify.post(
    '/api/devices/bulk-remove',
    {
      preHandler: webPortalAuthMiddleware,
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || user.role !== 'owner') {
        return reply
          .code(403)
          .send({ error: 'Only owners can remove devices' });
      }

      try {
        const { device_ids } = request.body as { device_ids: string[] };

        if (!device_ids || device_ids.length === 0) {
          return reply.code(400).send({ error: 'No devices specified' });
        }

        // Verify all devices belong to organization
        const { data: devices, error: fetchError } = await supabase
          .from('devices')
          .select('id')
          .in('id', device_ids)
          .eq('customer_id', user.organization_id);

        if (fetchError) {
          fastify.log.error('Failed to fetch devices:', fetchError);
          return reply.code(500).send({ error: 'Failed to fetch devices' });
        }

        if (!devices || devices.length === 0) {
          return reply.code(404).send({ error: 'No devices found' });
        }

        const validDeviceIds = devices.map(d => d.id);

        // Delete devices
        const { error } = await supabase
          .from('devices')
          .delete()
          .in('id', validDeviceIds);

        if (error) {
          fastify.log.error('Failed to remove devices:', error);
          return reply.code(500).send({ error: 'Failed to remove devices' });
        }

        // Log the action
        const auditPromises = validDeviceIds.map(deviceId =>
          supabase.from('audit_log').insert({
            user_id: user.id,
            action: 'device_remove',
            resource_type: 'device',
            resource_id: deviceId,
            details: { device_id: deviceId, bulk_action: true },
          })
        );

        await Promise.all(auditPromises);

        // Broadcast removals
        const connectionManager = getConnectionManager();
        await connectionManager.broadcast({
          type: 'devices_removed',
          deviceIds: validDeviceIds,
        });

        return reply.send({
          success: true,
          message: `Removed ${validDeviceIds.length} device(s)`,
          devices_affected: validDeviceIds.length,
        });
      } catch (error: unknown) {
        fastify.log.error('Error in bulk remove:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Satisfy the async requirement
  await Promise.resolve();
};
