import { z } from 'zod';

import { webPortalAuthMiddleware } from '../middleware/web-portal-auth.middleware';
import { supabase } from '../services/supabase';

import { getConnectionManager } from './websocket';

import type { FastifyPluginAsync } from 'fastify';

const organizationSchema = z.object({
  name: z.string().min(1),
  subdomain: z.string().optional(),
  contact_email: z.string().email().optional(),
  contact_phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
  timezone: z.string().optional(),
  logo_url: z.string().url().optional(),
  primary_color: z.string().optional(),
  secondary_color: z.string().optional(),
});

const securitySettingsSchema = z.object({
  allow_sso: z.boolean().optional(),
  enforce_2fa: z.boolean().optional(),
  session_timeout: z.number().min(300).max(86400).optional(), // 5 min to 24 hours
});

const notificationSettingsSchema = z.object({
  email_alerts: z.boolean().optional(),
  sms_alerts: z.boolean().optional(),
  webhook_url: z.string().url().optional().or(z.literal('')),
});

const apiSettingsSchema = z.object({
  rate_limit: z.number().min(100).max(100000).optional(),
});

const ipWhitelistSchema = z.object({
  ip_address: z.string(),
  description: z.string().optional(),
});

const allowedOriginSchema = z.object({
  origin: z.string().url(),
});

export const organizationRoutes: FastifyPluginAsync = async fastify => {
  // Get organization
  fastify.get(
    '/api/organization',
    { preHandler: webPortalAuthMiddleware },
    async (request, reply) => {
      const { user } = request;
      if (!user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      try {
        // Get organization data
        const { data: org, error } = await supabase
          .from('customers')
          .select('*')
          .eq('id', user.organization_id)
          .single();

        if (error || !org) {
          fastify.log.error('Failed to fetch organization:', error);
          return reply.code(404).send({ error: 'Organization not found' });
        }

        // Get organization settings
        const { data: settings } = await supabase
          .from('organization_settings')
          .select('*')
          .eq('organization_id', user.organization_id)
          .single();

        // Get subscription info
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('organization_id', user.organization_id)
          .single();

        // Mock organization data structure for UI compatibility
        const organization = {
          id: org.id,
          name: org.business_name || 'Organization',
          subdomain: org.subdomain || '',
          logo_url: org.logo_url || '',
          primary_color: org.primary_color || '#007bff',
          secondary_color: org.secondary_color || '#6c757d',
          contact_email: org.email || '',
          contact_phone: org.phone || '',
          address: org.address || '',
          city: org.city || '',
          state: org.state || '',
          zip: org.zip || '',
          country: org.country || 'US',
          timezone: org.timezone || 'America/New_York',
          created_at: org.created_at,
          updated_at: org.updated_at,
          settings: {
            allow_sso: settings?.allow_sso || false,
            enforce_2fa: settings?.enforce_2fa || false,
            session_timeout: settings?.session_timeout || 3600,
            ip_whitelist: settings?.ip_whitelist || [],
            notification_preferences: {
              email_alerts: settings?.email_alerts ?? true,
              sms_alerts: settings?.sms_alerts ?? false,
              webhook_url: settings?.webhook_url || null,
            },
            api_settings: {
              rate_limit: settings?.rate_limit || 1000,
              allowed_origins: settings?.allowed_origins || [],
            },
          },
          subscription: subscription || {
            plan: 'free',
            seats: 5,
            used_seats: 1,
            billing_cycle: 'monthly',
            next_billing_date: null,
            amount: 0,
            currency: 'USD',
            status: 'active',
          },
        };

        return reply.send({ organization });
      } catch (error) {
        fastify.log.error('Error fetching organization:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Update organization
  fastify.patch(
    '/api/organization',
    { preHandler: webPortalAuthMiddleware },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const body = organizationSchema.parse(request.body);

        // Update organization
        const { data: updatedOrg, error } = await supabase
          .from('customers')
          .update({
            business_name: body.name,
            subdomain: body.subdomain,
            email: body.contact_email,
            phone: body.contact_phone,
            address: body.address,
            city: body.city,
            state: body.state,
            zip: body.zip,
            country: body.country,
            timezone: body.timezone,
            logo_url: body.logo_url,
            primary_color: body.primary_color,
            secondary_color: body.secondary_color,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.organization_id)
          .select()
          .single();

        if (error) {
          fastify.log.error('Failed to update organization:', error);
          return reply
            .code(500)
            .send({ error: 'Failed to update organization' });
        }

        // Broadcast to WebSocket clients
        const connectionManager = getConnectionManager();
        await connectionManager.broadcast({
          type: 'organization_update',
          organization: updatedOrg,
        });

        return reply.send({ success: true });
      } catch (error) {
        fastify.log.error('Error updating organization:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Update security settings
  fastify.patch(
    '/api/organization/settings',
    { preHandler: webPortalAuthMiddleware },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const body = securitySettingsSchema.parse(request.body);

        // Upsert settings
        const { error } = await supabase.from('organization_settings').upsert({
          organization_id: user.organization_id,
          ...body,
          updated_at: new Date().toISOString(),
        });

        if (error) {
          fastify.log.error('Failed to update security settings:', error);
          return reply.code(500).send({ error: 'Failed to update settings' });
        }

        return reply.send({ success: true });
      } catch (error) {
        fastify.log.error('Error updating security settings:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Update notification settings
  fastify.patch(
    '/api/organization/notifications',
    { preHandler: webPortalAuthMiddleware },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const body = notificationSettingsSchema.parse(request.body);

        // Upsert settings
        const { error } = await supabase.from('organization_settings').upsert({
          organization_id: user.organization_id,
          email_alerts: body.email_alerts,
          sms_alerts: body.sms_alerts,
          webhook_url: body.webhook_url || null,
          updated_at: new Date().toISOString(),
        });

        if (error) {
          fastify.log.error('Failed to update notification settings:', error);
          return reply.code(500).send({ error: 'Failed to update settings' });
        }

        return reply.send({ success: true });
      } catch (error) {
        fastify.log.error('Error updating notification settings:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Update API settings
  fastify.patch(
    '/api/organization/api-settings',
    { preHandler: webPortalAuthMiddleware },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const body = apiSettingsSchema.parse(request.body);

        // Upsert settings
        const { error } = await supabase.from('organization_settings').upsert({
          organization_id: user.organization_id,
          rate_limit: body.rate_limit,
          updated_at: new Date().toISOString(),
        });

        if (error) {
          fastify.log.error('Failed to update API settings:', error);
          return reply.code(500).send({ error: 'Failed to update settings' });
        }

        return reply.send({ success: true });
      } catch (error) {
        fastify.log.error('Error updating API settings:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Add IP to whitelist
  fastify.post(
    '/api/organization/ip-whitelist',
    { preHandler: webPortalAuthMiddleware },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const body = ipWhitelistSchema.parse(request.body);

        // Get current whitelist
        const { data: settings } = await supabase
          .from('organization_settings')
          .select('ip_whitelist')
          .eq('organization_id', user.organization_id)
          .single();

        const currentWhitelist = settings?.ip_whitelist || [];

        // Check if IP already exists
        if (
          currentWhitelist.some((entry: any) => entry.ip === body.ip_address)
        ) {
          return reply
            .code(400)
            .send({ error: 'IP address already whitelisted' });
        }

        // Add to whitelist
        const newWhitelist = [
          ...currentWhitelist,
          {
            ip: body.ip_address,
            description: body.description || '',
            created_at: new Date().toISOString(),
          },
        ];

        const { error } = await supabase.from('organization_settings').upsert({
          organization_id: user.organization_id,
          ip_whitelist: newWhitelist,
        });

        if (error) {
          fastify.log.error('Failed to add IP to whitelist:', error);
          return reply.code(500).send({ error: 'Failed to add IP' });
        }

        return reply.send({ success: true });
      } catch (error) {
        fastify.log.error('Error adding IP to whitelist:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Remove IP from whitelist
  fastify.delete(
    '/api/organization/ip-whitelist/:ip',
    { preHandler: webPortalAuthMiddleware },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const { ip } = request.params as { ip: string };

        // Get current whitelist
        const { data: settings } = await supabase
          .from('organization_settings')
          .select('ip_whitelist')
          .eq('organization_id', user.organization_id)
          .single();

        const currentWhitelist = settings?.ip_whitelist || [];
        const newWhitelist = currentWhitelist.filter(
          (entry: any) => entry.ip !== ip
        );

        const { error } = await supabase.from('organization_settings').upsert({
          organization_id: user.organization_id,
          ip_whitelist: newWhitelist,
        });

        if (error) {
          fastify.log.error('Failed to remove IP from whitelist:', error);
          return reply.code(500).send({ error: 'Failed to remove IP' });
        }

        return reply.send({ success: true });
      } catch (error) {
        fastify.log.error('Error removing IP from whitelist:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Add allowed origin
  fastify.post(
    '/api/organization/allowed-origins',
    { preHandler: webPortalAuthMiddleware },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const body = allowedOriginSchema.parse(request.body);

        // Get current origins
        const { data: settings } = await supabase
          .from('organization_settings')
          .select('allowed_origins')
          .eq('organization_id', user.organization_id)
          .single();

        const currentOrigins = settings?.allowed_origins || [];

        // Check if origin already exists
        if (currentOrigins.includes(body.origin)) {
          return reply.code(400).send({ error: 'Origin already allowed' });
        }

        // Add origin
        const newOrigins = [...currentOrigins, body.origin];

        const { error } = await supabase.from('organization_settings').upsert({
          organization_id: user.organization_id,
          allowed_origins: newOrigins,
        });

        if (error) {
          fastify.log.error('Failed to add allowed origin:', error);
          return reply.code(500).send({ error: 'Failed to add origin' });
        }

        return reply.send({ success: true });
      } catch (error) {
        fastify.log.error('Error adding allowed origin:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Remove allowed origin
  fastify.delete(
    '/api/organization/allowed-origins/:origin',
    { preHandler: webPortalAuthMiddleware },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const { origin } = request.params as { origin: string };

        // Get current origins
        const { data: settings } = await supabase
          .from('organization_settings')
          .select('allowed_origins')
          .eq('organization_id', user.organization_id)
          .single();

        const currentOrigins = settings?.allowed_origins || [];
        const newOrigins = currentOrigins.filter((o: string) => o !== origin);

        const { error } = await supabase.from('organization_settings').upsert({
          organization_id: user.organization_id,
          allowed_origins: newOrigins,
        });

        if (error) {
          fastify.log.error('Failed to remove allowed origin:', error);
          return reply.code(500).send({ error: 'Failed to remove origin' });
        }

        return reply.send({ success: true });
      } catch (error) {
        fastify.log.error('Error removing allowed origin:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Test webhook
  fastify.post(
    '/api/organization/test-webhook',
    { preHandler: webPortalAuthMiddleware },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const { url } = request.body as { url: string };

        // TODO: Implement actual webhook testing
        // For now, return success
        await new Promise(resolve => setTimeout(resolve, 1000));

        return reply.send({ success: true });
      } catch (error) {
        fastify.log.error('Error testing webhook:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Get billing portal URL
  fastify.post(
    '/api/organization/billing-portal',
    { preHandler: webPortalAuthMiddleware },
    async (request, reply) => {
      const { user } = request;
      if (!user || user.role !== 'owner') {
        return reply
          .code(403)
          .send({ error: 'Only owners can access billing' });
      }

      try {
        // TODO: Integrate with Stripe or billing provider
        // For now, return mock URL
        return reply.send({
          url: 'https://billing.example.com/portal',
        });
      } catch (error) {
        fastify.log.error('Error getting billing portal URL:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Delete organization
  fastify.delete(
    '/api/organization',
    { preHandler: webPortalAuthMiddleware },
    async (request, reply) => {
      const { user } = request;
      if (!user || user.role !== 'owner') {
        return reply
          .code(403)
          .send({ error: 'Only owners can delete organization' });
      }

      try {
        // TODO: Implement full organization deletion
        // This would need to delete all related data

        return reply.send({ success: true });
      } catch (error) {
        fastify.log.error('Error deleting organization:', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );
};
