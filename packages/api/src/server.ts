import fastify, { type FastifyInstance } from 'fastify';

export function createApp(): FastifyInstance {
  const app = fastify({
    logger: true,
    // In production behind ALB, terminate TLS at the load balancer.
    trustProxy: true,
  });

  // Health and readiness endpoints for ECS target group checks
  void app.get('/healthz', () => ({ status: 'ok' }));
  void app.get('/readyz', () => ({ ready: true }));

  // Version endpoint placeholder
  void app.get('/version', () => ({
    version: process.env.APP_VERSION ?? '0.0.1',
  }));

  return app;
}

export async function startApp(): Promise<FastifyInstance> {
  const app = createApp();

  const port = parseInt(process.env.PORT ?? '3000', 10);
  const host = process.env.HOST ?? '0.0.0.0';

  // Graceful shutdown for ECS draining
  const onShutdown = async (): Promise<void> => {
    try {
      app.log.info('Received shutdown signal, closing server...');
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => {
    void onShutdown();
  });
  process.on('SIGINT', () => {
    void onShutdown();
  });

  await app.listen({ port, host });
  return app;
}
