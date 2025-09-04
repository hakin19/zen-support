import { randomUUID } from 'crypto';

import { getRedisClient } from '@aizen/shared/utils/redis-client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CommandParameters = Record<string, any>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CommandResult = Record<string, any>;

interface Command {
  id: string;
  deviceId: string;
  customerId: string;
  type: string;
  parameters: CommandParameters;
  priority: number;
  status: 'pending' | 'claimed' | 'completed';
  createdAt: string;
  claimedAt?: string;
  claimedBy?: string;
  claimToken?: string;
  visibleUntil?: string;
  completedAt?: string;
  result?: CommandResult;
}

interface ClaimedCommand {
  id: string;
  type: string;
  parameters: CommandParameters;
  priority: number;
  claimToken: string;
  visibleUntil: string;
}

interface ExtendResult {
  success: boolean;
  visibleUntil?: string;
  error?: 'NOT_FOUND' | 'INVALID_CLAIM';
}

interface SubmitResult {
  success: boolean;
  error?: 'NOT_FOUND' | 'INVALID_CLAIM' | 'ALREADY_COMPLETED';
}

// Redis key patterns:
// commands:pending:{deviceId} - sorted set of pending command IDs (score = priority:timestamp)
// commands:claimed:{deviceId} - hash of claimed commands (field = commandId, value = claimToken:visibleUntil)
// command:{commandId} - hash of command data
// commands:by-device:{deviceId} - set of all command IDs for a device

const COMMAND_PREFIX = 'command:';
const PENDING_QUEUE_PREFIX = 'commands:pending:';
const CLAIMED_PREFIX = 'commands:claimed:';
const DEVICE_COMMANDS_PREFIX = 'commands:by-device:';
const VISIBILITY_CHECK_INTERVAL = 10000; // 10 seconds

export const commandQueueService = {
  /**
   * Add a new command to the queue for a device
   */
  async addCommand(
    deviceId: string,
    customerId: string,
    type: string,
    parameters: CommandParameters,
    priority = 1
  ): Promise<Command> {
    const redis = getRedisClient().getClient();
    const commandId = randomUUID();
    const now = new Date().toISOString();

    const command: Command = {
      id: commandId,
      deviceId,
      customerId,
      type,
      parameters,
      priority,
      status: 'pending',
      createdAt: now,
    };

    // Store command data
    const redisHash = Object.entries(command).reduce(
      (acc, [key, value]) => {
        acc[key] =
          typeof value === 'object' ? JSON.stringify(value) : String(value);
        return acc;
      },
      {} as Record<string, string>
    );

    await redis.hSet(`${COMMAND_PREFIX}${commandId}`, redisHash);

    // Add to pending queue with composite score (priority:timestamp)
    // Higher priority = lower score (processed first)
    // Within same priority, older commands processed first (FIFO)
    const timestamp = Date.now();
    const score = priority * 1e13 + timestamp; // Ensures priority separation
    await redis.zAdd(`${PENDING_QUEUE_PREFIX}${deviceId}`, {
      score,
      value: commandId,
    });

    // Add to device command set for tracking
    await redis.sAdd(`${DEVICE_COMMANDS_PREFIX}${deviceId}`, commandId);

    return command;
  },

  /**
   * Claim the next available command for a device
   */
  async claimCommand(deviceId: string): Promise<ClaimedCommand | null> {
    const redis = getRedisClient().getClient();

    // Get the highest priority command (lowest score)
    const pendingCommands = await redis.zRangeWithScores(
      `${PENDING_QUEUE_PREFIX}${deviceId}`,
      0,
      0
    );

    if (pendingCommands.length === 0) {
      return null;
    }

    const commandId = pendingCommands[0]?.value;
    if (!commandId) {
      return null;
    }

    // Generate claim token and visibility timeout (30 seconds from now)
    const claimToken = randomUUID();
    const visibleUntil = new Date(Date.now() + 30000).toISOString();

    // Atomic operation: remove from pending, add to claimed
    const multi = redis.multi();
    multi.zRem(`${PENDING_QUEUE_PREFIX}${deviceId}`, commandId);
    multi.hSet(
      `${CLAIMED_PREFIX}${deviceId}`,
      commandId,
      `${claimToken}:${visibleUntil}`
    );

    // Update command status
    // @ts-expect-error - Redis multi operations are properly typed
    multi.hMSet(`${COMMAND_PREFIX}${commandId}`, {
      status: 'claimed',
      claimedAt: new Date().toISOString(),
      claimedBy: deviceId,
      claimToken,
      visibleUntil,
    });

    const results = await multi.exec();

    // Check if all operations succeeded
    if (!results || results.some(([error]) => error)) {
      // If atomic operation failed, try to recover by re-adding to pending
      await redis.zAdd(`${PENDING_QUEUE_PREFIX}${deviceId}`, {
        score: pendingCommands[0]?.score ?? 0,
        value: commandId,
      });
      return null;
    }

    // Get command data
    const commandData = await redis.hGetAll(`${COMMAND_PREFIX}${commandId}`);
    if (!commandData || Object.keys(commandData).length === 0) {
      return null;
    }

    return {
      id: commandId,
      type: commandData.type ?? '',
      parameters: commandData.parameters
        ? (JSON.parse(commandData.parameters) as CommandParameters)
        : {},
      priority: parseInt(commandData.priority ?? '1', 10),
      claimToken,
      visibleUntil,
    };
  },

  /**
   * Extend the visibility timeout for a claimed command
   */
  async extendCommand(
    deviceId: string,
    commandId: string,
    claimToken: string,
    extensionSeconds = 30
  ): Promise<ExtendResult> {
    const redis = getRedisClient().getClient();

    // Check if command is claimed by this device with this token
    const claimedData = await redis.hGet(
      `${CLAIMED_PREFIX}${deviceId}`,
      commandId
    );
    if (!claimedData) {
      return { success: false, error: 'NOT_FOUND' };
    }

    const [storedToken] = claimedData.split(':');
    if (storedToken !== claimToken) {
      return { success: false, error: 'INVALID_CLAIM' };
    }

    // Extend visibility timeout
    const newVisibleUntil = new Date(
      Date.now() + extensionSeconds * 1000
    ).toISOString();

    const multi = redis.multi();
    multi.hSet(
      `${CLAIMED_PREFIX}${deviceId}`,
      commandId,
      `${claimToken}:${newVisibleUntil}`
    );
    multi.hSet(
      `${COMMAND_PREFIX}${commandId}`,
      'visibleUntil',
      newVisibleUntil
    );

    await multi.exec();

    return { success: true, visibleUntil: newVisibleUntil };
  },

  /**
   * Submit result for a claimed command
   */
  async submitResult(
    deviceId: string,
    commandId: string,
    claimToken: string,
    result: CommandResult
  ): Promise<SubmitResult> {
    const redis = getRedisClient().getClient();

    // Check if command is claimed by this device with this token
    const claimedData = await redis.hGet(
      `${CLAIMED_PREFIX}${deviceId}`,
      commandId
    );
    if (!claimedData) {
      return { success: false, error: 'NOT_FOUND' };
    }

    const [storedToken] = claimedData.split(':');
    if (storedToken !== claimToken) {
      return { success: false, error: 'INVALID_CLAIM' };
    }

    // Check if already completed
    const commandStatus = await redis.hGet(
      `${COMMAND_PREFIX}${commandId}`,
      'status'
    );
    if (commandStatus === 'completed') {
      return { success: false, error: 'ALREADY_COMPLETED' };
    }

    // Mark as completed
    const completedAt = new Date().toISOString();
    const multi = redis.multi();

    // @ts-expect-error - Redis multi operations are properly typed
    multi.hMSet(`${COMMAND_PREFIX}${commandId}`, {
      status: 'completed',
      completedAt,
      result: JSON.stringify(result),
    });

    multi.hDel(`${CLAIMED_PREFIX}${deviceId}`, commandId);

    await multi.exec();

    return { success: true };
  },

  /**
   * Get command details by ID
   */
  async getCommand(commandId: string): Promise<Command | null> {
    const redis = getRedisClient().getClient();
    const commandData = await redis.hGetAll(`${COMMAND_PREFIX}${commandId}`);

    if (!commandData || Object.keys(commandData).length === 0) {
      return null;
    }

    const command: Command = {
      id: commandId,
      deviceId: commandData.deviceId ?? '',
      customerId: commandData.customerId ?? '',
      type: commandData.type ?? '',
      parameters: commandData.parameters
        ? (JSON.parse(commandData.parameters) as CommandParameters)
        : {},
      priority: parseInt(commandData.priority ?? '1', 10),
      status: (commandData.status ?? 'pending') as Command['status'],
      createdAt: commandData.createdAt ?? '',
      claimedAt: commandData.claimedAt,
      claimedBy: commandData.claimedBy,
      claimToken: commandData.claimToken,
      visibleUntil: commandData.visibleUntil,
      completedAt: commandData.completedAt,
      result: commandData.result
        ? (JSON.parse(commandData.result) as CommandResult)
        : undefined,
    };

    return command;
  },

  /**
   * Get all commands for a device
   */
  async getDeviceCommands(deviceId: string): Promise<Command[]> {
    const redis = getRedisClient().getClient();
    const commandIds = await redis.sMembers(
      `${DEVICE_COMMANDS_PREFIX}${deviceId}`
    );

    if (commandIds.length === 0) {
      return [];
    }

    const commands: Command[] = [];
    for (const commandId of commandIds) {
      const command = await this.getCommand(commandId);
      if (command) {
        commands.push(command);
      }
    }

    return commands.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },

  /**
   * Clean up expired claimed commands (make them available again)
   */
  async cleanupExpiredClaims(): Promise<void> {
    const redis = getRedisClient().getClient();
    const now = new Date().toISOString();

    // Get all claimed command keys
    const claimedKeys = await redis.keys(`${CLAIMED_PREFIX}*`);

    for (const claimedKey of claimedKeys) {
      const deviceId = claimedKey.replace(CLAIMED_PREFIX, '');
      const claimedCommands = await redis.hGetAll(claimedKey);

      for (const [commandId, claimedData] of Object.entries(claimedCommands)) {
        const [, visibleUntil] = claimedData.split(':');

        if (visibleUntil && visibleUntil < now) {
          // Command visibility expired, return to pending queue
          const commandData = await redis.hGetAll(
            `${COMMAND_PREFIX}${commandId}`
          );
          if (commandData && Object.keys(commandData).length > 0) {
            const priority = parseInt(commandData.priority ?? '1', 10);
            const timestamp = Date.now();
            const score = priority * 1e13 + timestamp;

            const multi = redis.multi();
            multi.hDel(claimedKey, commandId);
            multi.zAdd(`${PENDING_QUEUE_PREFIX}${deviceId}`, {
              score,
              value: commandId,
            });
            // @ts-expect-error - Redis multi operations are properly typed
            multi.hMSet(`${COMMAND_PREFIX}${commandId}`, {
              status: 'pending',
              claimedAt: '',
              claimedBy: '',
              claimToken: '',
              visibleUntil: '',
            });

            await multi.exec();
          }
        }
      }
    }
  },

  /**
   * Delete a command and all its associated data
   */
  async deleteCommand(commandId: string): Promise<void> {
    const redis = getRedisClient().getClient();

    // Get command to find deviceId
    const commandData = await redis.hGetAll(`${COMMAND_PREFIX}${commandId}`);
    if (!commandData || Object.keys(commandData).length === 0) {
      return;
    }

    const deviceId = commandData.deviceId;
    if (!deviceId) {
      return;
    }

    const multi = redis.multi();
    multi.del(`${COMMAND_PREFIX}${commandId}`);
    multi.zRem(`${PENDING_QUEUE_PREFIX}${deviceId}`, commandId);
    multi.hDel(`${CLAIMED_PREFIX}${deviceId}`, commandId);
    multi.sRem(`${DEVICE_COMMANDS_PREFIX}${deviceId}`, commandId);

    await multi.exec();
  },
};

// Background cleanup process
let cleanupInterval: NodeJS.Timeout | null = null;

export function startVisibilityCheck(): void {
  cleanupInterval ??= setInterval(() => {
    commandQueueService.cleanupExpiredClaims().catch((error: unknown) => {
      console.error('Error in visibility check:', error);
    });
  }, VISIBILITY_CHECK_INTERVAL);
}

export function stopVisibilityCheck(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
