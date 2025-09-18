import { z } from 'zod';

import { webPortalAuth } from '../middleware/web-portal-auth.middleware';
import { supabase } from '../services/supabase';

import { getConnectionManager } from './websocket';

import type { FastifyPluginAsync } from 'fastify';

// Define Customer type inline to avoid Database type resolution issues in CI
interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  created_at: string | null;
  updated_at: string | null;
  is_active: boolean | null;
  subscription_tier: string | null;
  metadata: Record<string, unknown> | null;
}

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

// eslint-disable-next-line @typescript-eslint/require-await
export const organizationRoutes: FastifyPluginAsync = async fastify => {
  // Get organization
  fastify.get(
    '/api/organization',
    { preHandler: [webPortalAuth] },
    async (request, reply) => {
      const { user } = request;
      if (!user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      try {
        if (!process.env.SUPABASE_SERVICE_KEY) {
          fastify.log.warn(
            {
              requestId: request.id,
              route: '/api/organization',
            },
            'SUPABASE_SERVICE_KEY missing – returning stub organization data'
          );

          const organization = {
            id: user.customerId,
            name: 'Development Organization',
            subdomain: 'dev',
            logo_url: '',
            primary_color: '#007bff',
            secondary_color: '#6c757d',
            contact_email: 'dev@example.com',
            contact_phone: '',
            address: '123 Dev Street',
            city: 'Localhost',
            state: 'CA',
            zip: '94016',
            country: 'US',
            timezone: 'America/Los_Angeles',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            settings: {
              allow_sso: false,
              enforce_2fa: false,
              session_timeout: 3600,
              ip_whitelist: [],
              notification_preferences: {
                email_alerts: true,
                sms_alerts: false,
                webhook_url: null,
              },
              api_settings: {
                rate_limit: 1000,
                allowed_origins: [],
              },
            },
            subscription: {
              plan: 'developer',
              seats: 10,
              used_seats: 2,
              billing_cycle: 'monthly',
              next_billing_date: null,
              amount: 0,
              currency: 'USD',
              status: 'active',
            },
          };

          return reply.send({ organization });
        }

        // Get organization data
        const result = await supabase
          .from('customers')
          .select('*')
          .eq('id', user.customerId)
          .single();

        const org = result.data as Customer | null;
        const error = result.error;

        if (error || !org) {
          fastify.log.error('Failed to fetch organization: %s', error);
          return reply.code(404).send({ error: 'Organization not found' });
        }

        // Note: organization_settings and subscriptions tables don't exist yet
        // Using customer data only for now
        const settings: {
          allow_sso?: boolean;
          enforce_2fa?: boolean;
          session_timeout?: number;
          ip_whitelist?: unknown[];
          email_alerts?: boolean;
          sms_alerts?: boolean;
          webhook_url?: string | null;
          rate_limit?: number;
          allowed_origins?: unknown[];
        } = {}; // Placeholder until organization_settings table is implemented
        const subscription: {
          plan: string;
          seats: number;
          used_seats: number;
          billing_cycle: string;
          next_billing_date: string | null;
          amount: number;
          currency: string;
          status: string;
        } | null = null; // Placeholder until subscriptions table is implemented

        // Extract metadata fields safely
        const metadata = (org.metadata as Record<string, unknown>) || {};

        // Mock organization data structure for UI compatibility
        const organization = {
          id: org.id,
          name:
            (metadata.business_name as string) ?? org.name ?? 'Organization',
          subdomain: (metadata.subdomain as string) ?? '',
          logo_url: (metadata.logo_url as string) ?? '',
          primary_color: (metadata.primary_color as string) ?? '#007bff',
          secondary_color: (metadata.secondary_color as string) ?? '#6c757d',
          contact_email: org.email ?? '',
          contact_phone: org.phone ?? '',
          address: org.address ?? '',
          city: (metadata.city as string) ?? '',
          state: (metadata.state as string) ?? '',
          zip: (metadata.zip as string) ?? '',
          country: (metadata.country as string) ?? 'US',
          timezone: (metadata.timezone as string) ?? 'America/New_York',
          created_at: org.created_at ?? '',
          updated_at: org.updated_at ?? '',
          settings: {
            allow_sso: settings.allow_sso ?? false,
            enforce_2fa: settings.enforce_2fa ?? false,
            session_timeout: settings.session_timeout ?? 3600,
            ip_whitelist: settings.ip_whitelist ?? [],
            notification_preferences: {
              email_alerts: settings.email_alerts ?? true,
              sms_alerts: settings.sms_alerts ?? false,
              webhook_url: settings.webhook_url ?? null,
            },
            api_settings: {
              rate_limit: settings.rate_limit ?? 1000,
              allowed_origins: settings.allowed_origins ?? [],
            },
          },
          subscription: subscription ?? {
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
        fastify.log.error('Error fetching organization: %s', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Update organization
  fastify.patch(
    '/api/organization',
    { preHandler: [webPortalAuth] },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const body = organizationSchema.parse(request.body);

        // Get current organization data to preserve metadata
        const currentResult = await supabase
          .from('customers')
          .select('metadata')
          .eq('id', user.customerId)
          .single();

        const currentOrg = currentResult.data as Pick<
          Customer,
          'metadata'
        > | null;
        const currentMetadata = currentOrg?.metadata ?? {};

        // Update organization
        const updateResult = await supabase
          .from('customers')
          .update({
            name: body.name,
            email: body.contact_email,
            phone: body.contact_phone,
            address: body.address,
            metadata: {
              ...currentMetadata,
              subdomain: body.subdomain,
              city: body.city,
              state: body.state,
              zip: body.zip,
              country: body.country,
              timezone: body.timezone,
              logo_url: body.logo_url,
              primary_color: body.primary_color,
              secondary_color: body.secondary_color,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.customerId)
          .select()
          .single();

        const updatedOrg = updateResult.data as Customer | null;
        const error = updateResult.error;

        if (error) {
          fastify.log.error('Failed to update organization: %s', error);
          return reply
            .code(500)
            .send({ error: 'Failed to update organization' });
        }

        // Broadcast to WebSocket clients (if update successful)
        if (updatedOrg) {
          const connectionManager = getConnectionManager();
          await connectionManager.broadcast({
            type: 'organization_update',
            organization: updatedOrg,
          });
        }

        return reply.send({ success: true });
      } catch (error) {
        fastify.log.error('Error updating organization: %s', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Update security settings
  fastify.patch(
    '/api/organization/settings',
    { preHandler: [webPortalAuth] },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const body = securitySettingsSchema.parse(request.body);

        // Upsert settings
        const result = await supabase.from('organization_settings').upsert({
          organization_id: user.customerId,
          allow_sso: body.allow_sso,
          enforce_2fa: body.enforce_2fa,
          session_timeout: body.session_timeout,
          updated_at: new Date().toISOString(),
        });

        if (result.error) {
          fastify.log.error(
            'Failed to update security settings: %s',
            result.error
          );
          return reply.code(500).send({ error: 'Failed to update settings' });
        }

        return reply.send({ success: true });
      } catch (error) {
        fastify.log.error('Error updating security settings: %s', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Update notification settings
  fastify.patch(
    '/api/organization/notifications',
    { preHandler: [webPortalAuth] },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const body = notificationSettingsSchema.parse(request.body);

        // Upsert settings
        const result = await supabase.from('organization_settings').upsert({
          organization_id: user.customerId,
          email_alerts: body.email_alerts,
          sms_alerts: body.sms_alerts,
          webhook_url: body.webhook_url ?? null,
          updated_at: new Date().toISOString(),
        });

        if (result.error) {
          fastify.log.error(
            'Failed to update notification settings: %s',
            result.error
          );
          return reply.code(500).send({ error: 'Failed to update settings' });
        }

        return reply.send({ success: true });
      } catch (error) {
        fastify.log.error('Error updating notification settings: %s', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Update API settings
  fastify.patch(
    '/api/organization/api-settings',
    { preHandler: [webPortalAuth] },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const body = apiSettingsSchema.parse(request.body);

        // Upsert settings
        const result = await supabase.from('organization_settings').upsert({
          organization_id: user.customerId,
          rate_limit: body.rate_limit,
          updated_at: new Date().toISOString(),
        });

        if (result.error) {
          fastify.log.error('Failed to update API settings: %s', result.error);
          return reply.code(500).send({ error: 'Failed to update settings' });
        }

        return reply.send({ success: true });
      } catch (error) {
        fastify.log.error('Error updating API settings: %s', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Add IP to whitelist
  fastify.post(
    '/api/organization/ip-whitelist',
    { preHandler: [webPortalAuth] },
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
          .eq('organization_id', user.customerId)
          .single();

        const currentWhitelist = (settings?.ip_whitelist as unknown[]) ?? [];

        interface WhitelistEntry {
          ip: string;
          description?: string;
          created_at?: string;
        }

        // Check if IP already exists
        if (
          (currentWhitelist as WhitelistEntry[]).some(
            (entry: WhitelistEntry) => entry.ip === body.ip_address
          )
        ) {
          return reply
            .code(400)
            .send({ error: 'IP address already whitelisted' });
        }

        // Add to whitelist
        const newWhitelist = [
          ...(currentWhitelist as WhitelistEntry[]),
          {
            ip: body.ip_address,
            description: body.description ?? '',
            created_at: new Date().toISOString(),
          },
        ];

        const result = await supabase.from('organization_settings').upsert({
          organization_id: user.customerId,
          ip_whitelist: newWhitelist,
        });

        if (result.error) {
          fastify.log.error('Failed to add IP to whitelist: %s', result.error);
          return reply.code(500).send({ error: 'Failed to add IP' });
        }

        return reply.send({ success: true });
      } catch (error) {
        fastify.log.error('Error adding IP to whitelist: %s', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Remove IP from whitelist
  fastify.delete(
    '/api/organization/ip-whitelist/:ip',
    { preHandler: [webPortalAuth] },
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
          .eq('organization_id', user.customerId)
          .single();

        interface WhitelistEntry {
          ip: string;
          description?: string;
          created_at?: string;
        }

        const currentWhitelist =
          (settings?.ip_whitelist as WhitelistEntry[]) ?? [];
        const newWhitelist = currentWhitelist.filter(
          (entry: WhitelistEntry) => entry.ip !== ip
        );

        const result = await supabase.from('organization_settings').upsert({
          organization_id: user.customerId,
          ip_whitelist: newWhitelist,
        });

        if (result.error) {
          fastify.log.error(
            'Failed to remove IP from whitelist: %s',
            result.error
          );
          return reply.code(500).send({ error: 'Failed to remove IP' });
        }

        return reply.send({ success: true });
      } catch (error) {
        fastify.log.error('Error removing IP from whitelist: %s', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Add allowed origin
  fastify.post(
    '/api/organization/allowed-origins',
    { preHandler: [webPortalAuth] },
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
          .eq('organization_id', user.customerId)
          .single();

        const currentOrigins = (settings?.allowed_origins as string[]) ?? [];

        // Check if origin already exists
        if (currentOrigins.includes(body.origin)) {
          return reply.code(400).send({ error: 'Origin already allowed' });
        }

        // Add origin
        const newOrigins = [...currentOrigins, body.origin];

        const result = await supabase.from('organization_settings').upsert({
          organization_id: user.customerId,
          allowed_origins: newOrigins,
        });

        if (result.error) {
          fastify.log.error('Failed to add allowed origin: %s', result.error);
          return reply.code(500).send({ error: 'Failed to add origin' });
        }

        return reply.send({ success: true });
      } catch (error) {
        fastify.log.error('Error adding allowed origin: %s', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Remove allowed origin
  fastify.delete(
    '/api/organization/allowed-origins/:origin',
    { preHandler: [webPortalAuth] },
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
          .eq('organization_id', user.customerId)
          .single();

        const currentOrigins = (settings?.allowed_origins as string[]) ?? [];
        const newOrigins = currentOrigins.filter((o: string) => o !== origin);

        const result = await supabase.from('organization_settings').upsert({
          organization_id: user.customerId,
          allowed_origins: newOrigins,
        });

        if (result.error) {
          fastify.log.error(
            'Failed to remove allowed origin: %s',
            result.error
          );
          return reply.code(500).send({ error: 'Failed to remove origin' });
        }

        return reply.send({ success: true });
      } catch (error) {
        fastify.log.error('Error removing allowed origin: %s', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Test webhook
  fastify.post(
    '/api/organization/test-webhook',
    { preHandler: [webPortalAuth] },
    async (request, reply) => {
      const { user } = request;
      if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
        return reply.code(403).send({ error: 'Insufficient permissions' });
      }

      try {
        const { url: _url } = request.body as { url: string };

        // TODO: Implement actual webhook testing
        // For now, return success
        await new Promise(resolve => setTimeout(resolve, 1000));

        return reply.send({ success: true });
      } catch (error) {
        fastify.log.error('Error testing webhook: %s', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Get billing portal URL
  fastify.post(
    '/api/organization/billing-portal',
    { preHandler: [webPortalAuth] },
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
        fastify.log.error('Error getting billing portal URL: %s', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Delete organization
  fastify.delete(
    '/api/organization',
    { preHandler: [webPortalAuth] },
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
        fastify.log.error('Error deleting organization: %s', error);
        return reply.code(500).send({ error: 'Internal server error' });
      }
    }
  );
};
