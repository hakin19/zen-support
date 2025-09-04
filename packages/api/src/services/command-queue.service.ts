import { randomUUID } from 'crypto';

import { getRedisClient } from '@aizen/shared/utils/redis-client';

type CommandParameters = Record<string, unknown>;
type CommandResult = Record<string, unknown>;

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
// commands:claimed:{deviceId} - hash of claimed commands (field = commandId, value = claimToken|visibleUntil)
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
    priority: number = 1
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
    await redis.hSet(
      `${COMMAND_PREFIX}${commandId}`,
      Object.entries(command).reduce(
        (acc, [key, value]) => {
          acc[key] =
            typeof value === 'object' ? JSON.stringify(value) : String(value);
          return acc;
        },
        {} as Record<string, string>
      )
    );

    // Add to pending queue with composite score (priority:timestamp)
    // Higher priority = lower score (processed first)
    // Within same priority, older commands processed first (FIFO)
    const timestamp = Date.now();
    const score = priority * 1e13 + timestamp; // Ensures priority separation
    await redis.zAdd(`${PENDING_QUEUE_PREFIX}${deviceId}`, {
      score,
      value: commandId,
    });

    // Track command for device
    await redis.sAdd(`${DEVICE_COMMANDS_PREFIX}${deviceId}`, commandId);

    return command;
  },

  /**
   * Claim commands for processing with visibility timeout
   */
  async claimCommands(
    deviceId: string,
    limit: number = 1,
    visibilityTimeout: number = 300000 // 5 minutes default (matching API schema)
  ): Promise<ClaimedCommand[]> {
    const redis = getRedisClient().getClient();
    const claimedCommands: ClaimedCommand[] = [];
    const now = Date.now();

    // Use ZPOPMIN for atomic claim to prevent race conditions
    // This atomically removes and returns the commands with lowest scores
    const poppedCommands = await redis.zPopMinCount(
      `${PENDING_QUEUE_PREFIX}${deviceId}`,
      limit
    );

    if (!poppedCommands || poppedCommands.length === 0) {
      return [];
    }

    // Process each successfully popped command
    for (const { value: commandId } of poppedCommands) {
      const claimToken = randomUUID();
      const visibleUntil = new Date(now + visibilityTimeout).toISOString();

      // Use transaction to update command status and add to claimed set
      const multi = redis.multi();

      // Update command status
      multi.hSet(`${COMMAND_PREFIX}${commandId}`, {
        status: 'claimed',
        claimedAt: new Date(now).toISOString(),
        claimedBy: deviceId,
        claimToken,
        visibleUntil,
      });

      // Add to claimed set
      multi.hSet(
        `${CLAIMED_PREFIX}${deviceId}`,
        commandId,
        `${claimToken}|${visibleUntil}`
      );

      const results = await multi.exec();

      // Check if transaction succeeded for this command
      // In Redis v4, exec returns null only if WATCH failed (we don't use WATCH here)
      // For normal operations, check actual command results
      if (!results || results.length !== 2) {
        // Failed to update command status - return it to pending queue
        console.error(
          `Failed to claim command ${commandId}, returning to queue`
        );
        const timestamp = Date.now();
        const commandData = await redis.hGet(
          `${COMMAND_PREFIX}${commandId}`,
          'priority'
        );
        const priority = parseInt(commandData ?? '1', 10);
        const score = priority * 1e13 + timestamp;
        await redis.zAdd(`${PENDING_QUEUE_PREFIX}${deviceId}`, {
          score,
          value: commandId,
        });
        continue;
      }

      // Fetch command details for response
      const commandData = await redis.hGetAll(`${COMMAND_PREFIX}${commandId}`);
      if (commandData) {
        claimedCommands.push({
          id: commandId,
          type: commandData.type ?? '',
          parameters: JSON.parse(
            commandData.parameters ?? '{}'
          ) as CommandParameters,
          priority: parseInt(commandData.priority ?? '1', 10),
          claimToken,
          visibleUntil,
        });
      }
    }

    return claimedCommands;
  },

  /**
   * Extend visibility timeout for a claimed command
   */
  async extendVisibility(
    commandId: string,
    claimToken: string,
    deviceId: string,
    visibilityTimeout: number = 300000
  ): Promise<ExtendResult> {
    const redis = getRedisClient().getClient();

    // Check if command exists and is claimed by this device
    const claimInfo = await redis.hGet(
      `${CLAIMED_PREFIX}${deviceId}`,
      commandId
    );
    if (!claimInfo) {
      return { success: false, error: 'NOT_FOUND' };
    }

    const [storedToken, currentVisibleUntil] = claimInfo.split('|');
    if (storedToken !== claimToken) {
      return { success: false, error: 'INVALID_CLAIM' };
    }

    // Check if the claim has already expired
    if (currentVisibleUntil && new Date(currentVisibleUntil) < new Date()) {
      return { success: false, error: 'INVALID_CLAIM' };
    }

    // Extend visibility
    const newVisibleUntil = new Date(
      Date.now() + visibilityTimeout
    ).toISOString();

    const multi = redis.multi();

    multi.hSet(
      `${CLAIMED_PREFIX}${deviceId}`,
      commandId,
      `${claimToken}|${newVisibleUntil}`
    );

    multi.hSet(`${COMMAND_PREFIX}${commandId}`, {
      visibleUntil: newVisibleUntil,
    });

    const results = await multi.exec();

    // Check if transaction succeeded
    // Both hSet operations should return a number (0 or 1)
    if (!results || results.length !== 2) {
      // Redis transaction failure is a server error, not an invalid claim
      throw new Error('Redis transaction failed during command extension');
    }

    return { success: true, visibleUntil: newVisibleUntil };
  },

  /**
   * Submit result for a claimed command
   */
  async submitResult(
    commandId: string,
    claimToken: string,
    deviceId: string,
    result: CommandResult
  ): Promise<SubmitResult> {
    const redis = getRedisClient().getClient();

    // Check if command exists and is claimed by this device
    const claimInfo = await redis.hGet(
      `${CLAIMED_PREFIX}${deviceId}`,
      commandId
    );
    if (!claimInfo) {
      // Check if command exists at all
      const commandExists = await redis.exists(`${COMMAND_PREFIX}${commandId}`);
      if (!commandExists) {
        return { success: false, error: 'NOT_FOUND' };
      }

      // Command exists but not claimed by this device or already completed
      const status = await redis.hGet(
        `${COMMAND_PREFIX}${commandId}`,
        'status'
      );
      if (status === 'completed') {
        return { success: false, error: 'ALREADY_COMPLETED' };
      }
      return { success: false, error: 'INVALID_CLAIM' };
    }

    const [storedToken] = claimInfo.split('|');
    if (storedToken !== claimToken) {
      return { success: false, error: 'INVALID_CLAIM' };
    }

    // Submit result and mark as completed
    const multi = redis.multi();

    multi.hSet(`${COMMAND_PREFIX}${commandId}`, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      result: JSON.stringify(result),
    });

    // Remove from claimed
    multi.hDel(`${CLAIMED_PREFIX}${deviceId}`, commandId);

    const results = await multi.exec();

    // Check if transaction succeeded
    // hSet returns a number, hDel returns the number of fields removed (0 or 1)
    if (!results || results.length !== 2) {
      // Redis transaction failure is a server error, not an invalid claim
      throw new Error('Redis transaction failed during result submission');
    }

    return { success: true };
  },

  /**
   * Check and reclaim expired commands (called periodically)
   * Uses SCAN instead of KEYS to avoid blocking Redis
   */
  async reclaimExpiredCommands(): Promise<void> {
    const redis = getRedisClient().getClient();
    const now = new Date();

    // Use SCAN iterator to avoid blocking Redis and process inline to reduce memory usage
    const iterator = redis.scanIterator({
      MATCH: `${CLAIMED_PREFIX}*`,
      COUNT: 100,
    });

    for await (const key of iterator) {
      // Process each key immediately to reduce memory usage
      const deviceId = String(key).replace(CLAIMED_PREFIX, '');
      const claimedCommands = await redis.hGetAll(String(key));

      for (const [commandId, claimInfo] of Object.entries(claimedCommands)) {
        const [, visibleUntil] = claimInfo.split('|');

        if (visibleUntil && new Date(visibleUntil) < now) {
          // Command visibility has expired, return to pending queue
          const multi = redis.multi();

          // Get command priority for re-queuing
          const commandData = await redis.hGet(
            `${COMMAND_PREFIX}${commandId}`,
            'priority'
          );
          const priority = parseInt(commandData ?? '1', 10);

          // Update command status
          multi.hSet(`${COMMAND_PREFIX}${commandId}`, {
            status: 'pending',
            claimedAt: '',
            claimedBy: '',
            claimToken: '',
            visibleUntil: '',
          });

          // Move back to pending queue
          const timestamp = Date.now();
          const score = priority * 1e13 + timestamp;
          multi.zAdd(`${PENDING_QUEUE_PREFIX}${deviceId}`, {
            score,
            value: commandId,
          });

          // Remove from claimed
          multi.hDel(`${CLAIMED_PREFIX}${deviceId}`, commandId);

          const results = await multi.exec();

          // Log if transaction failed but continue processing
          // We expect 3 results: hSet (number), zAdd (0 or 1), hDel (0 or 1)
          if (!results || results.length !== 3) {
            console.error(`Failed to reclaim expired command ${commandId}`);
          }
        }
      }
    }
  },

  /**
   * Get command by ID
   */
  async getCommand(commandId: string): Promise<Command | null> {
    const redis = getRedisClient().getClient();
    const commandData = await redis.hGetAll(`${COMMAND_PREFIX}${commandId}`);

    if (!commandData || Object.keys(commandData).length === 0) {
      return null;
    }

    return {
      id: commandId,
      deviceId: commandData.deviceId ?? '',
      customerId: commandData.customerId ?? '',
      type: commandData.type ?? '',
      parameters: JSON.parse(
        commandData.parameters ?? '{}'
      ) as CommandParameters,
      priority: parseInt(commandData.priority ?? '1', 10),
      status: (commandData.status ?? 'pending') as Command['status'],
      createdAt: commandData.createdAt ?? '',
      claimedAt: commandData.claimedAt ?? undefined,
      claimedBy: commandData.claimedBy ?? undefined,
      claimToken: commandData.claimToken ?? undefined,
      visibleUntil: commandData.visibleUntil ?? undefined,
      completedAt: commandData.completedAt ?? undefined,
      result: commandData.result
        ? (JSON.parse(commandData.result) as CommandResult)
        : undefined,
    };
  },

  /**
   * Get all commands for a device
   */
  async getDeviceCommands(deviceId: string): Promise<Command[]> {
    const redis = getRedisClient().getClient();
    const commandIds = await redis.sMembers(
      `${DEVICE_COMMANDS_PREFIX}${deviceId}`
    );

    const commands: Command[] = [];
    for (const commandId of commandIds) {
      const command = await this.getCommand(commandId);
      if (command) {
        commands.push(command);
      }
    }

    return commands;
  },

  /**
   * Delete a command
   */
  async deleteCommand(commandId: string): Promise<boolean> {
    const redis = getRedisClient().getClient();

    const commandData = await redis.hGet(
      `${COMMAND_PREFIX}${commandId}`,
      'deviceId'
    );
    if (!commandData) {
      return false;
    }

    const deviceId = commandData;
    const multi = redis.multi();

    // Remove from all relevant structures
    multi.del(`${COMMAND_PREFIX}${commandId}`);
    multi.zRem(`${PENDING_QUEUE_PREFIX}${deviceId}`, commandId);
    multi.hDel(`${CLAIMED_PREFIX}${deviceId}`, commandId);
    multi.sRem(`${DEVICE_COMMANDS_PREFIX}${deviceId}`, commandId);

    const results = await multi.exec();

    // Check if transaction succeeded
    // We expect 4 results from: del, zRem, hDel, sRem
    if (!results || results.length !== 4) {
      throw new Error('Failed to delete command');
    }

    return true;
  },
};

// Start periodic visibility check
let visibilityCheckInterval: NodeJS.Timeout | null = null;

export function startVisibilityCheck(): void {
  visibilityCheckInterval ??= setInterval(() => {
    void commandQueueService.reclaimExpiredCommands().catch(error => {
      console.error('Failed to reclaim expired commands:', error);
    });
  }, VISIBILITY_CHECK_INTERVAL);
}

export function stopVisibilityCheck(): void {
  if (visibilityCheckInterval) {
    clearInterval(visibilityCheckInterval);
    visibilityCheckInterval = null;
  }
}
