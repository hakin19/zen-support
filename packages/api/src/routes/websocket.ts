import { getRedisClient } from '@aizen/shared/utils/redis-client';
import { getSupabaseAdminClient } from '@aizen/shared/utils/supabase-client';

import { config } from '../config';
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

// WebSocket route options are handled with type assertion since Fastify types don't include the websocket property

// Global connection manager instance
let connectionManager: WebSocketConnectionManager;

/**
 * Get or create the connection manager instance
 */
export function getConnectionManager(): WebSocketConnectionManager {
  if (!connectionManager) {
    connectionManager = new WebSocketConnectionManager();
    // Start heartbeat with configurable interval
    connectionManager.startHeartbeat(config.device.heartbeatInterval);
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
  const fastifyWebsocket = await import('@fastify/websocket');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  await app.register(fastifyWebsocket.default as any, {
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
  app.decorate('websocketConnectionManager', manager);

  // Device WebSocket endpoint
  app.register(async fastify => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    (fastify as any).get(
      '/api/v1/device/ws',
      { websocket: true },
      async (connection: unknown, request: FastifyRequest) => {
        const raw = connection as { socket?: WebSocket } | WebSocket;
        const ws = (raw as { socket?: WebSocket }).socket
          ? (raw as { socket: WebSocket }).socket
          : (raw as WebSocket);

        if (
          !ws ||
          typeof (ws as unknown as { on?: unknown }).on !== 'function'
        ) {
          request.log.error('WebSocket instance not available on connection');
          return;
        }
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
          const sessionKey = `session:${sessionToken}`;
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

          // Send connection confirmation with a tiny defer to let client
          // attach 'message' listener after 'open'. Also dispatch via manager.
          const connectedPayload = addCorrelationIdToMessage({
            type: 'connected',
            deviceId,
            timestamp: new Date().toISOString(),
          });
          setTimeout(() => {
            try {
              ws.send(JSON.stringify(connectedPayload));
            } catch {
              /* ignore send errors during teardown */
            }
          }, 10);

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
                  addCorrelationIdToMessage(
                    data as unknown as Record<string, unknown>
                  )
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

                // Mark device as offline in database
                try {
                  // In tests, Supabase may be a loose mock. Guard each step.
                  interface UpdateQuery {
                    update?: (v: unknown) => {
                      eq: (k: string, v: string) => Promise<unknown>;
                    };
                  }
                  const anySb = supabase as unknown as {
                    from?: (t: string) => unknown;
                  };
                  if (deviceId && typeof anySb.from === 'function') {
                    const q = anySb.from('devices') as UpdateQuery | null;
                    if (q && typeof q.update === 'function') {
                      await q
                        .update({
                          status: 'offline',
                          last_seen: new Date().toISOString(),
                        })
                        .eq('device_id', deviceId);
                    }
                  }
                } catch (dbErr) {
                  request.log.error(
                    dbErr,
                    'Failed to update device offline status'
                  );
                }
              } catch (error) {
                request.log.error(error, 'Error during connection close');
              }
            })();
          });

          // Handle errors
          ws.on('error', (error: Error) => {
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

  // Web Portal WebSocket endpoint (for chat)
  app.register(async fastify => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    (fastify as any).get(
      '/ws',
      { websocket: true },
      async (connection: unknown, request: FastifyRequest) => {
        const raw = connection as { socket?: WebSocket } | WebSocket;
        const ws = (raw as { socket?: WebSocket }).socket
          ? (raw as { socket: WebSocket }).socket
          : (raw as WebSocket);

        if (
          !ws ||
          typeof (ws as unknown as { on?: unknown }).on !== 'function'
        ) {
          request.log.error('WebSocket instance not available on connection');
          return;
        }
        const connectionId = generateCorrelationId();
        let userId: string | null = null;
        const subscribedChannels = new Set<string>();
        const redisSubscriptions: Map<
          string,
          { unsubscribe: () => Promise<void> }
        > = new Map();

        // Extract JWT from headers (for non-browser clients) or subprotocol (for browser clients)
        const authHeader = request.headers.authorization;
        const protocol = request.headers['sec-websocket-protocol'];

        let token: string | null = null;

        if (authHeader?.startsWith('Bearer ')) {
          token = authHeader.substring(7);
        } else if (protocol?.startsWith('auth-')) {
          // Extract token from subprotocol for browser clients (auth-{token})
          token = protocol.substring(5);
          // Accept the subprotocol in the response
          // Attach accepted protocol if available
          (ws as WebSocket & { protocol?: string }).protocol = protocol;
        }

        if (!token) {
          ws.close(1008, 'Unauthorized');
          return;
        }

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

          userId = user.id;

          // Add connection to manager with web portal metadata
          manager.addConnection(connectionId, ws, {
            type: 'web-portal',
            userId,
            userEmail: user.email,
            connectedAt: new Date().toISOString(),
          });

          // Send connection confirmation
          await manager.sendToConnection(
            connectionId,
            addCorrelationIdToMessage({
              type: 'connected',
              userId,
              timestamp: new Date().toISOString(),
            })
          );

          // Handle incoming messages from web portal
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
                  case 'ping':
                    // Handle ping/pong for connection health
                    await manager.sendToConnection(
                      connectionId,
                      addCorrelationIdToMessage(
                        {
                          type: 'pong',
                          timestamp: Date.now(),
                        },
                        requestId
                      )
                    );
                    break;

                  case 'subscribe':
                    // Subscribe to a channel (e.g., chat session)
                    if (typeof message.channel === 'string') {
                      const channel = message.channel;

                      // Only allow subscribing to authorized channels
                      if (channel.startsWith('chat:')) {
                        // Extract session ID from channel name (format: "chat:session-id")
                        const sessionId = channel.substring(5);

                        // Verify user has access to this chat session
                        const supabaseAdmin = getSupabaseAdminClient();

                        // First, get the user's customer_id
                        const { data: userData, error: userError } =
                          await supabaseAdmin
                            .from('users')
                            .select('customer_id')
                            .eq('id', userId)
                            .single();

                        if (userError || !userData?.customer_id) {
                          await manager.sendToConnection(
                            connectionId,
                            addCorrelationIdToMessage(
                              {
                                type: 'error',
                                error: 'User not associated with a customer',
                              },
                              requestId
                            )
                          );
                          break;
                        }

                        // Verify the session belongs to the user's customer
                        const { data: session, error: sessionError } =
                          await supabaseAdmin
                            .from('chat_sessions')
                            .select('id, customer_id')
                            .eq('id', sessionId)
                            .eq('customer_id', userData.customer_id)
                            .single();

                        if (sessionError || !session) {
                          await manager.sendToConnection(
                            connectionId,
                            addCorrelationIdToMessage(
                              {
                                type: 'error',
                                error: 'Access denied to this chat session',
                              },
                              requestId
                            )
                          );
                          request.log.warn(
                            {
                              userId,
                              sessionId,
                              customerId: (userData as { customer_id: string })
                                .customer_id,
                            },
                            'Unauthorized chat subscription attempt'
                          );
                          break;
                        }

                        if (!subscribedChannels.has(channel)) {
                          try {
                            const subscription = await redis.createSubscription(
                              channel,
                              (data: unknown) => {
                                void manager.sendToConnection(
                                  connectionId,
                                  addCorrelationIdToMessage({
                                    type: 'channel',
                                    channel,
                                    data,
                                  })
                                );
                              }
                            );

                            redisSubscriptions.set(channel, subscription);
                            subscribedChannels.add(channel);

                            await manager.sendToConnection(
                              connectionId,
                              addCorrelationIdToMessage(
                                {
                                  type: 'subscribed',
                                  channel,
                                },
                                requestId
                              )
                            );
                          } catch (error) {
                            request.log.error(
                              {
                                error,
                                channel,
                                connectionId,
                              },
                              'Failed to create Redis subscription'
                            );

                            await manager.sendToConnection(
                              connectionId,
                              addCorrelationIdToMessage(
                                {
                                  type: 'error',
                                  error: 'Failed to subscribe to channel',
                                },
                                requestId
                              )
                            );
                          }
                        }
                      } else {
                        await manager.sendToConnection(
                          connectionId,
                          addCorrelationIdToMessage(
                            {
                              type: 'error',
                              error: 'Invalid channel',
                            },
                            requestId
                          )
                        );
                      }
                    }
                    break;

                  case 'unsubscribe':
                    // Unsubscribe from a channel
                    if (typeof message.channel === 'string') {
                      const channel = message.channel;
                      const subscription = redisSubscriptions.get(channel);

                      if (subscription) {
                        await subscription.unsubscribe();
                        redisSubscriptions.delete(channel);
                        subscribedChannels.delete(channel);

                        await manager.sendToConnection(
                          connectionId,
                          addCorrelationIdToMessage(
                            {
                              type: 'unsubscribed',
                              channel,
                            },
                            requestId
                          )
                        );
                      }
                    }
                    break;

                  case 'auth':
                    // Handle auth token refresh
                    await manager.sendToConnection(
                      connectionId,
                      addCorrelationIdToMessage(
                        {
                          type: 'auth_success',
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
            void (async (): Promise<void> => {
              try {
                // Unsubscribe from all Redis channels
                for (const subscription of redisSubscriptions.values()) {
                  await subscription.unsubscribe();
                }
                redisSubscriptions.clear();
                subscribedChannels.clear();

                manager.removeConnection(connectionId);
                request.log.info(
                  `Web portal user ${String(userId)} disconnected`
                );
              } catch (error) {
                request.log.error(
                  error,
                  'Error during web portal connection close'
                );
              }
            })();
          });

          // Handle errors
          ws.on('error', (error: Error): void => {
            request.log.error(error, 'WebSocket error');
            // Clean up Redis subscribers to prevent leaks
            void (async (): Promise<void> => {
              try {
                for (const subscription of redisSubscriptions.values()) {
                  await subscription.unsubscribe();
                }
                redisSubscriptions.clear();
                manager.removeConnection(connectionId);
              } catch (cleanupError) {
                request.log.error(
                  cleanupError,
                  'Failed to cleanup Redis subscribers'
                );
              }
            })();
          });
        } catch (error) {
          request.log.error(error, 'Failed to authenticate web portal user');
          ws.close(1008, 'Authentication failed');
        }
      }
    );
    return Promise.resolve();
  });

  // Customer WebSocket endpoint
  app.register(async fastify => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    (fastify as any).get(
      '/api/v1/customer/ws',
      { websocket: true },
      async (connection: unknown, request: FastifyRequest) => {
        const raw = connection as { socket?: WebSocket } | WebSocket;
        const ws = (raw as { socket?: WebSocket }).socket
          ? (raw as { socket: WebSocket }).socket
          : (raw as WebSocket);
        const connectionId = generateCorrelationId();
        let customerId: string | null = null;
        let customerEmail: string | null = null;
        const subscribedChannels: string[] = [];
        let isAuthenticated = false;
        let multiChannelHandle: MultiChannelSubscriptionHandle | null = null;
        let devices: Array<{
          id: string;
          name: string | null;
          status: string | null;
        }> | null = null;

        // Add connection to manager immediately with pending status
        manager.addConnection(connectionId, ws, {
          type: 'customer',
          customerId: null,
          customerEmail: null,
          connectedAt: new Date().toISOString(),
        });

        // Extract JWT from headers (for non-browser clients) or subprotocol (for browser clients)
        const authHeader = request.headers.authorization;
        const protocol = request.headers['sec-websocket-protocol'];

        let token: string | null = null;

        if (authHeader?.startsWith('Bearer ')) {
          token = authHeader.substring(7);
        } else if (protocol?.startsWith('auth-')) {
          // Extract token from subprotocol for browser clients (auth-{token})
          token = protocol.substring(5);
          // Accept the subprotocol in the response
          (ws as WebSocket & { protocol?: string }).protocol = protocol;
        }

        // Function to authenticate and setup customer connection
        const authenticateAndSetup = async (
          authToken: string
        ): Promise<boolean> => {
          try {
            // Validate JWT with Supabase
            const {
              data: { user },
              error,
            } = await supabase.auth.getUser(authToken);

            if (error || !user) {
              return false;
            }

            // Get the actual customer_id from the users table
            // user.id is the Supabase auth user ID, we need the tenant customer_id
            const { data: userData, error: userError } = await supabase
              .from('users')
              .select('customer_id')
              .eq('id', user.id)
              .single();

            if (userError || !userData) {
              request.log.error(
                userError,
                'User not found in customer database'
              );
              return false;
            }

            // Store both IDs - user.id is the Supabase auth user ID
            // userData.customer_id is the actual tenant/customer ID
            customerId = userData.customer_id as string;
            customerEmail = user.email ?? null;
            isAuthenticated = true;

            // Update connection metadata with authenticated user info
            const connectionMetadata = {
              type: 'customer' as const,
              customerId,
              customerEmail,
              connectedAt: new Date().toISOString(),
            };

            // Update the existing connection with authentication info
            manager.updateConnectionMetadata(connectionId, connectionMetadata);

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
            const { data: devicesData } = await supabase
              .from('devices')
              .select('id, name, status')
              .eq('customer_id', customerId);

            // Store devices in outer scope for message handlers
            devices = devicesData;

            if (devices && devices.length > 0) {
              // Use a single Redis connection for all device channels
              // This is much more efficient than creating N connections for N devices
              try {
                // Build channel configurations
                const channelConfigs = devices.map(device => ({
                  channel: `device:${device.id}:updates`,
                  handler: async (data: DeviceStatusMessage): Promise<void> => {
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
                return false;
              }
            }

            return true;
          } catch (error) {
            request.log.error(error, 'Authentication failed');
            return false;
          }
        };

        // If token was provided in headers, authenticate immediately
        if (token) {
          const success = await authenticateAndSetup(token);
          if (!success) {
            ws.close(1008, 'Unauthorized');
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

              // Handle auth message from browser clients
              if (message.type === 'auth' && !isAuthenticated) {
                const authToken = message.token as string;
                if (!authToken) {
                  await manager.sendToConnection(
                    connectionId,
                    addCorrelationIdToMessage(
                      {
                        type: 'error',
                        error: 'Missing authentication token',
                      },
                      requestId
                    )
                  );
                  ws.close(1008, 'Unauthorized');
                  return;
                }

                const success = await authenticateAndSetup(authToken);
                if (!success) {
                  await manager.sendToConnection(
                    connectionId,
                    addCorrelationIdToMessage(
                      {
                        type: 'error',
                        error: 'Authentication failed',
                      },
                      requestId
                    )
                  );
                  ws.close(1008, 'Unauthorized');
                  return;
                }

                // Send auth success message
                await manager.sendToConnection(
                  connectionId,
                  addCorrelationIdToMessage(
                    {
                      type: 'auth_success',
                      customerId,
                    },
                    requestId
                  )
                );
                return;
              }

              // Require authentication for all other messages
              if (!isAuthenticated) {
                await manager.sendToConnection(
                  connectionId,
                  addCorrelationIdToMessage(
                    {
                      type: 'error',
                      error: 'Not authenticated. Send auth message first.',
                    },
                    requestId
                  )
                );
                return;
              }

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
        ws.on('error', (error: Error): void => {
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
      if (command) {
        await manager.sendToConnection(
          connectionId,
          addCorrelationIdToMessage(
            {
              type: 'command',
              command: {
                id: command.id,
                type: command.type,
                parameters: command.parameters ?? {},
                claimToken: command.claimToken, // Include claim token for result submission
                visibleUntil: command.visibleUntil,
              },
            },
            requestId
          )
        );
      }
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
  } catch {
    // Log error - will be replaced with proper logger later
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
      message.commandId as string,
      message.claimToken as string,
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
  } catch {
    // Log error - will be replaced with proper logger later
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

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
  } catch {
    // Log error - will be replaced with proper logger later
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
