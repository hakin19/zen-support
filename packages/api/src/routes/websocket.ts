import { getRedisClient } from '@aizen/shared/utils/redis-client';
import { getSupabaseAdminClient } from '@aizen/shared/utils/supabase-client';

import { WebSocketConnectionManager } from '../services/websocket-connection-manager';
import {
  generateCorrelationId,
  extractCorrelationIdFromMessage,
  addCorrelationIdToMessage,
} from '../utils/correlation-id';

import type { FastifyInstance } from 'fastify';
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
  // Register WebSocket plugin
  await app.register(import('@fastify/websocket'));

  const manager = getConnectionManager();
  const redis = getRedisClient();
  const supabase = getSupabaseAdminClient();

  // Make connection manager available to server for graceful shutdown
  (app as any).websocketConnections = manager;

  // Device WebSocket endpoint
  app.register(async fastify => {
    fastify.get(
      '/api/v1/device/ws',
      { websocket: true },
      async (socket, request) => {
        const ws = socket as WebSocket;
        const connectionId = generateCorrelationId();
        let deviceId: string | null = null;
        let authenticated = false;

        // Extract session token from headers
        const sessionToken = request.headers['x-device-session'] as string;

        if (!sessionToken) {
          ws.close(1008, 'Unauthorized');
          return;
        }

        try {
          // Validate session token
          const sessionKey = `device:session:${sessionToken}`;
          const sessionData = await redis.get(sessionKey);

          if (!sessionData) {
            ws.close(1008, 'Unauthorized');
            return;
          }

          const session = JSON.parse(sessionData);
          deviceId = session.deviceId;
          authenticated = true;

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

          // Subscribe to device control channel
          const controlChannel = `device:${deviceId}:control`;
          const subscriber = redis.duplicate();
          await subscriber.connect();
          await subscriber.subscribe(controlChannel, (message: string) => {
            try {
              const data = JSON.parse(message);
              manager.sendToConnection(
                connectionId,
                addCorrelationIdToMessage(data)
              );
            } catch (error) {
              request.log.error(error, 'Failed to handle Redis message');
            }
          });

          // Handle incoming messages from device
          ws.on('message', async (data: Buffer) => {
            try {
              const message = JSON.parse(data.toString());
              const requestId = extractCorrelationIdFromMessage(message);

              switch (message.type) {
                case 'claim_command':
                  await handleDeviceClaimCommand(
                    deviceId!,
                    connectionId,
                    requestId,
                    manager,
                    redis
                  );
                  break;

                case 'command_result':
                  await handleDeviceCommandResult(
                    deviceId!,
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
                  await handleDeviceStatusUpdate(deviceId!, message, redis);
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
                addCorrelationIdToMessage({
                  type: 'error',
                  error: 'Invalid message format',
                })
              );
            }
          });

          // Handle connection close
          ws.on('close', async () => {
            await subscriber.unsubscribe(controlChannel);
            await subscriber.disconnect();
            manager.removeConnection(connectionId);
            request.log.info(`Device ${deviceId} disconnected`);
          });

          // Handle errors
          ws.on('error', error => {
            request.log.error(error, 'WebSocket error');
            manager.removeConnection(connectionId);
          });
        } catch (error) {
          request.log.error(error, 'Failed to authenticate device');
          ws.close(1008, 'Authentication failed');
        }
      }
    );
  });

  // Customer WebSocket endpoint
  app.register(async fastify => {
    fastify.get(
      '/api/v1/customer/ws',
      { websocket: true },
      async (socket, request) => {
        const ws = socket as WebSocket;
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
          customerEmail = user.email || null;

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
          const { data: devices } = await supabase
            .from('devices')
            .select('id, name, status')
            .eq('customer_id', customerId);

          if (devices && devices.length > 0) {
            // Subscribe to device update channels
            const subscriber = redis.duplicate();
            await subscriber.connect();

            for (const device of devices) {
              const channel = `device:${device.id}:updates`;
              subscribedChannels.push(channel);
              await subscriber.subscribe(channel, (message: string) => {
                try {
                  const data = JSON.parse(message);
                  manager.sendToConnection(
                    connectionId,
                    addCorrelationIdToMessage({
                      ...data,
                      deviceId: device.id,
                    })
                  );
                } catch (error) {
                  request.log.error(error, 'Failed to handle Redis message');
                }
              });
            }

            // Store subscriber for cleanup
            (ws as any).redisSubscriber = subscriber;
          }

          // Handle incoming messages from customer
          ws.on('message', async (data: Buffer) => {
            try {
              const message = JSON.parse(data.toString());
              const requestId = extractCorrelationIdFromMessage(message);

              switch (message.type) {
                case 'approve_session':
                  await handleSessionApproval(
                    customerId!,
                    message,
                    requestId,
                    manager,
                    redis,
                    supabase
                  );
                  break;

                case 'get_system_info':
                  await handleGetSystemInfo(
                    customerId!,
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
                    customerId!,
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
                        deviceIds: devices?.map(d => d.id) || [],
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
                addCorrelationIdToMessage({
                  type: 'error',
                  error: 'Invalid message format',
                })
              );
            }
          });

          // Handle connection close
          ws.on('close', async () => {
            const subscriber = (ws as any).redisSubscriber;
            if (subscriber) {
              for (const channel of subscribedChannels) {
                await subscriber.unsubscribe(channel);
              }
              await subscriber.disconnect();
            }
            manager.removeConnection(connectionId);
            request.log.info(`Customer ${customerId} disconnected`);
          });

          // Handle errors
          ws.on('error', error => {
            request.log.error(error, 'WebSocket error');
            manager.removeConnection(connectionId);
          });
        } catch (error) {
          request.log.error(error, 'Failed to authenticate customer');
          ws.close(1008, 'Authentication failed');
        }
      }
    );
  });

  // Add graceful shutdown handler for WebSocket connections
  app.addHook('onClose', async () => {
    await manager.cleanup();
  });
}

// Helper functions for message handling

async function handleDeviceClaimCommand(
  deviceId: string,
  connectionId: string,
  requestId: string,
  manager: WebSocketConnectionManager,
  redis: any
): Promise<void> {
  // Implementation would claim a command from the queue
  // This is a simplified version
  const commandKey = `device:${deviceId}:commands:pending`;
  const command = await redis.lpop(commandKey);

  if (command) {
    const commandData = JSON.parse(command);
    await manager.sendToConnection(
      connectionId,
      addCorrelationIdToMessage(
        {
          type: 'command',
          command: commandData,
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
}

async function handleDeviceCommandResult(
  deviceId: string,
  message: any,
  connectionId: string,
  requestId: string,
  manager: WebSocketConnectionManager,
  redis: any
): Promise<void> {
  // Store command result
  const resultKey = `command:${message.commandId}:result`;
  await redis.setex(
    resultKey,
    86400, // 24 hours TTL
    JSON.stringify({
      ...message.result,
      completedAt: new Date().toISOString(),
      deviceId,
    })
  );

  // Notify customer via pub/sub
  await redis.publish(
    `device:${deviceId}:updates`,
    JSON.stringify({
      type: 'command_completed',
      commandId: message.commandId,
      result: message.result,
      timestamp: new Date().toISOString(),
    })
  );

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
}

async function handleDeviceStatusUpdate(
  deviceId: string,
  message: any,
  redis: any
): Promise<void> {
  // Update device status in Redis
  const statusKey = `device:${deviceId}:status`;
  await redis.setex(
    statusKey,
    300, // 5 minutes TTL
    JSON.stringify({
      ...message.status,
      lastUpdated: new Date().toISOString(),
    })
  );

  // Broadcast to customers
  await redis.publish(
    `device:${deviceId}:updates`,
    JSON.stringify({
      type: 'status_update',
      status: message.status,
      timestamp: new Date().toISOString(),
    })
  );
}

async function handleSessionApproval(
  customerId: string,
  message: any,
  requestId: string,
  manager: WebSocketConnectionManager,
  redis: any,
  supabase: any
): Promise<void> {
  // Verify customer owns the device
  const { data: device } = await supabase
    .from('devices')
    .select('id')
    .eq('id', message.deviceId)
    .eq('customer_id', customerId)
    .single();

  if (!device) {
    await manager.sendToConnection(
      message.connectionId,
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

  // Notify device via pub/sub
  await redis.publish(
    `device:${message.deviceId}:control`,
    JSON.stringify({
      type: 'session_approved',
      sessionId: message.sessionId,
      requestId,
      timestamp: new Date().toISOString(),
    })
  );

  // Update session status
  await supabase
    .from('diagnostic_sessions')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
    })
    .eq('id', message.sessionId);
}

async function handleGetSystemInfo(
  customerId: string,
  message: any,
  requestId: string,
  connectionId: string,
  manager: WebSocketConnectionManager,
  redis: any,
  supabase: any
): Promise<void> {
  // Verify customer owns the device
  const { data: device } = await supabase
    .from('devices')
    .select('*')
    .eq('id', message.deviceId)
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

  // Get cached system info from Redis
  const infoKey = `device:${message.deviceId}:system_info`;
  const systemInfo = await redis.get(infoKey);

  await manager.sendToConnection(
    connectionId,
    addCorrelationIdToMessage(
      {
        type: 'system_info',
        deviceId: message.deviceId,
        info: systemInfo ? JSON.parse(systemInfo) : null,
      },
      requestId
    )
  );
}

async function handleSendCommand(
  customerId: string,
  message: any,
  requestId: string,
  connectionId: string,
  manager: WebSocketConnectionManager,
  redis: any,
  supabase: any
): Promise<void> {
  // Verify customer owns the device
  const { data: device } = await supabase
    .from('devices')
    .select('id')
    .eq('id', message.deviceId)
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

  // Queue command for device
  const commandId = generateCorrelationId();
  const commandData = {
    id: commandId,
    type: message.commandType,
    payload: message.payload,
    createdAt: new Date().toISOString(),
    customerId,
    requestId,
  };

  const commandKey = `device:${message.deviceId}:commands:pending`;
  await redis.rpush(commandKey, JSON.stringify(commandData));

  // Notify device if connected
  await redis.publish(
    `device:${message.deviceId}:control`,
    JSON.stringify({
      type: 'new_command',
      commandId,
      timestamp: new Date().toISOString(),
    })
  );

  await manager.sendToConnection(
    connectionId,
    addCorrelationIdToMessage(
      {
        type: 'command_queued',
        commandId,
      },
      requestId
    )
  );
}
