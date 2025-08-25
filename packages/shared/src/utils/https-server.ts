/**
 * HTTPS Server Configuration Utility
 * Provides common HTTPS setup for all services
 */

import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';

import type { Express } from 'express';

export interface HttpsServerConfig {
  app: Express;
  port: number;
  httpsPort?: number;
  certPath?: string;
  keyPath?: string;
  httpsEnabled?: boolean;
}

export interface ServerInstances {
  httpServer: http.Server;
  httpsServer?: https.Server;
}

/**
 * Creates HTTP and optionally HTTPS servers for an Express app
 */
export function createServers(config: HttpsServerConfig): ServerInstances {
  const {
    app,
    port,
    httpsPort = port + 443,
    certPath = process.env.SSL_CERT_PATH,
    keyPath = process.env.SSL_KEY_PATH,
    httpsEnabled = process.env.HTTPS_ENABLED === 'true',
  } = config;

  // Always create HTTP server
  const httpServer = http.createServer(app);

  // Create HTTPS server if enabled and certificates exist
  let httpsServer: https.Server | undefined;

  if (httpsEnabled && certPath && keyPath) {
    try {
      // Check if certificate files exist
      if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
        const httpsOptions: https.ServerOptions = {
          cert: fs.readFileSync(certPath),
          key: fs.readFileSync(keyPath),
        };

        httpsServer = https.createServer(httpsOptions, app);
        console.log('✅ HTTPS server configured with SSL certificates');
      } else {
        console.warn('⚠️  SSL certificates not found, HTTPS disabled');
        console.warn(`   Cert path: ${certPath}`);
        console.warn(`   Key path: ${keyPath}`);
      }
    } catch (error) {
      console.error('❌ Failed to load SSL certificates:', error);
      console.warn('⚠️  Falling back to HTTP only');
    }
  }

  return { httpServer, httpsServer };
}

/**
 * Starts HTTP and HTTPS servers
 */
export async function startServers(
  servers: ServerInstances,
  httpPort: number,
  httpsPort?: number,
  hostname = '0.0.0.0'
): Promise<void> {
  const { httpServer, httpsServer } = servers;

  return new Promise((resolve, reject) => {
    let serversStarted = 0;
    const totalServers = httpsServer ? 2 : 1;

    const checkAllStarted = () => {
      serversStarted++;
      if (serversStarted === totalServers) {
        resolve();
      }
    };

    // Start HTTP server
    httpServer.listen(httpPort, hostname, () => {
      console.log(`🚀 HTTP server listening on http://${hostname}:${httpPort}`);
      checkAllStarted();
    });

    httpServer.on('error', error => {
      console.error('HTTP server error:', error);
      reject(error);
    });

    // Start HTTPS server if available
    if (httpsServer && httpsPort) {
      httpsServer.listen(httpsPort, hostname, () => {
        console.log(
          `🔒 HTTPS server listening on https://${hostname}:${httpsPort}`
        );
        console.log(`   Access via: https://api.aizen.local:${httpsPort}`);
        checkAllStarted();
      });

      httpsServer.on('error', error => {
        console.error('HTTPS server error:', error);
        reject(error);
      });
    }
  });
}

/**
 * Gracefully shuts down servers
 */
export async function shutdownServers(servers: ServerInstances): Promise<void> {
  const { httpServer, httpsServer } = servers;

  const promises: Promise<void>[] = [];

  // Shutdown HTTP server
  promises.push(
    new Promise(resolve => {
      httpServer.close(() => {
        console.log('HTTP server closed');
        resolve();
      });
    })
  );

  // Shutdown HTTPS server if exists
  if (httpsServer) {
    promises.push(
      new Promise(resolve => {
        httpsServer.close(() => {
          console.log('HTTPS server closed');
          resolve();
        });
      })
    );
  }

  await Promise.all(promises);
}

/**
 * Creates HTTPS redirect middleware
 */
export function httpsRedirectMiddleware(httpsPort: number) {
  return (req: any, res: any, next: any) => {
    if (!req.secure && req.get('X-Forwarded-Proto') !== 'https') {
      const host = req.get('Host')?.split(':')[0] || 'localhost';
      return res.redirect(`https://${host}:${httpsPort}${req.url}`);
    }
    next();
  };
}

/**
 * Gets environment-based server configuration
 */
export function getServerConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  const httpsEnabled = process.env.HTTPS_ENABLED === 'true';

  return {
    httpsEnabled,
    httpPort: parseInt(process.env.PORT || '3000', 10),
    httpsPort: parseInt(process.env.HTTPS_PORT || '3443', 10),
    certPath: process.env.SSL_CERT_PATH,
    keyPath: process.env.SSL_KEY_PATH,
    trustProxy: isProduction,
    forceHttps: isProduction && httpsEnabled,
  };
}
