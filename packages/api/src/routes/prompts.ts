import { webPortalAuthMiddleware } from '../middleware/web-portal-auth.middleware';

import type { FastifyInstance } from 'fastify';

export function registerPromptsRoutes(app: FastifyInstance): void {
  // GET /api/prompts - Get all prompt templates (owner only)
  app.get(
    '/api/prompts',
    {
      preHandler: [webPortalAuthMiddleware],
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || user.role !== 'owner') {
        return reply
          .code(403)
          .send({ error: 'Access denied. Owner role required.' });
      }
      // Stub implementation - returns mock data
      return {
        prompts: [
          {
            id: 'prompt-001',
            name: 'Network Diagnostics',
            category: 'diagnostics',
            template:
              'Analyze the following network issue: {{issue_description}}',
            variables: ['issue_description'],
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            created_by: 'user-001',
            version: 1,
            tags: ['network', 'diagnostics'],
            description: 'Template for network diagnostic analysis',
          },
        ],
      };
    }
  );

  // POST /api/prompts - Create a new prompt template (owner only)
  app.post(
    '/api/prompts',
    {
      preHandler: [webPortalAuthMiddleware],
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || user.role !== 'owner') {
        return reply
          .code(403)
          .send({ error: 'Access denied. Owner role required.' });
      }
      const body = request.body as any;
      return {
        prompt: {
          id: `prompt-${Date.now()}`,
          ...body,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          created_by: user.id,
          version: 1,
        },
      };
    }
  );

  // PATCH /api/prompts/:id - Update a prompt template (owner only)
  app.patch(
    '/api/prompts/:id',
    {
      preHandler: [webPortalAuthMiddleware],
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || user.role !== 'owner') {
        return reply
          .code(403)
          .send({ error: 'Access denied. Owner role required.' });
      }
      const { id } = request.params as { id: string };
      const body = request.body as any;
      return {
        prompt: {
          id,
          ...body,
          updated_at: new Date().toISOString(),
          version: 2,
        },
      };
    }
  );

  // DELETE /api/prompts/:id - Delete a prompt template (owner only)
  app.delete(
    '/api/prompts/:id',
    {
      preHandler: [webPortalAuthMiddleware],
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || user.role !== 'owner') {
        return reply
          .code(403)
          .send({ error: 'Access denied. Owner role required.' });
      }
      return { success: true };
    }
  );

  // POST /api/prompts/test - Test a prompt template (owner only)
  app.post(
    '/api/prompts/test',
    {
      preHandler: [webPortalAuthMiddleware],
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || user.role !== 'owner') {
        return reply
          .code(403)
          .send({ error: 'Access denied. Owner role required.' });
      }
      return {
        response: 'Test response from AI',
        tokens_used: 150,
        execution_time: 1234,
      };
    }
  );

  // POST /api/prompts/export - Export prompt templates (owner only)
  app.post(
    '/api/prompts/export',
    {
      preHandler: [webPortalAuthMiddleware],
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || user.role !== 'owner') {
        return reply
          .code(403)
          .send({ error: 'Access denied. Owner role required.' });
      }
      const { prompt_ids } = request.body as { prompt_ids: string[] };
      return {
        templates: [
          {
            id: 'prompt-001',
            name: 'Network Diagnostics',
            category: 'diagnostics',
            template:
              'Analyze the following network issue: {{issue_description}}',
            variables: ['issue_description'],
            is_active: true,
            tags: ['network', 'diagnostics'],
            description: 'Template for network diagnostic analysis',
          },
        ],
      };
    }
  );

  // POST /api/prompts/import - Import prompt templates (owner only)
  app.post(
    '/api/prompts/import',
    {
      preHandler: [webPortalAuthMiddleware],
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || user.role !== 'owner') {
        return reply
          .code(403)
          .send({ error: 'Access denied. Owner role required.' });
      }
      const { templates } = request.body as { templates: any[] };
      return {
        imported_count: templates.length,
      };
    }
  );

  // GET /api/prompts/:id/history - Get version history (owner only)
  app.get(
    '/api/prompts/:id/history',
    {
      preHandler: [webPortalAuthMiddleware],
    },
    async (request, reply) => {
      const { user } = request;
      if (!user || user.role !== 'owner') {
        return reply
          .code(403)
          .send({ error: 'Access denied. Owner role required.' });
      }
      const { id } = request.params as { id: string };
      return {
        versions: [
          {
            id: `version-001`,
            version: 1,
            template: 'Original template content',
            created_at: new Date().toISOString(),
            created_by: 'user-001',
            change_notes: 'Initial version',
          },
        ],
      };
    }
  );
}
