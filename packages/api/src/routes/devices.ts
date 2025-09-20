import { z } from 'zod';

import { getSupabaseAdminClient } from '@aizen/shared/utils/supabase-client';

import { webPortalAuthHook } from '../middleware/web-portal-auth.middleware';

import { getConnectionManager } from './websocket';

import type { Database } from '@aizen/shared/types/database.generated';
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';

// Type aliases for cleaner code
type DeviceRow = Database['public']['Tables']['devices']['Row'];
type DeviceInsert = Database['public']['Tables']['devices']['Insert'];

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
  // Register device - simplified endpoint for UI compatibility
  fastify.post(
    '/devices/register',
    {
      preHandler: webPortalAuthHook,
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const supabase = getSupabaseAdminClient();
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
          customer_id: user.customerId,
          location: body.location ?? null,
          status: 'offline',
        };

        const { data: newDevice, error: insertError } = (await supabase
          .from('devices')
          .insert(deviceData)
          .select()
          .single()) as { data: DeviceRow | null; error: Error | null };

        if (insertError) {
          fastify.log.error('Failed to register device: %s', insertError);
          return reply.code(500).send({ error: 'Failed to register device' });
        }

        // Broadcast to WebSocket clients
        const connectionManager = getConnectionManager();
        await connectionManager.broadcast({
          type: 'device_registered',
          device: newDevice as DeviceRow,
        });

        // Return backward compatible response shape
        // Both old (success, registration_code, device_id) and new (device, activationCode) formats
        return reply.send({
          // Legacy format for existing consumers (DeviceRegistration component in Settings)
          success: true,
          registration_code: registrationCode,
          device_id: newDevice?.id ?? '',
          // New format for Device Management page
          device: newDevice as DeviceRow,
          activationCode: registrationCode,
        });
      } catch (error: unknown) {
        fastify.log.error('Error registering device: %s', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Get devices list
  fastify.get(
    '/devices',
    {
      preHandler: webPortalAuthHook,
    },
    async (request, reply) => {
      const { user } = request;
      if (!user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      try {
        fastify.log.info('Starting devices query, getting admin client...');
        const supabase = getSupabaseAdminClient();
        fastify.log.info('Got admin client, parsing params...');
        const params = queryParamsSchema.parse(request.query);
        const page = parseInt(params.page);
        const limit = parseInt(params.limit);
        const offset = (page - 1) * limit;

        fastify.log.info('Fetching devices for customer: %s', user.customerId);

        // Build query
        let query = supabase
          .from('devices')
          .select('*', { count: 'exact' })
          .eq('customer_id', user.customerId)
          .range(offset, offset + limit - 1)
          .order('registered_at', { ascending: false });

        // Apply filters
        if (params.status) {
          query = query.eq('status', params.status);
        }

        if (params.search) {
          query = query.or(
            `name.ilike.%${params.search}%,device_id.ilike.%${params.search}%,location.ilike.%${params.search}%`
          );
        }

        fastify.log.info('Executing devices query...');
        const { data: devices, error, count } = await query;
        fastify.log.info(
          'Query completed. Devices found: %d',
          devices?.length || 0
        );

        if (error) {
          fastify.log.error('Failed to fetch devices: %s', error);
          return reply.code(500).send({ error: 'Failed to fetch devices' });
        }

        // Get firmware update status - skip for now to avoid timeout
        const firmwareUpdates: Record<string, unknown> = {};

        // TODO: Re-enable when firmware_updates table schema cache is refreshed
        // const deviceIds = devices?.map((d: { id: string }) => d.id) || [];
        // if (deviceIds.length > 0) {
        //   const { data: updates } = await supabase
        //     .from('firmware_updates')
        //     .select('*')
        //     .in('device_id', deviceIds)
        //     .eq('status', 'available');
        //
        //   updates?.forEach((update: { device_id: string }) => {
        //     firmwareUpdates[update.device_id] = update;
        //   });
        // }

        return reply.send({
          devices: devices || [],
          firmware_updates: firmwareUpdates,
          total: count ?? 0,
          page,
          limit,
        });
      } catch (error: unknown) {
        fastify.log.error('Error fetching devices: %s', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Register new device
  fastify.post(
    '/devices',
    {
      preHandler: webPortalAuthHook,
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const supabase = getSupabaseAdminClient();
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
        const { data: newDevice, error: deviceInsertError } = (await supabase
          .from('devices')
          .insert({
            ...body,
            customer_id: user.customerId,
            status: 'offline',
            registered_by: user.id,
          })
          .select()
          .single()) as { data: DeviceRow | null; error: Error | null };

        if (deviceInsertError) {
          fastify.log.error('Failed to register device: %s', deviceInsertError);
          return reply.code(500).send({ error: 'Failed to register device' });
        }

        // Broadcast to WebSocket clients
        const connectionManager = getConnectionManager();
        await connectionManager.broadcast({
          type: 'device_registered',
          device: newDevice as DeviceRow,
        });

        return reply.send({ device: newDevice as DeviceRow });
      } catch (error: unknown) {
        fastify.log.error('Error registering device: %s', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Update device
  fastify.patch(
    '/devices/:deviceId',
    {
      preHandler: webPortalAuthHook,
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const supabase = getSupabaseAdminClient();
        const { deviceId } = request.params as { deviceId: string };
        const body = updateDeviceSchema.parse(request.body);

        // Check device exists and belongs to organization
        const { data: device } = await supabase
          .from('devices')
          .select('id')
          .eq('id', deviceId)
          .eq('customer_id', user.customerId)
          .single();

        if (!device) {
          return reply.code(404).send({ error: 'Device not found' });
        }

        // Update device
        const { data: updatedDevice, error: updateError } = (await supabase
          .from('devices')
          .update(body)
          .eq('id', deviceId)
          .select()
          .single()) as { data: DeviceRow | null; error: Error | null };

        if (updateError) {
          fastify.log.error('Failed to update device: %s', updateError);
          return reply.code(500).send({ error: 'Failed to update device' });
        }

        // Broadcast to WebSocket clients
        const connectionManager = getConnectionManager();
        await connectionManager.broadcast({
          type: 'device_updated',
          device: updatedDevice as DeviceRow,
        });

        return reply.send({ device: updatedDevice as DeviceRow });
      } catch (error: unknown) {
        fastify.log.error('Error updating device: %s', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Delete device
  fastify.delete(
    '/devices/:deviceId',
    {
      preHandler: webPortalAuthHook,
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || user.role !== 'owner') {
        return reply
          .code(403)
          .send({ error: 'Only owners can delete devices' });
      }

      try {
        const supabase = getSupabaseAdminClient();
        const { deviceId } = request.params as { deviceId: string };

        // Check device exists and belongs to organization
        const { data: device } = await supabase
          .from('devices')
          .select('id')
          .eq('id', deviceId)
          .eq('customer_id', user.customerId)
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
          fastify.log.error('Failed to delete device: %s', error);
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
        fastify.log.error('Error deleting device: %s', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Restart device
  fastify.post(
    '/devices/:deviceId/restart',
    {
      preHandler: webPortalAuthHook,
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const supabase = getSupabaseAdminClient();
        const { deviceId } = request.params as { deviceId: string };

        // Check device exists and is online
        const { data: device } = await supabase
          .from('devices')
          .select('id, status')
          .eq('id', deviceId)
          .eq('customer_id', user.customerId)
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
        fastify.log.error('Error restarting device: %s', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Update firmware
  fastify.post(
    '/devices/:deviceId/firmware',
    {
      preHandler: webPortalAuthHook,
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const supabase = getSupabaseAdminClient();
        const { deviceId } = request.params as { deviceId: string };
        const { version } = request.body as { version: string };

        // Check device exists and is online
        const { data: device } = await supabase
          .from('devices')
          .select('id, status, firmware_version')
          .eq('id', deviceId)
          .eq('customer_id', user.customerId)
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
        const { data: updateRecord, error: firmwareError } = (await supabase
          .from('firmware_updates')
          .insert({
            device_id: deviceId,
            current_version:
              (device as { firmware_version?: string }).firmware_version ??
              'unknown',
            target_version: version,
            status: 'pending',
            initiated_by: user.id,
          })
          .select()
          .single()) as { data: { id: string } | null; error: Error | null };

        if (firmwareError) {
          fastify.log.error(
            'Failed to create firmware update record: %s',
            firmwareError
          );
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
          update_id: updateRecord?.id ?? '',
          timestamp: new Date().toISOString(),
        });

        return reply.send({
          success: true,
          update: updateRecord,
          message: 'Firmware update initiated',
        });
      } catch (error: unknown) {
        fastify.log.error('Error updating firmware: %s', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Get device diagnostics
  fastify.get(
    '/devices/:deviceId/diagnostics',
    {
      preHandler: webPortalAuthHook,
    },
    async (request, reply) => {
      const { user } = request;
      if (!user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      try {
        const supabase = getSupabaseAdminClient();
        const { deviceId } = request.params as { deviceId: string };

        // Check device exists and belongs to organization
        const { data: device } = (await supabase
          .from('devices')
          .select('*')
          .eq('id', deviceId)
          .eq('customer_id', user.customerId)
          .single()) as { data: DeviceRow | null; error: Error | null };

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
          diagnostics: diagnostics ?? [],
          events: events ?? [],
        });
      } catch (error: unknown) {
        fastify.log.error('Error fetching device diagnostics: %s', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Export devices to CSV
  fastify.get(
    '/devices/export',
    {
      preHandler: webPortalAuthHook,
    },
    async (request, reply) => {
      const { user } = request;
      if (!user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      try {
        const supabase = getSupabaseAdminClient();
        // Fetch all devices for the organization
        const { data: devices, error: exportError } = await supabase
          .from('devices')
          .select('*')
          .eq('customer_id', user.customerId)
          .order('created_at', { ascending: false });

        if (exportError) {
          fastify.log.error(
            'Failed to fetch devices for export: %s',
            exportError
          );
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

        const rows = ((devices as DeviceRow[]) ?? []).map(
          (device: DeviceRow) => [
            device.name ?? '',
            device.device_id ?? '',
            device.type ?? '',
            device.status ?? '',
            device.location ?? '',
            (device.network_info as { ip_address?: string } | null)
              ?.ip_address ?? '',
            '',
            device.last_heartbeat_at ?? '',
            device.registered_at ?? device.updated_at ?? '',
            ((device.configuration as string[] | null) ?? []).join('; '),
          ]
        );

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
        fastify.log.error('Error exporting devices: %s', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Bulk restart devices
  fastify.post(
    '/devices/bulk-restart',
    {
      preHandler: webPortalAuthHook,
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const supabase = getSupabaseAdminClient();
        const { device_ids } = request.body as { device_ids: string[] };

        if (!device_ids || device_ids.length === 0) {
          return reply.code(400).send({ error: 'No devices specified' });
        }

        // Verify all devices belong to organization and are online
        const { data: devices, error: fetchDevicesError } = await supabase
          .from('devices')
          .select('id, status')
          .in('id', device_ids)
          .eq('customer_id', user.customerId);

        if (fetchDevicesError || !devices) {
          fastify.log.error('Failed to fetch devices: %s', fetchDevicesError);
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
        const restartPromises = onlineDevices.map(
          async (device: { id: string; status: string }) => {
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
          }
        );

        await Promise.all(restartPromises);

        return reply.send({
          success: true,
          message: `Restart command sent to ${onlineDevices.length} device(s)`,
          devices_affected: onlineDevices.length,
        });
      } catch (error: unknown) {
        fastify.log.error('Error in bulk restart: %s', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Bulk enable devices
  fastify.post(
    '/devices/bulk-enable',
    {
      preHandler: webPortalAuthHook,
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const supabase = getSupabaseAdminClient();
        const { device_ids } = request.body as { device_ids: string[] };

        if (!device_ids || device_ids.length === 0) {
          return reply.code(400).send({ error: 'No devices specified' });
        }

        // Update devices to enable them
        const { data: updatedDevices, error: enableError } = await supabase
          .from('devices')
          .update({ enabled: true })
          .in('id', device_ids)
          .eq('customer_id', user.customerId)
          .select();

        if (enableError) {
          fastify.log.error('Failed to enable devices: %s', enableError);
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
          devices: updatedDevices as DeviceRow[],
        });

        return reply.send({
          success: true,
          message: `Enabled ${updatedDevices?.length ?? 0} device(s)`,
          devices_affected: updatedDevices?.length ?? 0,
        });
      } catch (error: unknown) {
        fastify.log.error('Error in bulk enable: %s', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Bulk disable devices
  fastify.post(
    '/devices/bulk-disable',
    {
      preHandler: webPortalAuthHook,
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const supabase = getSupabaseAdminClient();
        const { device_ids } = request.body as { device_ids: string[] };

        if (!device_ids || device_ids.length === 0) {
          return reply.code(400).send({ error: 'No devices specified' });
        }

        // Update devices to disable them
        const { data: updatedDevices, error: disableError } = await supabase
          .from('devices')
          .update({ enabled: false })
          .in('id', device_ids)
          .eq('customer_id', user.customerId)
          .select();

        if (disableError) {
          fastify.log.error('Failed to disable devices: %s', disableError);
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
          devices: updatedDevices as DeviceRow[],
        });

        return reply.send({
          success: true,
          message: `Disabled ${updatedDevices?.length ?? 0} device(s)`,
          devices_affected: updatedDevices?.length ?? 0,
        });
      } catch (error: unknown) {
        fastify.log.error('Error in bulk disable: %s', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Bulk remove devices
  fastify.post(
    '/devices/bulk-remove',
    {
      preHandler: webPortalAuthHook,
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || user.role !== 'owner') {
        return reply
          .code(403)
          .send({ error: 'Only owners can remove devices' });
      }

      try {
        const supabase = getSupabaseAdminClient();
        const { device_ids } = request.body as { device_ids: string[] };

        if (!device_ids || device_ids.length === 0) {
          return reply.code(400).send({ error: 'No devices specified' });
        }

        // Verify all devices belong to organization
        const { data: devices, error: verifyFetchError } = await supabase
          .from('devices')
          .select('id')
          .in('id', device_ids)
          .eq('customer_id', user.customerId);

        if (verifyFetchError) {
          fastify.log.error('Failed to fetch devices: %s', verifyFetchError);
          return reply.code(500).send({ error: 'Failed to fetch devices' });
        }

        if (!devices || devices.length === 0) {
          return reply.code(404).send({ error: 'No devices found' });
        }

        const validDeviceIds = devices.map((d: { id: string }) => d.id);

        // Delete devices
        const { error: removeError } = await supabase
          .from('devices')
          .delete()
          .in('id', validDeviceIds);

        if (removeError) {
          fastify.log.error('Failed to remove devices: %s', removeError);
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
        fastify.log.error('Error in bulk remove: %s', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Satisfy the async requirement
  await Promise.resolve();
};
