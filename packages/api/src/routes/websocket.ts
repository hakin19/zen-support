import { getRedisClient } from '@aizen/shared/utils/redis-client';
import { getSupabaseAdminClient } from '@aizen/shared/utils/supabase-client';

import { commandQueueService } from '../services/command-queue.service';
import { WebSocketConnectionManager } from '../services/websocket-connection-manager';
import {
  generateCorrelationId,
  extractCorrelationIdFromMessage,
  addCorrelationIdToMessage,
} from '../utils/correlation-id';
import {
  publishToChannel,
  subscribeToChannel,
  subscribeToMultipleChannels,
  getFromRedis,
  setInRedis,
  type DeviceStatusMessage,
  type DeviceControlMessage,
} from '../utils/redis-pubsub';

import type { MultiChannelSubscriptionHandle } from '@aizen/shared/utils/redis-client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';

// Global connection manager instance
let connectionManager: WebSocketConnectionManager;

/**
 * Get or create the connection manager instance
 */
export function getConnectionManager(): WebSocketConnectionManager {
  if (!connectionManager) {
    connectionManager = new WebSocketConnectionManager();
    // Start heartbeat with 30 second interval
    connectionManager.startHeartbeat(30000);
  }
  return connectionManager;
}

/**
 * Register WebSocket routes
 */
export async function registerWebSocketRoutes(
  app: FastifyInstance
): Promise<void> {
  // Register WebSocket plugin with security limits
  await app.register((await import('@fastify/websocket')) as any, {
    options: {
      maxPayload: 1048576, // 1MB limit - sufficient for diagnostic data
      // Additional security options
      perMessageDeflate: false, // Disable compression to prevent zip bomb attacks
      clientTracking: true, // Track connections for proper cleanup
    },
  });

  const manager = getConnectionManager();
  const redis = getRedisClient();
  const supabase = getSupabaseAdminClient();

  // Make connection manager available to server for graceful shutdown
  // Store in app decorators instead of direct assignment
  app.decorate('websocketConnections', manager);

  // Device WebSocket endpoint
  app.register(async fastify => {
    fastify.get(
      '/api/v1/device/ws',
      { websocket: true },
      async (socket: WebSocket, request: FastifyRequest) => {
        const ws = socket;
        const connectionId = generateCorrelationId();
        let deviceId: string | null = null;

        // Extract session token from headers
        const sessionToken = request.headers['x-device-session'] as string;

        if (!sessionToken) {
          ws.close(1008, 'Unauthorized');
          return;
        }

        try {
          // Validate session token with type-safe wrapper
          const sessionKey = `device:session:${sessionToken}`;
          const session = await getFromRedis<{ deviceId: string }>(
            redis,
            sessionKey
          );

          if (!session) {
            ws.close(1008, 'Unauthorized');
            return;
          }

          deviceId = session.deviceId;

          // Add connection to manager
          manager.addConnection(connectionId, ws, {
            type: 'device',
            deviceId,
            sessionToken,
            connectedAt: new Date().toISOString(),
          });

          // Send connection confirmation
          await manager.sendToConnection(
            connectionId,
            addCorrelationIdToMessage({
              type: 'connected',
              deviceId,
              timestamp: new Date().toISOString(),
            })
          );

          // Subscribe to device control channel with type-safe wrapper
          const controlChannel = `device:${deviceId}:control`;
          let subscriptionHandle: Awaited<
            ReturnType<typeof subscribeToChannel>
          > | null = null;

          try {
            subscriptionHandle = await subscribeToChannel<DeviceControlMessage>(
              redis,
              controlChannel,
              async data => {
                await manager.sendToConnection(
                  connectionId,
                  addCorrelationIdToMessage(data)
                );
              }
            );
          } catch (redisError) {
            request.log.error(redisError, 'Failed to setup Redis subscription');
            ws.close(1011, 'Server error');
            return;
          }

          // Handle incoming messages from device
          ws.on('message', (data: Buffer): void => {
            void (async (): Promise<void> => {
              let requestId: string | undefined;
              try {
                const message = JSON.parse(data.toString()) as Record<
                  string,
                  unknown
                >;
                requestId = extractCorrelationIdFromMessage(message);

                switch (message.type) {
                  case 'claim_command':
                    await handleDeviceClaimCommand(
                      deviceId as string,
                      connectionId,
                      requestId,
                      manager
                    );
                    break;

                  case 'command_result':
                    await handleDeviceCommandResult(
                      deviceId as string,
                      message,
                      connectionId,
                      requestId,
                      manager,
                      redis
                    );
                    break;

                  case 'heartbeat':
                    await manager.sendToConnection(
                      connectionId,
                      addCorrelationIdToMessage(
                        {
                          type: 'heartbeat_ack',
                          timestamp: new Date().toISOString(),
                        },
                        requestId
                      )
                    );
                    break;

                  case 'status_update':
                    await handleDeviceStatusUpdate(
                      deviceId as string,
                      message,
                      redis
                    );
                    break;

                  default:
                    await manager.sendToConnection(
                      connectionId,
                      addCorrelationIdToMessage(
                        {
                          type: 'error',
                          error: 'Unknown message type',
                        },
                        requestId
                      )
                    );
                }
              } catch (error) {
                request.log.error(error, 'Failed to process WebSocket message');
                await manager.sendToConnection(
                  connectionId,
                  addCorrelationIdToMessage(
                    {
                      type: 'error',
                      error: 'Invalid message format',
                    },
                    requestId
                  )
                );
              }
            })();
          });

          // Handle connection close
          ws.on('close', () => {
            void (async (): Promise<void> => {
              try {
                if (subscriptionHandle && 'unsubscribe' in subscriptionHandle) {
                  await subscriptionHandle.unsubscribe();
                }
                manager.removeConnection(connectionId);
                request.log.info(`Device ${String(deviceId)} disconnected`);
              } catch (error) {
                request.log.error(error, 'Error during connection close');
              }
            })();
          });

          // Handle errors
          ws.on('error', error => {
            request.log.error(error, 'WebSocket error');
            // Clean up Redis subscriber to prevent leaks
            void (async (): Promise<void> => {
              try {
                if (subscriptionHandle && 'unsubscribe' in subscriptionHandle) {
                  await subscriptionHandle.unsubscribe();
                }
                manager.removeConnection(connectionId);
              } catch (cleanupError) {
                request.log.error(
                  cleanupError,
                  'Failed to cleanup Redis subscriber'
                );
              }
            })();
          });
        } catch (error) {
          request.log.error(error, 'Failed to authenticate device');
          ws.close(1008, 'Authentication failed');
        }
      }
    );
    return Promise.resolve();
  });

  // Customer WebSocket endpoint
  app.register(async fastify => {
    fastify.get(
      '/api/v1/customer/ws',
      { websocket: true },
      async (socket: WebSocket, request: FastifyRequest) => {
        const ws = socket;
        const connectionId = generateCorrelationId();
        let customerId: string | null = null;
        let customerEmail: string | null = null;
        const subscribedChannels: string[] = [];

        // Extract JWT from headers
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
          ws.close(1008, 'Unauthorized');
          return;
        }

        const token = authHeader.substring(7);

        try {
          // Validate JWT with Supabase
          const {
            data: { user },
            error,
          } = await supabase.auth.getUser(token);

          if (error || !user) {
            ws.close(1008, 'Unauthorized');
            return;
          }

          customerId = user.id;
          customerEmail = user.email ?? null;

          // Add connection to manager
          manager.addConnection(connectionId, ws, {
            type: 'customer',
            customerId,
            customerEmail,
            connectedAt: new Date().toISOString(),
          });

          // Send connection confirmation
          await manager.sendToConnection(
            connectionId,
            addCorrelationIdToMessage({
              type: 'connected',
              customerId,
              timestamp: new Date().toISOString(),
            })
          );

          // Get customer's devices for room subscription
          // TODO: Add pagination or limit for customers with many devices
          // This unbounded query could cause performance issues at scale (1000+ devices)
          // Consider: .limit(100) with pagination, lazy loading, or filtering by status
          const { data: devices } = await supabase
            .from('devices')
            .select('id, name, status')
            .eq('customer_id', customerId);

          let multiChannelHandle: MultiChannelSubscriptionHandle | null = null;

          if (devices && devices.length > 0) {
            // Use a single Redis connection for all device channels
            // This is much more efficient than creating N connections for N devices
            try {
              // Build channel configurations
              const channelConfigs = devices.map(device => ({
                channel: `device:${device.id}:updates`,
                handler: async (data: DeviceStatusMessage) => {
                  await manager.sendToConnection(
                    connectionId,
                    addCorrelationIdToMessage({
                      ...data,
                      deviceId: device.id,
                    })
                  );
                },
              }));

              // Subscribe to all channels with a single connection
              multiChannelHandle =
                await subscribeToMultipleChannels<DeviceStatusMessage>(
                  redis,
                  channelConfigs
                );

              // Store handle for cleanup
              (
                ws as { multiChannelHandle?: MultiChannelSubscriptionHandle }
              ).multiChannelHandle = multiChannelHandle;

              // Track subscribed channels for logging
              subscribedChannels.push(
                ...devices.map(d => `device:${d.id}:updates`)
              );
            } catch (redisError) {
              request.log.error(
                redisError,
                'Failed to setup Redis subscription'
              );
              ws.close(1011, 'Server error');
              return;
            }
          }

          // Handle incoming messages from customer
          ws.on('message', (data: Buffer): void => {
            void (async (): Promise<void> => {
              let requestId: string | undefined;
              try {
                const message = JSON.parse(data.toString()) as Record<
                  string,
                  unknown
                >;
                requestId = extractCorrelationIdFromMessage(message);

                switch (message.type) {
                  case 'approve_session':
                    await handleSessionApproval(
                      customerId as string,
                      message,
                      requestId,
                      connectionId,
                      manager,
                      redis,
                      supabase
                    );
                    break;

                  case 'get_system_info':
                    await handleGetSystemInfo(
                      customerId as string,
                      message,
                      requestId,
                      connectionId,
                      manager,
                      redis,
                      supabase
                    );
                    break;

                  case 'send_command':
                    await handleSendCommand(
                      customerId as string,
                      message,
                      requestId,
                      connectionId,
                      manager,
                      redis,
                      supabase
                    );
                    break;

                  case 'join_rooms':
                    // Already handled during connection
                    await manager.sendToConnection(
                      connectionId,
                      addCorrelationIdToMessage(
                        {
                          type: 'rooms_joined',
                          deviceIds:
                            devices?.map((d: { id: string }) => d.id) ?? [],
                        },
                        requestId
                      )
                    );
                    break;

                  default:
                    await manager.sendToConnection(
                      connectionId,
                      addCorrelationIdToMessage(
                        {
                          type: 'error',
                          error: 'Unknown message type',
                        },
                        requestId
                      )
                    );
                }
              } catch (error) {
                request.log.error(error, 'Failed to process WebSocket message');
                await manager.sendToConnection(
                  connectionId,
                  addCorrelationIdToMessage(
                    {
                      type: 'error',
                      error: 'Invalid message format',
                    },
                    requestId
                  )
                );
              }
            })();
          });

          // Handle connection close
          ws.on('close', (): void => {
            const handle = (
              ws as { multiChannelHandle?: MultiChannelSubscriptionHandle }
            ).multiChannelHandle;
            void (async (): Promise<void> => {
              try {
                if (handle) {
                  await handle.disconnect();
                }
                manager.removeConnection(connectionId);
                request.log.info(`Customer ${String(customerId)} disconnected`);
              } catch (error) {
                request.log.error(
                  error,
                  'Error during customer connection close'
                );
              }
            })();
          });

          // Handle errors
          ws.on('error', (error): void => {
            request.log.error(error, 'WebSocket error');
            // Clean up Redis subscriber to prevent leaks
            const handle = (
              ws as { multiChannelHandle?: MultiChannelSubscriptionHandle }
            ).multiChannelHandle;
            void (async (): Promise<void> => {
              try {
                if (handle) {
                  await handle.disconnect();
                }
                manager.removeConnection(connectionId);
              } catch (cleanupError) {
                request.log.error(
                  cleanupError,
                  'Failed to cleanup Redis subscriber'
                );
              }
            })();
          });
        } catch (error) {
          request.log.error(error, 'Failed to authenticate customer');
          ws.close(1008, 'Authentication failed');
        }
      }
    );
    return Promise.resolve();
  });
}

// Helper functions for message handling

async function handleDeviceClaimCommand(
  deviceId: string,
  connectionId: string,
  requestId: string,
  manager: WebSocketConnectionManager
): Promise<void> {
  try {
    // Use the secure command queue service to claim commands
    const claimedCommands = await commandQueueService.claimCommands(
      deviceId,
      1, // Claim one command at a time via WebSocket
      300000 // 5 minutes visibility timeout
    );

    if (claimedCommands.length > 0) {
      const command = claimedCommands[0];
      await manager.sendToConnection(
        connectionId,
        addCorrelationIdToMessage(
          {
            type: 'command',
            command: {
              id: command.id,
              type: command.type,
              parameters: command.parameters,
              claimToken: command.claimToken, // Include claim token for result submission
              visibleUntil: command.visibleUntil,
            },
          },
          requestId
        )
      );
    } else {
      await manager.sendToConnection(
        connectionId,
        addCorrelationIdToMessage(
          {
            type: 'no_commands',
          },
          requestId
        )
      );
    }
  } catch (error) {
    console.error('Failed to claim command:', error);
    await manager.sendToConnection(
      connectionId,
      addCorrelationIdToMessage(
        {
          type: 'error',
          error: 'Failed to claim command',
        },
        requestId
      )
    );
  }
}

async function handleDeviceCommandResult(
  deviceId: string,
  message: Record<string, unknown>,
  connectionId: string,
  requestId: string,
  manager: WebSocketConnectionManager,
  redis: ReturnType<typeof getRedisClient>
): Promise<void> {
  try {
    // Validate required fields
    if (!message.commandId || !message.claimToken) {
      await manager.sendToConnection(
        connectionId,
        addCorrelationIdToMessage(
          {
            type: 'error',
            error: 'Missing commandId or claimToken',
          },
          requestId
        )
      );
      return;
    }

    // Build result object
    const result = {
      status: (message.status as string) ?? 'success',
      output: message.output,
      error: message.error,
      executedAt: (message.executedAt as string) ?? new Date().toISOString(),
      duration: (message.duration as number) ?? 0,
    };

    // Use the secure command queue service to submit result with claim token validation
    const submitResult = await commandQueueService.submitResult(
      message.commandId,
      message.claimToken,
      deviceId,
      result
    );

    if (!submitResult.success) {
      let errorMessage = 'Failed to submit command result';
      if (submitResult.error === 'NOT_FOUND') {
        errorMessage = 'Command not found';
      } else if (submitResult.error === 'INVALID_CLAIM') {
        errorMessage = 'Invalid or expired claim token';
      } else if (submitResult.error === 'ALREADY_COMPLETED') {
        errorMessage = 'Command already completed';
      }

      await manager.sendToConnection(
        connectionId,
        addCorrelationIdToMessage(
          {
            type: 'error',
            error: errorMessage,
          },
          requestId
        )
      );
      return;
    }

    // Notify customer via pub/sub with type-safe wrapper
    await publishToChannel(redis, `device:${deviceId}:updates`, {
      type: 'command_completed',
      commandId: message.commandId as string,
      result, // Use 'result' field for backward compatibility
      requestId,
      timestamp: new Date().toISOString(),
    });

    // Send acknowledgment
    await manager.sendToConnection(
      connectionId,
      addCorrelationIdToMessage(
        {
          type: 'ack',
        },
        requestId
      )
    );
  } catch (error) {
    console.error('Failed to submit command result:', error);
    await manager.sendToConnection(
      connectionId,
      addCorrelationIdToMessage(
        {
          type: 'error',
          error: 'Internal error processing command result',
        },
        requestId
      )
    );
  }
}

async function handleDeviceStatusUpdate(
  deviceId: string,
  message: Record<string, unknown>,
  redis: ReturnType<typeof getRedisClient>
): Promise<void> {
  // Update device status in Redis with type-safe wrapper
  const statusKey = `device:${deviceId}:status`;
  await setInRedis(
    redis,
    statusKey,
    {
      ...(message.status as Record<string, unknown>),
      lastUpdated: new Date().toISOString(),
    },
    300 // 5 minutes TTL
  );

  // Broadcast to customers with type-safe wrapper
  await publishToChannel<DeviceStatusMessage>(
    redis,
    `device:${deviceId}:updates`,
    {
      type: 'status_update',
      status: message.status as Record<string, unknown>,
      timestamp: new Date().toISOString(),
    }
  );
}

async function handleSessionApproval(
  customerId: string,
  message: Record<string, unknown>,
  requestId: string,
  connectionId: string,
  manager: WebSocketConnectionManager,
  redis: ReturnType<typeof getRedisClient>,
  supabase: ReturnType<typeof getSupabaseAdminClient>
): Promise<void> {
  // Verify customer owns the device
  const { data: device } = await supabase
    .from('devices')
    .select('id')
    .eq('id', String(message.deviceId))
    .eq('customer_id', customerId)
    .single();

  if (!device) {
    await manager.sendToConnection(
      connectionId,
      addCorrelationIdToMessage(
        {
          type: 'error',
          error: 'Unauthorized',
        },
        requestId
      )
    );
    return;
  }

  // Notify device via pub/sub with type-safe wrapper
  await publishToChannel<DeviceControlMessage>(
    redis,
    `device:${String(message.deviceId)}:control`,
    {
      type: 'session_approved',
      sessionId: message.sessionId as string,
      requestId,
      timestamp: new Date().toISOString(),
    }
  );

  // Update session status
  await supabase
    .from('diagnostic_sessions')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
    })
    .eq('id', message.sessionId as string);
}

async function handleGetSystemInfo(
  customerId: string,
  message: Record<string, unknown>,
  requestId: string,
  connectionId: string,
  manager: WebSocketConnectionManager,
  redis: ReturnType<typeof getRedisClient>,
  supabase: ReturnType<typeof getSupabaseAdminClient>
): Promise<void> {
  // Verify customer owns the device
  const result = await supabase
    .from('devices')
    .select('*')
    .eq('id', String(message.deviceId))
    .eq('customer_id', customerId)
    .single();

  const device = result.data;

  if (!device) {
    await manager.sendToConnection(
      connectionId,
      addCorrelationIdToMessage(
        {
          type: 'error',
          error: 'Unauthorized',
        },
        requestId
      )
    );
    return;
  }

  // Get cached system info from Redis with type-safe wrapper
  const infoKey = `device:${String(message.deviceId)}:system_info`;
  const systemInfo = await getFromRedis(redis, infoKey);

  await manager.sendToConnection(
    connectionId,
    addCorrelationIdToMessage(
      {
        type: 'system_info',
        deviceId: message.deviceId as string,
        info: systemInfo,
      },
      requestId
    )
  );
}

async function handleSendCommand(
  customerId: string,
  message: Record<string, unknown>,
  requestId: string,
  connectionId: string,
  manager: WebSocketConnectionManager,
  redis: ReturnType<typeof getRedisClient>,
  supabase: ReturnType<typeof getSupabaseAdminClient>
): Promise<void> {
  try {
    // Verify customer owns the device
    const { data: device } = await supabase
      .from('devices')
      .select('id')
      .eq('id', String(message.deviceId))
      .eq('customer_id', customerId)
      .single();

    if (!device) {
      await manager.sendToConnection(
        connectionId,
        addCorrelationIdToMessage(
          {
            type: 'error',
            error: 'Unauthorized',
          },
          requestId
        )
      );
      return;
    }

    // Use the command queue service to add command with proper atomicity and priority
    const command = await commandQueueService.addCommand(
      String(message.deviceId),
      customerId,
      message.commandType as string,
      (message.payload as Record<string, unknown>) ?? {},
      (message.priority as number) ?? 1 // Default priority
    );

    // Notify device if connected with type-safe wrapper
    await publishToChannel<DeviceControlMessage>(
      redis,
      `device:${String(message.deviceId)}:control`,
      {
        type: 'new_command',
        commandId: command.id,
        requestId,
        timestamp: new Date().toISOString(),
      }
    );

    await manager.sendToConnection(
      connectionId,
      addCorrelationIdToMessage(
        {
          type: 'command_queued',
          commandId: command.id,
          deviceId: message.deviceId as string,
        },
        requestId
      )
    );
  } catch (error) {
    console.error('Failed to queue command:', error);
    await manager.sendToConnection(
      connectionId,
      addCorrelationIdToMessage(
        {
          type: 'error',
          error: 'Failed to queue command',
        },
        requestId
      )
    );
  }
}
