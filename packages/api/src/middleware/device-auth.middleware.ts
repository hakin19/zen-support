import { sessionService } from '../services/session.service';

import type { FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    deviceId?: string;
    customerId?: string;
    sessionToken?: string;
  }
}

/**
 * Device authentication middleware
 * Validates device session tokens from X-Device-Token header or Authorization Bearer token
 * Adds deviceId and customerId to the request object for downstream use
 */
export async function deviceAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Extract token from headers
    // Priority: X-Device-Session > X-Device-Token > Authorization Bearer
    let token: string | undefined;

    const deviceSession = request.headers['x-device-session'];
    if (deviceSession && typeof deviceSession === 'string') {
      token = deviceSession;
    } else {
      const deviceToken = request.headers['x-device-token'];
      if (deviceToken && typeof deviceToken === 'string') {
        token = deviceToken;
      } else {
        const authHeader = request.headers.authorization;
        if (authHeader && typeof authHeader === 'string') {
          const parts = authHeader.split(' ');
          if (parts.length === 2 && parts[0] === 'Bearer') {
            token = parts[1];
          }
        }
      }
    }

    if (!token) {
      await reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Device authentication required',
          requestId: request.id,
        },
      });
      return;
    }

    // Validate session token
    const sessionData = await sessionService.validateSession(token);

    if (!sessionData.valid) {
      await reply.status(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired device token',
          requestId: request.id,
        },
      });
      return;
    }

    // Attach device info to request for downstream use
    request.deviceId = sessionData.deviceId;
    request.customerId = sessionData.customerId;
    request.sessionToken = token;

    // Refresh session TTL in background (non-blocking)
    if (typeof (sessionService as unknown as { refreshSession?: unknown }).refreshSession === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      (sessionService as any).refreshSession(token).catch((error: unknown) => {
        request.log.warn(
          { error: String(error), token: `${token.substring(0, 8)}...` },
          'Failed to refresh session TTL'
        );
      });
    }
  } catch (error) {
    request.log.error(error, 'Device authentication middleware error');

    await reply.status(503).send({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Authentication service temporarily unavailable',
        requestId: request.id,
      },
    });
  }
}

/**
 * Optional device authentication middleware
 * Similar to deviceAuthMiddleware but doesn't fail on missing/invalid auth
 * Sets request.deviceId and request.customerId if valid session exists
 */
export async function optionalDeviceAuthMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  try {
    // Extract token from headers
    let token: string | undefined;

    const deviceToken = request.headers['x-device-token'];
    if (deviceToken && typeof deviceToken === 'string') {
      token = deviceToken;
    } else {
      const authHeader = request.headers.authorization;
      if (authHeader && typeof authHeader === 'string') {
        const parts = authHeader.split(' ');
        if (parts.length === 2 && parts[0] === 'Bearer') {
          token = parts[1];
        }
      }
    }

    if (!token) {
      return; // No auth provided, continue without authentication
    }

    // Validate session token
    const sessionData = await sessionService.validateSession(token);

    if (sessionData.valid) {
      // Attach device info to request if valid
      request.deviceId = sessionData.deviceId;
      request.customerId = sessionData.customerId;
      request.sessionToken = token;

      // Refresh session TTL in background
      sessionService.refreshSession(token).catch(error => {
        request.log.warn(
          { error: String(error), token: `${token.substring(0, 8)}...` },
          'Failed to refresh session TTL'
        );
      });
    }
  } catch (error) {
    // Log error but don't fail the request
    request.log.warn(error, 'Optional device authentication failed');
  }
}
