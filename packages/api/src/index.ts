import { createApp, startServer, gracefulShutdown } from './server';

async function main(): Promise<void> {
  const app = await createApp();

  // Register signal handlers
  process.on('SIGTERM', () => {
    app.log.info('SIGTERM received, starting graceful shutdown');
    void gracefulShutdown(app).then(() => {
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    app.log.info('SIGINT received, starting graceful shutdown');
    void gracefulShutdown(app).then(() => {
      process.exit(0);
    });
  });

  try {
    await startServer(app);
    const address = app.server.address();
    const url =
      typeof address === 'string'
        ? address
        : address
          ? `http://${address.address}:${address.port}`
          : 'unknown';
    app.log.info(`Server listening on ${url}`);
  } catch (error) {
    app.log.error(error, 'Failed to start server');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
