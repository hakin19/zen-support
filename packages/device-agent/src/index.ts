/**
 * Aizen vNE Device Agent
 * Main entry point for the containerized device agent
 */

import http from 'http';

import { ConfigLoader } from './config.js';
import { DeviceAgent } from './device-agent.js';

import type { DeviceConfig } from './types.js';

// Global agent instance
let agent: DeviceAgent | null = null;
let healthServer: http.Server | null = null;

/**
 * Create and start health check server
 */
function startHealthServer(port: number): void {
  healthServer = http.createServer((req, res) => {
    if (req.url === '/health') {
      const health = agent?.getHealthStatus() ?? {
        status: 'unhealthy',
        error: 'Agent not initialized',
      };

      const statusCode = health.status === 'healthy' ? 200 : 503;
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(health));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  healthServer.listen(port, () => {
    console.log(`✅ Health check server listening on port ${port}`);
  });
}

/**
 * Graceful shutdown handler
 */
async function handleShutdown(signal: string): Promise<void> {
  console.log(`\n⚠️  Received ${signal}, initiating graceful shutdown...`);

  try {
    // Stop the agent
    if (agent) {
      console.log('🛑 Stopping device agent...');
      agent.shutdown();
      console.log('✅ Device agent stopped');
    }

    // Close health check server
    if (healthServer) {
      console.log('🛑 Closing health check server...');
      await new Promise<void>((resolve, reject) => {
        healthServer.close(err => {
          if (err) reject(err);
          else resolve();
        });
      });
      console.log('✅ Health check server closed');
    }

    console.log('👋 Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

/**
 * Main application startup
 */
async function main(): Promise<void> {
  console.log('🚀 Starting Aizen vNE Device Agent...');

  try {
    // Load configuration from environment
    const config: DeviceConfig = ConfigLoader.load();
    ConfigLoader.printConfig(config);

    // Create device agent instance
    agent = new DeviceAgent(config);

    // Set up event listeners
    agent.on('started', () => {
      console.log('✅ Device agent started successfully');
    });

    agent.on('registered', () => {
      console.log('✅ Device registered with cloud API');
    });

    agent.on('heartbeat', () => {
      console.log('💓 Heartbeat sent');
    });

    agent.on('command:received', (command: unknown) => {
      const cmd = command as { type: string; id: string };
      console.log(`📋 Command received: ${cmd.type} (${cmd.id})`);
    });

    agent.on('error', error => {
      console.error('❌ Agent error:', error);
    });

    agent.on('heartbeat:error', error => {
      console.error('❌ Heartbeat error:', error);
    });

    // Start health check server
    const healthPort = parseInt(process.env.PORT ?? '3000', 10);
    startHealthServer(healthPort);

    // Register shutdown handlers
    process.on('SIGTERM', () => void handleShutdown('SIGTERM'));
    process.on('SIGINT', () => void handleShutdown('SIGINT'));
    process.on('SIGHUP', () => void handleShutdown('SIGHUP'));

    // Handle uncaught errors
    process.on('uncaughtException', error => {
      console.error('❌ Uncaught exception:', error);
      void handleShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
      void handleShutdown('unhandledRejection');
    });

    // Start the agent
    await agent.start();

    // Keep the process alive
    console.log('🎯 Device agent is running. Press Ctrl+C to stop.');
  } catch (error) {
    console.error('❌ Failed to start device agent:', error);
    process.exit(1);
  }
}

// Start the application
void main().catch((error: unknown) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

// Export for testing purposes
export { DeviceAgent, ConfigLoader };
export type { DeviceConfig } from './types.js';
