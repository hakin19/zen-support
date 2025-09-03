import fastify, { type FastifyInstance } from 'fastify';

export function createApp(): FastifyInstance {
  const app = fastify({
    logger: true,
    // In production behind ALB, terminate TLS at the load balancer.
    trustProxy: true,
  });

  // TODO: Add authentication middleware
  // - Device auth: Session tokens via /api/v1/device/auth endpoint, stored in Redis with 7-day TTL
  // - Customer auth: Validate Supabase access JWTs only (refresh handled by client via Supabase Auth)

  // Health and readiness endpoints for ECS target group checks (public, no auth)
  void app.get('/healthz', () => ({ status: 'ok' })); // Liveness: always 200 if running

  // TODO: Implement proper readiness with dependency checks
  // - Check Supabase: SELECT 1
  // - Check Redis: PING
  // - Return 503 if any dependency fails (prevents ECS from routing traffic)
  void app.get('/readyz', () => ({ ready: true })); // Placeholder - must check deps!

  // Version endpoint (public - minimal info only)
  void app.get('/version', () => ({
    version: process.env.APP_VERSION ?? '0.0.1',
    // NOTE: Environment and build info only available via authenticated /api/v1/customer/system/info
  }));

  return app;
}

export async function startApp(): Promise<FastifyInstance> {
  const app = createApp();

  const port = parseInt(process.env.PORT ?? '3000', 10);
  const host = process.env.HOST ?? '0.0.0.0';

  // TODO: Configure timeouts for ALB compatibility
  // - server.keepAliveTimeout = 55000 (55s, below ALB's 60s)
  // - server.headersTimeout = 56000 (56s)
  // - Fastify requestTimeout = 50000 (50s)

  // Graceful shutdown for ECS draining
  const onShutdown = async (): Promise<void> => {
    try {
      app.log.info('Received SIGTERM, starting graceful shutdown...');

      // TODO: Implement full shutdown sequence:
      // 1. Stop accepting new connections (app.server.close())
      // 2. Close all WebSocket connections with code 1001
      // 3. Wait for in-flight requests (max 30s)
      // 4. Close Redis and Supabase connections
      // 5. Exit cleanly

      await app.close(); // This closes HTTP server and waits for requests
      app.log.info('Graceful shutdown complete');
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
