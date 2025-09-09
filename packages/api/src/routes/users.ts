import { randomBytes } from 'crypto';

import { z } from 'zod';

import { webPortalAuthMiddleware } from '../middleware/web-portal-auth.middleware';
import { supabase } from '../services/supabase';

import { getConnectionManager } from './websocket';

import type {
  UserManagementRecord,
  UserStatus,
} from '../types/user-management';
import type { FastifyPluginAsync } from 'fastify';

const userRoleSchema = z.enum(['owner', 'admin', 'viewer']);
const userStatusSchema = z.enum(['active', 'invited', 'suspended']);

const inviteUserSchema = z.object({
  email: z.string().email(),
  role: userRoleSchema,
  full_name: z.string().optional(),
});

const updateRoleSchema = z.object({
  role: userRoleSchema,
});

const bulkActionSchema = z.object({
  action: z.enum(['suspend', 'delete']),
  userIds: z.array(z.string()),
});

const queryParamsSchema = z.object({
  page: z.string().regex(/^\d+$/).optional().default('1'),
  limit: z.string().regex(/^\d+$/).optional().default('10'),
  search: z.string().optional(),
  role: userRoleSchema.optional(),
  status: userStatusSchema.optional(),
});

export const usersRoutes: FastifyPluginAsync = fastify => {
  // Get users list
  fastify.get(
    '/users',
    {
      preHandler: [webPortalAuthMiddleware],
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

        // Build query using the user_management view
        let query = supabase
          .from('user_management')
          .select('*', { count: 'exact' })
          .eq('customer_id', user.customerId)
          .range(offset, offset + limit - 1)
          .order('created_at', { ascending: false });

        // Apply filters
        if (params.search) {
          query = query.or(
            `email.ilike.%${params.search}%,full_name.ilike.%${params.search}%,auth_email.ilike.%${params.search}%`
          );
        }

        if (params.role) {
          query = query.eq('role', params.role);
        }

        if (params.status) {
          query = query.eq('status', params.status);
        }

        const { data: users, error, count } = await query;

        if (error) {
          fastify.log.error({ error }, 'Failed to fetch users');
          return reply.code(500).send({ error: 'Failed to fetch users' });
        }

        return reply.send({
          users: users ?? [],
          total: count ?? 0,
          page,
          limit,
        });
      } catch (error) {
        fastify.log.error({ error }, 'Error fetching users');
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Invite user
  fastify.post(
    '/users/invite',
    {
      preHandler: [webPortalAuthMiddleware],
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const body = inviteUserSchema.parse(request.body);

        // Check if user already exists in auth.users
        const { data: authUsers } = await supabase.auth.admin.listUsers();
        const existingAuthUser = authUsers?.users?.find(
          u => u.email === body.email
        );

        let userId: string;

        if (existingAuthUser) {
          // User exists in auth.users, check if they're already in this customer
          userId = existingAuthUser.id;

          const { data: existingRole } = (await supabase
            .from('user_roles')
            .select('*')
            .eq('user_id', userId)
            .eq('customer_id', user.customerId)
            .single()) as { data: unknown };

          if (existingRole) {
            return reply
              .code(400)
              .send({ error: 'User already exists in this organization' });
          }
        } else {
          // Create new auth user with invitation
          const inviteToken = randomBytes(32).toString('hex');
          const { data: newAuthUser, error: authError } =
            await supabase.auth.admin.createUser({
              email: body.email,
              email_confirm: false,
              user_metadata: {
                full_name: body.full_name,
                invitation_token: inviteToken,
              },
            });

          if (authError || !newAuthUser?.user) {
            fastify.log.error({ authError }, 'Failed to create auth user');
            return reply.code(500).send({ error: 'Failed to create user' });
          }

          userId = newAuthUser.user.id;
        }

        // Create user record if it doesn't exist
        const { error: userError } = await supabase.from('users').upsert(
          {
            id: userId,
            customer_id: user.customerId,
            full_name: body.full_name,
            email: body.email,
            status: 'invited' as UserStatus,
            invitation_token: randomBytes(32).toString('hex'),
            invitation_sent_at: new Date().toISOString(),
            invitation_expires_at: new Date(
              Date.now() + 7 * 24 * 60 * 60 * 1000
            ).toISOString(),
            invited_by: user.id,
          },
          {
            onConflict: 'id',
            ignoreDuplicates: false,
          }
        );

        if (userError) {
          fastify.log.error({ userError }, 'Failed to create user record');
          return reply.code(500).send({ error: 'Failed to create user' });
        }

        // Create role assignment
        const { error: roleError } = await supabase.from('user_roles').insert({
          user_id: userId,
          customer_id: user.customerId,
          role: body.role,
          created_by: user.id,
        });

        if (roleError) {
          fastify.log.error({ roleError }, 'Failed to assign role');
          return reply.code(500).send({ error: 'Failed to assign role' });
        }

        // Get the complete user record
        const { data: newUser } = (await supabase
          .from('user_management')
          .select('*')
          .eq('id', userId)
          .eq('customer_id', user.customerId)
          .single()) as { data: unknown };

        // TODO: Send invitation email

        // Broadcast to WebSocket clients
        const connectionManager = getConnectionManager();
        await connectionManager.broadcast({
          type: 'user_added',
          user: newUser as Record<string, unknown>,
        });

        return reply.send({ user: newUser });
      } catch (error) {
        fastify.log.error({ error }, 'Error inviting user');
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Update user role
  fastify.patch(
    '/users/:userId/role',
    {
      preHandler: [webPortalAuthMiddleware],
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || user.role !== 'owner') {
        return reply.code(403).send({ error: 'Only owners can change roles' });
      }

      try {
        const { userId } = request.params as { userId: string };
        const body = updateRoleSchema.parse(request.body);

        // Check if target user exists and get their current role
        const { data: targetUser } = (await supabase
          .from('user_roles')
          .select('*')
          .eq('user_id', userId)
          .eq('customer_id', user.customerId)
          .single()) as { data: { role: string } | null };

        if (!targetUser) {
          return reply.code(404).send({ error: 'User not found' });
        }

        if ((targetUser as { role: string }).role === 'owner') {
          return reply.code(400).send({ error: 'Cannot change owner role' });
        }

        // Update role
        const { error } = await supabase
          .from('user_roles')
          .update({
            role: body.role,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .eq('customer_id', user.customerId);

        if (error) {
          fastify.log.error({ error }, 'Failed to update user role');
          return reply.code(500).send({ error: 'Failed to update role' });
        }

        // Get updated user record
        const { data: updatedUser } = (await supabase
          .from('user_management')
          .select('*')
          .eq('id', userId)
          .eq('customer_id', user.customerId)
          .single()) as { data: unknown };

        // Broadcast to WebSocket clients
        const connectionManager = getConnectionManager();
        await connectionManager.broadcast({
          type: 'user_update',
          user: updatedUser as Record<string, unknown>,
        });

        return reply.send({ user: updatedUser });
      } catch (error) {
        fastify.log.error({ error }, 'Error updating user role');
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Delete user
  fastify.delete(
    '/users/:userId',
    {
      preHandler: [webPortalAuthMiddleware],
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const { userId } = request.params as { userId: string };

        // Prevent self-deletion
        if (userId === user.id) {
          return reply.code(400).send({ error: 'Cannot delete yourself' });
        }

        // Check target user role
        const { data: targetUser } = (await supabase
          .from('user_roles')
          .select('*')
          .eq('user_id', userId)
          .eq('customer_id', user.customerId)
          .single()) as { data: { role: string } | null };

        if (!targetUser) {
          return reply.code(404).send({ error: 'User not found' });
        }

        if ((targetUser as { role: string }).role === 'owner') {
          return reply.code(400).send({ error: 'Cannot delete owner' });
        }

        // Delete user role (this will cascade delete from users table if no other roles)
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', userId)
          .eq('customer_id', user.customerId);

        if (error) {
          fastify.log.error({ error }, 'Failed to delete user');
          return reply.code(500).send({ error: 'Failed to delete user' });
        }

        // Check if user has roles in other customers
        const { data: otherRoles } = await supabase
          .from('user_roles')
          .select('*')
          .eq('user_id', userId);

        // If no other roles, delete from users table
        if (!otherRoles || otherRoles.length === 0) {
          await supabase.from('users').delete().eq('id', userId);
        }

        // Broadcast to WebSocket clients
        const connectionManager = getConnectionManager();
        await connectionManager.broadcast({
          type: 'user_removed',
          userId,
        });

        return reply.send({ success: true });
      } catch (error) {
        fastify.log.error({ error }, 'Error deleting user');
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Bulk actions
  fastify.post(
    '/users/bulk',
    {
      preHandler: [webPortalAuthMiddleware],
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const body = bulkActionSchema.parse(request.body);

        // Get target users and filter out current user and owners
        const { data: targetUsers } = (await supabase
          .from('user_roles')
          .select('user_id, role')
          .in('user_id', body.userIds)
          .eq('customer_id', user.customerId)) as {
          data: { user_id: string; role: string }[] | null;
        };

        const validUserIds = (targetUsers ?? [])
          .filter(u => u.user_id !== user.id && u.role !== 'owner')
          .map(u => u.user_id);

        if (validUserIds.length === 0) {
          return reply.code(400).send({ error: 'No valid users to process' });
        }

        if (body.action === 'suspend') {
          const { error } = await supabase
            .from('users')
            .update({
              status: 'suspended' as UserStatus,
              updated_at: new Date().toISOString(),
            })
            .in('id', validUserIds)
            .eq('customer_id', user.customerId);

          if (error) {
            fastify.log.error({ error }, 'Failed to suspend users');
            return reply.code(500).send({ error: 'Failed to suspend users' });
          }
        } else if (body.action === 'delete') {
          // Delete user roles
          const { error } = await supabase
            .from('user_roles')
            .delete()
            .in('user_id', validUserIds)
            .eq('customer_id', user.customerId);

          if (error) {
            fastify.log.error({ error }, 'Failed to delete users');
            return reply.code(500).send({ error: 'Failed to delete users' });
          }

          // Clean up users without any roles
          for (const userId of validUserIds) {
            const { data: otherRoles } = await supabase
              .from('user_roles')
              .select('*')
              .eq('user_id', userId);

            if (!otherRoles || otherRoles.length === 0) {
              await supabase.from('users').delete().eq('id', userId);
            }
          }
        }

        return reply.send({
          success: true,
          processed: validUserIds.length,
        });
      } catch (error) {
        fastify.log.error({ error }, 'Error processing bulk action');
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Resend invitation
  fastify.post(
    '/users/:userId/resend-invitation',
    {
      preHandler: [webPortalAuthMiddleware],
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const { userId } = request.params as { userId: string };

        const { data: targetUser, error } = (await supabase
          .from('users')
          .update({
            invitation_sent_at: new Date().toISOString(),
            invitation_expires_at: new Date(
              Date.now() + 7 * 24 * 60 * 60 * 1000
            ).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId)
          .eq('customer_id', user.customerId)
          .eq('status', 'invited')
          .select()
          .single()) as { data: unknown; error: unknown };

        if (error || !targetUser) {
          return reply.code(404).send({ error: 'Invited user not found' });
        }

        // TODO: Resend invitation email

        return reply.send({ success: true });
      } catch (error) {
        fastify.log.error({ error }, 'Error resending invitation');
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Export users
  fastify.get(
    '/users/export',
    {
      preHandler: [webPortalAuthMiddleware],
    },
    async (request, reply) => {
      const { user } = request;
      if (!user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      try {
        const { data: users, error } = await supabase
          .from('user_management')
          .select('*')
          .eq('customer_id', user.customerId)
          .order('created_at', { ascending: false });

        if (error) {
          fastify.log.error({ error }, 'Failed to export users');
          return reply.code(500).send({ error: 'Failed to export users' });
        }

        // Convert to CSV
        const csv = [
          'Email,Full Name,Role,Status,Created At,Last Login',
          ...(users || []).map(
            (u: UserManagementRecord) =>
              `"${u.auth_email ?? u.email ?? ''}","${u.full_name ?? ''}","${u.role}","${u.status}","${u.created_at}","${u.last_login_at ?? ''}"`
          ),
        ].join('\n');

        return reply
          .header('Content-Type', 'text/csv')
          .header(
            'Content-Disposition',
            `attachment; filename="users-${new Date().toISOString().split('T')[0]}.csv"`
          )
          .send(csv);
      } catch (error) {
        fastify.log.error({ error }, 'Error exporting users');
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );
};
