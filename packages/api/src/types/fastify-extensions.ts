import type { AuthenticatedUser } from './user-management';
import type { UserRole } from '../middleware/web-portal-auth.middleware';

declare module 'fastify' {
  interface FastifyRequest {
    // From web-portal-auth.middleware
    userId?: string;
    customerId?: string;
    userRole?: UserRole;
    customerEmail?: string;

    // Computed user object for convenience
    user?: AuthenticatedUser;

    // From device-auth.middleware
    deviceId?: string;
    sessionToken?: string;

    // From correlation-id
    correlationId: string;
  }
}
